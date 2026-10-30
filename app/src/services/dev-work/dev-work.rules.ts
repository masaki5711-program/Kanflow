/**
 * 作業の宣言 (work claims, K5) — pure rules: expiry and overlap. No I/O.
 *
 * - A claim is **active** while it is not released and its last heartbeat is
 *   within the stale window (DEV_CLAIM_STALE_HOURS, default 4 h). A stale claim
 *   is not deleted: it stops counting (no warning, not listed) and a heartbeat
 *   of its owner revives it.
 * - Two claims **overlap** when they cover the same task, or one of them covers
 *   the whole PBI (taskId null) and both are on that PBI. Different tasks of one
 *   PBI are normal parallel work, not a conflict.
 * - One active claim per target: an active overlapping claim of another user or
 *   another session **blocks** a new claim (409 TASK_CLAIMED with the holders —
 *   AI sessions run unattended, a mere warning would be ignored). `takeover`
 *   lifts the block only when every blocker is the caller's own (another
 *   session of the same user); stale claims never block, and a takeover also
 *   ends them. See dev-work.service claimWork.
 * - The same user in the same session on the same target is one claim (it is
 *   refreshed, never duplicated), so it never blocks itself.
 */

export const DEFAULT_CLAIM_STALE_HOURS = 4
const MAX_CLAIM_STALE_HOURS = 168
const HOUR_MS = 3_600_000

export const DEFAULT_MAX_OPEN_CLAIMS_PER_USER = 20
const MAX_MAX_OPEN_CLAIMS_PER_USER = 1000

type Env = Readonly<Record<string, string | undefined>>

/** An integer setting in [min, max]; `invalid` = set but unusable (the caller warns once). */
function intSetting(raw: string | undefined, min: number, max: number, fallback: number): { value: number; invalid: boolean } {
  const v = raw?.trim()
  if (!v) return { value: fallback, invalid: false }
  const n = /^\d+$/.test(v) ? Number(v) : Number.NaN
  return n >= min && n <= max ? { value: n, invalid: false } : { value: fallback, invalid: true }
}

export interface ClaimSettings {
  staleHours: number
  maxOpenPerUser: number
  /** Names of variables that were set to an unusable value (defaults used instead). */
  invalid: string[]
}

/** DEV_CLAIM_STALE_HOURS (1-168, default 4) and DEV_CLAIM_MAX_OPEN_PER_USER (1-1000, default 20). */
export function claimSettings(env: Env = process.env): ClaimSettings {
  const stale = intSetting(env.DEV_CLAIM_STALE_HOURS, 1, MAX_CLAIM_STALE_HOURS, DEFAULT_CLAIM_STALE_HOURS)
  const cap = intSetting(env.DEV_CLAIM_MAX_OPEN_PER_USER, 1, MAX_MAX_OPEN_CLAIMS_PER_USER, DEFAULT_MAX_OPEN_CLAIMS_PER_USER)
  return {
    staleHours: stale.value,
    maxOpenPerUser: cap.value,
    invalid: [...(stale.invalid ? ["DEV_CLAIM_STALE_HOURS"] : []), ...(cap.invalid ? ["DEV_CLAIM_MAX_OPEN_PER_USER"] : [])],
  }
}

/** Stale window in hours from DEV_CLAIM_STALE_HOURS (1-168; anything else → the default). */
export function claimStaleHours(env: Env = process.env): number {
  return claimSettings(env).staleHours
}

/** Heartbeats before this instant are stale. */
export function staleBefore(now: Date, staleHours: number): Date {
  return new Date(now.getTime() - staleHours * HOUR_MS)
}

/** A stored claim with what its DTO needs. */
export interface ClaimRow {
  id: string
  projectId: string
  backlogItemId: string
  taskId: string | null
  userId: string
  sessionId: string
  branch: string | null
  heartbeatAt: Date
  releasedAt: Date | null
  /** "released" | "takeover" | "stale" | "moderator"; null while open (repository ClaimEndReason). */
  releaseReason?: string | null
  createdAt: Date
  backlogItem: { id: string; displayId: number; initiative: string | null; userStory: string | null }
  task: { id: string; taskName: string | null; sprintId: string } | null
  user: { id: string; name: string }
}

type ClaimKey = Pick<ClaimRow, "id" | "backlogItemId" | "taskId" | "userId" | "sessionId" | "heartbeatAt" | "releasedAt">

export function isClaimActive(row: Pick<ClaimRow, "heartbeatAt" | "releasedAt">, now: Date, staleHours: number): boolean {
  return row.releasedAt === null && row.heartbeatAt.getTime() >= staleBefore(now, staleHours).getTime()
}

function sameHolder(a: ClaimKey, b: ClaimKey): boolean {
  return a.userId === b.userId && a.sessionId === b.sessionId && a.taskId === b.taskId && a.backlogItemId === b.backlogItemId
}

export function overlaps(a: ClaimKey, b: ClaimKey): boolean {
  if (a.backlogItemId !== b.backlogItemId) return false
  return a.taskId === null || b.taskId === null || a.taskId === b.taskId
}

/** Unreleased claims among `others` that overlap `claim` and are held by another user or session (active or stale; input order kept). */
export function overlappingClaims<T extends ClaimKey>(claim: ClaimKey, others: readonly T[]): T[] {
  return others.filter((o) => o.id !== claim.id && o.releasedAt === null && !sameHolder(claim, o) && overlaps(claim, o))
}

/** The claims that block `claim`: overlapping, held by another user or session, and active (input order kept). */
export function claimConflicts<T extends ClaimKey>(claim: ClaimKey, others: readonly T[], now: Date, staleHours: number): T[] {
  return overlappingClaims(claim, others).filter((o) => isClaimActive(o, now, staleHours))
}

/**
 * May `userId` take over these active blockers? Only when all of them are the user's own
 * (other sessions). Another user's claim is never taken over; their STALE claims do not
 * block and are superseded by any new claim (dev-work.service), not by takeover.
 */
export function canTakeOver(blockers: readonly Pick<ClaimKey, "userId">[], userId: string): boolean {
  return blockers.every((b) => b.userId === userId)
}

export interface ClaimDto {
  id: string
  projectId: string
  pbi: { id: string; displayId: number; title: string | null }
  /** null = the claim covers the whole PBI. */
  task: { id: string; name: string | null; sprintId: string } | null
  user: { id: string; name: string }
  /** Only on the viewer's own claims (another user's session id is not shown); null otherwise. */
  sessionId: string | null
  branch: string | null
  startedAt: string
  heartbeatAt: string
  /** When the claim stops counting without another heartbeat. */
  staleAt: string
  releasedAt: string | null
  /** Why it ended (released / takeover / stale / moderator); null while open. */
  releaseReason: string | null
  active: boolean
  /** Not released but without a heartbeat for the stale window: no longer blocks anyone. */
  stale: boolean
}

/** Who holds a target (body of 409 TASK_CLAIMED: `holders`). */
export interface ClaimHolderDto {
  claimId: string
  user: { id: string; name: string }
  /** Only when the holder is the viewer (their other session); null for other users. */
  sessionId: string | null
  branch: string | null
  pbi: { id: string; displayId: number }
  task: { id: string; name: string | null } | null
  claimedAt: string
  lastHeartbeatAt: string
  staleAt: string
}

const TITLE_MAX = 120

/** `viewerId`: the token user; another user's session id is hidden. */
export function toClaimDto(row: ClaimRow, now: Date, staleHours: number, viewerId: string): ClaimDto {
  const title = row.backlogItem.initiative || row.backlogItem.userStory?.slice(0, TITLE_MAX) || null
  return {
    id: row.id,
    projectId: row.projectId,
    pbi: { id: row.backlogItem.id, displayId: row.backlogItem.displayId, title },
    task: row.task ? { id: row.task.id, name: row.task.taskName, sprintId: row.task.sprintId } : null,
    user: row.user,
    sessionId: row.userId === viewerId ? row.sessionId : null,
    branch: row.branch,
    startedAt: row.createdAt.toISOString(),
    heartbeatAt: row.heartbeatAt.toISOString(),
    staleAt: new Date(row.heartbeatAt.getTime() + staleHours * HOUR_MS).toISOString(),
    releasedAt: row.releasedAt?.toISOString() ?? null,
    releaseReason: row.releaseReason ?? null,
    active: isClaimActive(row, now, staleHours),
    stale: row.releasedAt === null && !isClaimActive(row, now, staleHours),
  }
}

export function toHolderDto(row: ClaimRow, staleHours: number, viewerId: string): ClaimHolderDto {
  return {
    claimId: row.id,
    user: row.user,
    sessionId: row.userId === viewerId ? row.sessionId : null,
    branch: row.branch,
    pbi: { id: row.backlogItem.id, displayId: row.backlogItem.displayId },
    task: row.task ? { id: row.task.id, name: row.task.taskName } : null,
    claimedAt: row.createdAt.toISOString(),
    lastHeartbeatAt: row.heartbeatAt.toISOString(),
    staleAt: new Date(row.heartbeatAt.getTime() + staleHours * HOUR_MS).toISOString(),
  }
}
