/**
 * Developer writes of AI sessions (K5, token scope dev:write — docs/api-v1.md
 * "Development", docs/mcp.md). Authorization is the caller's (runV1Write:
 * scope dev:write ∩ project role "dev.write"); `actor` is the token owner.
 *
 * - 作業の宣言 (work claims): who works on a PBI or one of its tasks, from which
 *   session, on which branch. One active claim per target: claiming what another
 *   user / session holds is refused (409 TASK_CLAIMED with the holders — AI
 *   sessions run unattended, a warning would be ignored); `takeover` ends stale
 *   claims or the caller's own other sessions (logged + previous holder
 *   notified). Same user + session + target refreshes the existing claim.
 *   Claims go stale without a heartbeat (dev-work.rules). Claims and heartbeats
 *   are not in the activity log (they would flood it; takeovers are) and change
 *   no PBI / task state: moving a task stays the human's (or task:write's) call.
 * - Progress comments: a normal comment through the comment service, so
 *   mentions, notifications, translation and the activity log are the UI's;
 *   the comment row records `via` (api / mcp) from the actor.
 * - MR links: a merge request of a repository registered in the project's
 *   (enabled) Git integration becomes a git_link of kind "mr" marked declared
 *   (declaredBy / declaredAt). Idempotent on (repository, MR, PBI); an MR the
 *   sync already linked is answered as is. Its data comes from the sync (the
 *   same MR linked to another PBI, else title "!<iid>" and state null until the
 *   next sync); the sync keeps it current. A declared-only link is display: it
 *   never drives auto-complete, release readiness or delivery insights.
 */
import { parseMergeRequestUrl } from "@/lib/git/repo-url"
import { logger } from "@/lib/logger"
import { publishAfterCommit } from "@/lib/realtime/after-commit"
import type { Actor } from "@/services/_shared/actor"
import { LABEL_MAX, logActivity } from "@/services/_shared/activity"
import { defaultDb, withTransaction, type Db } from "@/services/_shared/db"
import { ConflictError, ForbiddenError, isUniqueViolation, NotFoundError, StatusError, ValidationError } from "@/services/_shared/errors"
import { notify } from "@/services/_shared/notifications"
import { createComment } from "@/services/comments/comments.service"
import * as repo from "./dev-work.repository"
import {
  canTakeOver,
  claimConflicts,
  claimSettings,
  isClaimActive,
  overlappingClaims,
  staleBefore,
  toClaimDto,
  toHolderDto,
  type ClaimDto,
  type ClaimRow,
  type ClaimSettings,
} from "./dev-work.rules"
import type { ClaimWorkInput, HeartbeatClaimInput, ListClaimsQuery, MrLinkInput, ProgressCommentInput } from "./dev-work.schemas"

export type { ClaimDto, ClaimHolderDto } from "./dev-work.rules"

const log = logger.child({ module: "dev-work" })

/** "12" / "PBI-12" → number, anything else → internal id (same rule as /api/v1 PBI refs). */
function pbiRef(ref: string): { id: string } | { displayId: number } {
  const m = /^(?:pbi-?)?(\d{1,9})$/i.exec(ref.trim())
  return m ? { displayId: Number(m[1]) } : { id: ref.trim() }
}

async function loadPbi(db: Db, projectId: string, ref: string) {
  const pbi = await repo.findPbi(db, projectId, pbiRef(ref))
  if (!pbi) throw new NotFoundError("PBI not found", {}, "PBI_NOT_FOUND")
  return pbi
}

function pbiLabel(pbi: { displayId: number; initiative: string | null; userStory: string | null }): string {
  const head = (pbi.initiative || pbi.userStory || "").trim().split(/\r?\n/)[0]?.trim() ?? ""
  const text = head ? `#${pbi.displayId} ${head}` : `#${pbi.displayId}`
  return text.length > LABEL_MAX ? `${text.slice(0, LABEL_MAX - 1)}…` : text
}

// ------------------------------------------------------------- work claims

/** Unreleased claims older than this are no longer listed (they are history). */
const CLAIM_LIST_LOOKBACK_HOURS = 7 * 24

/** Claim transactions read after the PBI lock; see repo.lockPbi. */
const CLAIM_TX = { isolationLevel: "ReadCommitted" } as const

let warnedSettings = false

/** The claim settings; an unusable env value is logged once per process (the default is used). */
function settings(): ClaimSettings {
  const s = claimSettings()
  if (s.invalid.length > 0 && !warnedSettings) {
    warnedSettings = true
    log.warn("invalid work-claim setting ignored, default used", { variables: s.invalid, staleHours: s.staleHours, maxOpenPerUser: s.maxOpenPerUser })
  }
  return s
}

/** Test helper: log the invalid-settings warning again. */
export function resetClaimSettingsWarning(): void {
  warnedSettings = false
}

export interface ClaimResult {
  claim: ClaimDto
  /** false = the caller's existing claim (same user, session and target) was refreshed. */
  created: boolean
  /** The caller's other sessions' claims this call ended with `takeover: true`. */
  takenOver: ClaimDto[]
  /** Stale claims (any user) on the target that this new claim superseded. */
  superseded: ClaimDto[]
}

/** 409 TASK_CLAIMED naming who holds the target (AI sessions run unattended: a refusal, not a warning). */
function claimedError(blockers: readonly ClaimRow[], hours: number, viewerId: string): ConflictError {
  return new ConflictError(
    "Someone else (or another session) is working on this. Coordinate with them, or pass takeover: true if the claim is your own other session.",
    { holders: blockers.map((b) => toHolderDto(b, hours, viewerId)) },
    "TASK_CLAIMED",
  )
}

function claimEntity(claim: ClaimRow): { entityType: "sprint_task" | "pbi"; entityId: string; label: string } {
  if (claim.task) {
    const name = claim.task.taskName?.trim()
    return { entityType: "sprint_task", entityId: claim.task.id, label: (name || pbiLabel(claim.backlogItem)).slice(0, LABEL_MAX) }
  }
  return { entityType: "pbi", entityId: claim.backlogItemId, label: pbiLabel(claim.backlogItem) }
}

/**
 * A claim ended by someone else than its session: activity row on the task / PBI and,
 * for another user's claim, a notification (notify never notifies the actor).
 */
async function recordEnd(tx: Db, projectId: string, previous: ClaimRow, reason: "takeover" | "stale" | "moderator", actor: Actor, newSessionId: string | null): Promise<void> {
  const target = claimEntity(previous)
  await logActivity(tx, {
    projectId,
    entityType: target.entityType,
    entityId: target.entityId,
    action: "update",
    actor,
    diff: {
      label: target.label,
      meta: { claimEnded: { claimId: previous.id, reason, from: { userId: previous.userId, userName: previous.user.name }, ...(newSessionId ? { toSessionId: newSessionId } : {}) } },
    },
  })
  if (reason === "takeover") return
  await notify(tx, {
    recipientIds: [previous.userId],
    actorId: actor.userId,
    type: "work_claim_ended",
    projectId,
    entityType: target.entityType,
    entityId: target.entityId,
    payload: { entityLabel: target.label, actorName: actor.userName, reason, ...(previous.task ? { sprintId: previous.task.sprintId } : {}) },
    dedupeKey: `work_claim_ended:${previous.id}`,
  })
}

/** Active claims on the PBI for a blocking decision; more than the bound is an error, never a silent miss. */
async function activeClaimsOnPbi(tx: Db, backlogItemId: string, since: Date): Promise<ClaimRow[]> {
  const rows = await repo.findActiveClaimsOnPbi(tx, backlogItemId, since)
  if (rows.length > repo.ACTIVE_CLAIMS_PER_PBI_LIMIT) {
    log.error("too many active work claims on one PBI to decide safely", { backlogItemId, limit: repo.ACTIVE_CLAIMS_PER_PBI_LIMIT })
    throw new StatusError(503, "Too many active work claims on this PBI; release stale ones and retry", {}, "SERVICE_UNAVAILABLE")
  }
  return rows
}

/**
 * Declare work on a PBI (`pbi`) or one sprint task (`taskId`):
 * - one active claim per target: an overlapping active claim of another user or of
 *   another session → 409 TASK_CLAIMED (holders; another user's session id hidden);
 * - `takeover: true` ends the overlapping active claims only when all are the caller's
 *   own other sessions (another user's active claim: still 409);
 * - stale overlapping claims (any user) never block; a new or refreshed claim supersedes
 *   them (ended with reason "stale", logged, holder notified);
 * - same user + session + target refreshes (and revives) the claim (200);
 * - at most DEV_CLAIM_MAX_OPEN_PER_USER active claims per user and project (409 CLAIM_LIMIT_REACHED).
 *
 * Concurrency: READ COMMITTED transaction; the PBI row lock is taken before any claim
 * row is read, so concurrent claims of one PBI are decided one after another on
 * committed data (repo.lockPbi).
 */
export async function claimWork(projectId: string, input: ClaimWorkInput, actor: Actor, now: Date = new Date()): Promise<ClaimResult> {
  const { staleHours: hours, maxOpenPerUser } = settings()
  const since = staleBefore(now, hours)
  return withTransaction(async (tx) => {
    let backlogItemId: string
    let taskId: string | null = null
    // Only resolves ids (no claim data): what decides is read after the lock.
    if (input.taskId !== undefined) {
      const task = await repo.findTask(tx, projectId, input.taskId)
      if (!task) throw new NotFoundError("Task not found")
      backlogItemId = task.pbItemId
      taskId = task.id
    } else {
      backlogItemId = (await loadPbi(tx, projectId, input.pbi ?? "")).id
    }
    await repo.lockPbi(tx, backlogItemId)
    const key = { userId: actor.userId, sessionId: input.sessionId, backlogItemId, taskId }
    const own = await repo.findOwnOpenClaim(tx, key)
    const candidate = { ...key, id: own?.id ?? "", heartbeatAt: now, releasedAt: null }
    const blockers = claimConflicts(candidate, await activeClaimsOnPbi(tx, backlogItemId, since), now, hours)
    if (blockers.length > 0 && !(input.takeover && canTakeOver(blockers, actor.userId))) throw claimedError(blockers, hours, actor.userId)
    const stale = overlappingClaims(candidate, await repo.findStaleClaimsOnPbi(tx, backlogItemId, since))

    const ended: Array<{ row: ClaimRow; reason: "takeover" | "stale" }> = [
      ...blockers.map((row) => ({ row, reason: "takeover" as const })),
      ...stale.map((row) => ({ row, reason: "stale" as const })),
    ]
    for (const { row, reason } of ended) {
      if ((await repo.endClaims(tx, [row.id], { releasedAt: now, releaseReason: reason, releasedById: actor.userId })) === 0) continue
      await recordEnd(tx, projectId, row, reason, actor, input.sessionId)
    }

    let claim: ClaimRow
    if (own) {
      const branch = input.branch !== undefined ? { branch: input.branch } : {}
      if ((await repo.touchOpenClaim(tx, own.id, { heartbeatAt: now, ...branch })) === 0) throw releasedError()
      claim = await reloadClaim(tx, projectId, own.id)
    } else {
      if ((await repo.countActiveClaimsOfUser(tx, projectId, actor.userId, since)) >= maxOpenPerUser) {
        throw new ConflictError(`You already hold ${maxOpenPerUser} active work claims in this project; release finished work first`, { limit: maxOpenPerUser }, "CLAIM_LIMIT_REACHED")
      }
      claim = await repo.createClaim(tx, { projectId, ...key, branch: input.branch ?? null, heartbeatAt: now })
    }
    const asEnded = (r: ClaimRow, reason: string) => toClaimDto({ ...r, releasedAt: now, releaseReason: reason }, now, hours, actor.userId)
    return {
      claim: toClaimDto(claim, now, hours, actor.userId),
      created: !own,
      takenOver: blockers.map((r) => asEnded(r, "takeover")),
      superseded: stale.map((r) => asEnded(r, "stale")),
    }
  }, CLAIM_TX)
}

function releasedError(): ConflictError {
  return new ConflictError("The claim was released or taken over; claim the work again", {}, "CLAIM_RELEASED")
}

async function reloadClaim(db: Db, projectId: string, claimId: string): Promise<ClaimRow> {
  const row = await repo.findClaim(db, projectId, claimId)
  if (!row) throw new NotFoundError("Claim not found")
  return row
}

/**
 * Heartbeat (optionally a new branch) by any token of the claim's user — claims belong
 * to the user, the session id only tells the user's sessions apart. Inside the locked
 * READ COMMITTED transaction: a claim released or taken over meanwhile → 409
 * CLAIM_RELEASED (conditional update); a stale claim is revived only while nobody else
 * claimed the target (else 409 TASK_CLAIMED).
 */
export async function heartbeatClaim(
  projectId: string,
  claimId: string,
  input: HeartbeatClaimInput,
  actor: Actor,
  now: Date = new Date(),
): Promise<{ claim: ClaimDto }> {
  const { staleHours: hours } = settings()
  const first = await reloadClaim(defaultDb, projectId, claimId)
  if (first.userId !== actor.userId) throw new ForbiddenError("Only the user who made the claim can change it", {}, "FORBIDDEN")
  return withTransaction(async (tx) => {
    await repo.lockPbi(tx, first.backlogItemId)
    const claim = await reloadClaim(tx, projectId, claimId)
    if (claim.releasedAt) throw releasedError()
    if (!isClaimActive(claim, now, hours)) {
      const blockers = claimConflicts(claim, await activeClaimsOnPbi(tx, claim.backlogItemId, staleBefore(now, hours)), now, hours)
      if (blockers.length > 0) throw claimedError(blockers, hours, actor.userId)
    }
    const branch = input.branch !== undefined ? { branch: input.branch } : {}
    if ((await repo.touchOpenClaim(tx, claim.id, { heartbeatAt: now, ...branch })) === 0) throw releasedError()
    return { claim: toClaimDto(await reloadClaim(tx, projectId, claim.id), now, hours, actor.userId) }
  }, CLAIM_TX)
}

/**
 * Release a claim. Its user (any of their sessions) may always; a PO / SM / admin
 * (`canModerate`, the route checks sprint.manage) may release anyone's claim — logged on
 * the task / PBI and the holder notified. Releasing a released claim answers it unchanged.
 */
export async function releaseClaim(
  projectId: string,
  claimId: string,
  actor: Actor,
  options: { canModerate: boolean },
  now: Date = new Date(),
): Promise<{ claim: ClaimDto }> {
  const { staleHours: hours } = settings()
  const first = await reloadClaim(defaultDb, projectId, claimId)
  const own = first.userId === actor.userId
  if (!own && !options.canModerate) {
    throw new ForbiddenError("Only the claim's user, or a Product Owner / Scrum Master, can release it", {}, "FORBIDDEN")
  }
  return withTransaction(async (tx) => {
    await repo.lockPbi(tx, first.backlogItemId)
    const reason = own ? "released" : "moderator"
    const count = await repo.endClaims(tx, [claimId], { releasedAt: now, releaseReason: reason, releasedById: own ? null : actor.userId })
    const claim = await reloadClaim(tx, projectId, claimId)
    if (count > 0 && !own) await recordEnd(tx, projectId, claim, "moderator", actor, null)
    return { claim: toClaimDto(claim, now, hours, actor.userId) }
  }, CLAIM_TX)
}

/**
 * Open claims of the project, newest heartbeat first: active ones and stale ones
 * (`stale: true`, heartbeat within the last 7 days), at most CLAIM_LIST_LIMIT
 * (`truncated` when cut). Session ids only on the viewer's own claims.
 */
export async function listClaims(projectId: string, query: ListClaimsQuery, viewerId: string, now: Date = new Date()) {
  const { staleHours: hours } = settings()
  const filter: { backlogItemId?: string; taskId?: string } = {}
  if (query.pbi !== undefined) filter.backlogItemId = (await loadPbi(defaultDb, projectId, query.pbi)).id
  if (query.taskId !== undefined) filter.taskId = query.taskId
  const rows = await repo.findOpenClaims(defaultDb, projectId, staleBefore(now, CLAIM_LIST_LOOKBACK_HOURS), filter)
  const truncated = rows.length > repo.CLAIM_LIST_LIMIT
  return {
    data: rows.slice(0, repo.CLAIM_LIST_LIMIT).map((r) => toClaimDto(r, now, hours, viewerId)),
    staleAfterHours: hours,
    ...(truncated ? { truncated: true, limit: repo.CLAIM_LIST_LIMIT } : {}),
  }
}

// -------------------------------------------------------- progress comment

/** A progress comment on a PBI (id / "12" / "PBI-12") or a sprint task, as the token user. */
export async function postProgress(projectId: string, input: ProgressCommentInput, actor: Actor, canModerate: boolean) {
  const entityId = input.entityType === "pbi" ? (await loadPbi(defaultDb, projectId, input.entityId)).id : input.entityId
  return createComment(projectId, { entityType: input.entityType, entityId, body: input.body }, actor, canModerate)
}

// ----------------------------------------------------------------- MR link

export interface DeclaredLinkDto {
  id: string
  kind: string
  ref: string
  title: string
  url: string
  state: string | null
  repository: { id: string; name: string }
  pbi: { id: string; displayId: number }
  /** true = linked by a developer (dev:write); false = found by the sync. */
  declared: boolean
  declaredAt: string | null
  declaredBy: { id: string; name: string } | null
  createdAt: string
}

type LinkRow = NonNullable<Awaited<ReturnType<typeof repo.findLink>>>

function toLinkDto(row: LinkRow, pbi: { id: string; displayId: number }): DeclaredLinkDto {
  return {
    id: row.id,
    kind: row.kind,
    ref: row.ref,
    title: row.title,
    url: row.url,
    state: row.state,
    repository: row.repository,
    pbi: { id: pbi.id, displayId: pbi.displayId },
    declared: row.declaredAt !== null,
    declaredAt: row.declaredAt?.toISOString() ?? null,
    declaredBy: row.declaredBy,
    createdAt: row.createdAt.toISOString(),
  }
}

/** Link a merge request (URL of a repository registered in the project) to a PBI; see the file comment. */
export async function linkMergeRequest(projectId: string, input: MrLinkInput, actor: Actor, now: Date = new Date()): Promise<{ link: DeclaredLinkDto; created: boolean }> {
  const mr = parseMergeRequestUrl(input.url)
  if (!mr) {
    throw new ValidationError("Not a merge request URL (https://<allowed host>/<group>/<repo>/-/merge_requests/<number>)", {}, "MR_URL_INVALID")
  }
  const pbi = await loadPbi(defaultDb, projectId, input.pbi)
  const repository = await repo.findRegisteredRepository(defaultDb, projectId, mr.apiBase, mr.repoPath)
  if (!repository) {
    throw new ValidationError("The merge request's repository is not registered in this project's Git integration", {}, "MR_REPOSITORY_NOT_REGISTERED")
  }
  const key: repo.LinkKey = { repositoryId: repository.id, kind: "mr", ref: String(mr.iid), backlogItemId: pbi.id }
  const existing = await repo.findLink(defaultDb, key)
  if (existing) return { link: toLinkDto(existing, pbi), created: false }
  // The sync may already know this MR (linked to another PBI): start from its real data.
  // Otherwise title "!<iid>" and state null (unknown) until the next sync reads the MR.
  const synced = await repo.findSyncedMergeRequest(defaultDb, repository.id, key.ref)
  try {
    const row = await withTransaction(async (tx) => {
      const created = await repo.createDeclaredLink(tx, {
        projectId,
        ...key,
        url: mr.url,
        declaredById: actor.userId,
        declaredAt: now,
        ...(synced ?? { title: `!${mr.iid}`, occurredAt: now }),
      })
      await logActivity(tx, {
        projectId,
        entityType: "pbi",
        entityId: pbi.id,
        action: "update",
        actor,
        diff: { label: pbiLabel(pbi), meta: { gitLink: { kind: "mr", ref: key.ref, repository: repository.name, url: mr.url } } },
      })
      publishAfterCommit({ type: "git", projectId, action: "link" })
      return created
    })
    return { link: toLinkDto(row, pbi), created: true }
  } catch (error) {
    // Two requests linked the same MR at once: the other one won, answer its row.
    if (!isUniqueViolation(error)) throw error
    const winner = await repo.findLink(defaultDb, key)
    if (!winner) throw error
    return { link: toLinkDto(winner, pbi), created: false }
  }
}
