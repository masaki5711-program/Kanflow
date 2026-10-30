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
 *   sync already linked is answered as is. The sync keeps refreshing its
 *   title / state (git-sync refreshDeclaredLinks).
 */
import { parseMergeRequestUrl } from "@/lib/git/repo-url"
import { publishAfterCommit } from "@/lib/realtime/after-commit"
import type { Actor } from "@/services/_shared/actor"
import { LABEL_MAX, logActivity } from "@/services/_shared/activity"
import { defaultDb, withTransaction, type Db } from "@/services/_shared/db"
import { ConflictError, ForbiddenError, isUniqueViolation, NotFoundError, ValidationError } from "@/services/_shared/errors"
import { notify } from "@/services/_shared/notifications"
import { createComment } from "@/services/comments/comments.service"
import * as repo from "./dev-work.repository"
import {
  canTakeOver,
  claimConflicts,
  claimStaleHours,
  isClaimActive,
  overlappingClaims,
  staleBefore,
  toClaimDto,
  toHolderDto,
  type ClaimDto,
  type ClaimRow,
} from "./dev-work.rules"
import type { ClaimWorkInput, HeartbeatClaimInput, ListClaimsQuery, MrLinkInput, ProgressCommentInput } from "./dev-work.schemas"

export type { ClaimDto, ClaimHolderDto } from "./dev-work.rules"

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

export interface ClaimResult {
  claim: ClaimDto
  /** false = the caller's existing claim (same user, session and target) was refreshed. */
  created: boolean
  /** Claims this call ended with `takeover: true` (stale ones, or the caller's other sessions). */
  takenOver: ClaimDto[]
}

/** 409 TASK_CLAIMED naming who holds the target (AI sessions run unattended: a refusal, not a warning). */
function claimedError(blockers: readonly ClaimRow[], hours: number): ConflictError {
  return new ConflictError(
    "Someone else (or another session) is working on this. Coordinate with them, or pass takeover: true if the claim is your own other session.",
    { holders: blockers.map((b) => toHolderDto(b, hours)) },
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

/** Activity row + notification to the previous holder (notify never notifies the actor: a user's own session gets none). */
async function recordTakeover(tx: Db, projectId: string, previous: ClaimRow, sessionId: string, actor: Actor, now: Date, hours: number): Promise<void> {
  const target = claimEntity(previous)
  const stale = !isClaimActive(previous, now, hours)
  await logActivity(tx, {
    projectId,
    entityType: target.entityType,
    entityId: target.entityId,
    action: "update",
    actor,
    diff: {
      label: target.label,
      meta: { claimTakeover: { claimId: previous.id, from: { userId: previous.userId, userName: previous.user.name, sessionId: previous.sessionId }, toSessionId: sessionId, stale } },
    },
  })
  await notify(tx, {
    recipientIds: [previous.userId],
    actorId: actor.userId,
    type: "work_claim_taken_over",
    projectId,
    entityType: target.entityType,
    entityId: target.entityId,
    payload: { entityLabel: target.label, actorName: actor.userName, sessionId: previous.sessionId, ...(previous.task ? { sprintId: previous.task.sprintId } : {}) },
    dedupeKey: `work_claim_taken_over:${previous.id}`,
  })
}

/**
 * Declare work on a PBI (`pbi`) or one sprint task (`taskId`). One active claim per
 * target: an overlapping active claim of another user or session → 409 TASK_CLAIMED
 * (holders). `takeover: true` ends the overlapping claims instead — only when every
 * active one is the caller's own other session (stale claims never block anyway);
 * each one ended is logged and its holder notified. Same user + session + target
 * refreshes the claim (200).
 */
export async function claimWork(projectId: string, input: ClaimWorkInput, actor: Actor, now: Date = new Date()): Promise<ClaimResult> {
  const hours = claimStaleHours()
  return withTransaction(async (tx) => {
    let backlogItemId: string
    let taskId: string | null = null
    if (input.taskId !== undefined) {
      const task = await repo.findTask(tx, projectId, input.taskId)
      if (!task) throw new NotFoundError("Task not found")
      backlogItemId = task.pbItemId
      taskId = task.id
    } else {
      backlogItemId = (await loadPbi(tx, projectId, input.pbi ?? "")).id
    }
    await repo.lockPbi(tx, backlogItemId)
    const open = await repo.findOpenClaimsOnPbi(tx, backlogItemId)
    const own = open.find((c) => c.userId === actor.userId && c.sessionId === input.sessionId && c.taskId === taskId)
    const candidate = { id: own?.id ?? "", backlogItemId, taskId, userId: actor.userId, sessionId: input.sessionId, heartbeatAt: now, releasedAt: null }
    const blockers = claimConflicts(candidate, open, now, hours)
    if (blockers.length > 0 && !(input.takeover && canTakeOver(blockers, actor.userId))) throw claimedError(blockers, hours)
    const superseded = input.takeover ? overlappingClaims(candidate, open) : []
    if (superseded.length > 0) {
      await repo.releaseClaims(tx, superseded.map((c) => c.id), now)
      for (const previous of superseded) await recordTakeover(tx, projectId, previous, input.sessionId, actor, now, hours)
    }
    const claim = own
      ? await repo.updateClaim(tx, own.id, { heartbeatAt: now, ...(input.branch !== undefined ? { branch: input.branch } : {}) })
      : await repo.createClaim(tx, {
          projectId,
          backlogItemId,
          taskId,
          userId: actor.userId,
          sessionId: input.sessionId,
          branch: input.branch ?? null,
          heartbeatAt: now,
        })
    return {
      claim: toClaimDto(claim, now, hours),
      created: !own,
      takenOver: superseded.map((c) => toClaimDto({ ...c, releasedAt: now }, now, hours)),
    }
  })
}

async function ownClaim(projectId: string, claimId: string, actor: Actor): Promise<ClaimRow> {
  const claim = await repo.findClaim(defaultDb, projectId, claimId)
  if (!claim) throw new NotFoundError("Claim not found")
  if (claim.userId !== actor.userId) throw new ForbiddenError("Only the user who made the claim can change it", {}, "FORBIDDEN")
  return claim
}

/**
 * Heartbeat of the owner (optionally a new branch). A stale claim is revived only
 * while nobody else claimed the target meanwhile (else 409 TASK_CLAIMED); a claim
 * that was released or taken over → 409 CLAIM_RELEASED.
 */
export async function heartbeatClaim(
  projectId: string,
  claimId: string,
  input: HeartbeatClaimInput,
  actor: Actor,
  now: Date = new Date(),
): Promise<{ claim: ClaimDto }> {
  const hours = claimStaleHours()
  const claim = await ownClaim(projectId, claimId, actor)
  if (claim.releasedAt) throw new ConflictError("The claim was released or taken over; claim the work again", {}, "CLAIM_RELEASED")
  return withTransaction(async (tx) => {
    if (!isClaimActive(claim, now, hours)) {
      await repo.lockPbi(tx, claim.backlogItemId)
      const blockers = claimConflicts(claim, await repo.findOpenClaimsOnPbi(tx, claim.backlogItemId), now, hours)
      if (blockers.length > 0) throw claimedError(blockers, hours)
    }
    const updated = await repo.updateClaim(tx, claim.id, { heartbeatAt: now, ...(input.branch !== undefined ? { branch: input.branch } : {}) })
    return { claim: toClaimDto(updated, now, hours) }
  })
}

/** The owner releases the claim. Releasing a released claim answers it unchanged (retry-safe). */
export async function releaseClaim(projectId: string, claimId: string, actor: Actor, now: Date = new Date()): Promise<{ claim: ClaimDto }> {
  const hours = claimStaleHours()
  const claim = await ownClaim(projectId, claimId, actor)
  if (claim.releasedAt) return { claim: toClaimDto(claim, now, hours) }
  return { claim: toClaimDto(await repo.updateClaim(defaultDb, claim.id, { releasedAt: now }), now, hours) }
}

/**
 * Open claims of the project, newest heartbeat first: active ones and stale ones
 * (`stale: true`, heartbeat within the last 7 days), at most CLAIM_LIST_LIMIT
 * (`truncated` when cut).
 */
export async function listClaims(projectId: string, query: ListClaimsQuery, now: Date = new Date()) {
  const hours = claimStaleHours()
  const filter: { backlogItemId?: string; taskId?: string } = {}
  if (query.pbi !== undefined) filter.backlogItemId = (await loadPbi(defaultDb, projectId, query.pbi)).id
  if (query.taskId !== undefined) filter.taskId = query.taskId
  const rows = await repo.findOpenClaims(defaultDb, projectId, staleBefore(now, CLAIM_LIST_LOOKBACK_HOURS), filter)
  const truncated = rows.length > repo.CLAIM_LIST_LIMIT
  return {
    data: rows.slice(0, repo.CLAIM_LIST_LIMIT).map((r) => toClaimDto(r, now, hours)),
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
  try {
    const row = await withTransaction(async (tx) => {
      const created = await repo.createDeclaredLink(tx, {
        projectId,
        ...key,
        title: input.title ?? `!${mr.iid}`,
        url: mr.url,
        occurredAt: now,
        declaredById: actor.userId,
        declaredAt: now,
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
