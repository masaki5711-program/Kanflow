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

/** Stale window in hours from DEV_CLAIM_STALE_HOURS (1-168; anything else → the default). */
export function claimStaleHours(env: Readonly<Record<string, string | undefined>> = process.env): number {
  const raw = env.DEV_CLAIM_STALE_HOURS?.trim()
  if (!raw || !/^\d+$/.test(raw)) return DEFAULT_CLAIM_STALE_HOURS
  const n = Number(raw)
  return n >= 1 && n <= MAX_CLAIM_STALE_HOURS ? n : DEFAULT_CLAIM_STALE_HOURS
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

/** May `userId` take over these blockers? Only when all of them are the user's own (other sessions). */
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
  sessionId: string
  branch: string | null
  startedAt: string
  heartbeatAt: string
  /** When the claim stops counting without another heartbeat. */
  staleAt: string
  releasedAt: string | null
  active: boolean
  /** Not released but without a heartbeat for the stale window: no longer blocks anyone. */
  stale: boolean
}

/** Who holds a target (body of 409 TASK_CLAIMED: `holders`). */
export interface ClaimHolderDto {
  claimId: string
  user: { id: string; name: string }
  sessionId: string
  branch: string | null
  pbi: { id: string; displayId: number }
  task: { id: string; name: string | null } | null
  claimedAt: string
  lastHeartbeatAt: string
  staleAt: string
}

const TITLE_MAX = 120

export function toClaimDto(row: ClaimRow, now: Date, staleHours: number): ClaimDto {
  const title = row.backlogItem.initiative || row.backlogItem.userStory?.slice(0, TITLE_MAX) || null
  return {
    id: row.id,
    projectId: row.projectId,
    pbi: { id: row.backlogItem.id, displayId: row.backlogItem.displayId, title },
    task: row.task ? { id: row.task.id, name: row.task.taskName, sprintId: row.task.sprintId } : null,
    user: row.user,
    sessionId: row.sessionId,
    branch: row.branch,
    startedAt: row.createdAt.toISOString(),
    heartbeatAt: row.heartbeatAt.toISOString(),
    staleAt: new Date(row.heartbeatAt.getTime() + staleHours * HOUR_MS).toISOString(),
    releasedAt: row.releasedAt?.toISOString() ?? null,
    active: isClaimActive(row, now, staleHours),
    stale: row.releasedAt === null && !isClaimActive(row, now, staleHours),
  }
}

export function toHolderDto(row: ClaimRow, staleHours: number): ClaimHolderDto {
  return {
    claimId: row.id,
    user: row.user,
    sessionId: row.sessionId,
    branch: row.branch,
    pbi: { id: row.backlogItem.id, displayId: row.backlogItem.displayId },
    task: row.task ? { id: row.task.id, name: row.task.taskName } : null,
    claimedAt: row.createdAt.toISOString(),
    lastHeartbeatAt: row.heartbeatAt.toISOString(),
    staleAt: new Date(row.heartbeatAt.getTime() + staleHours * HOUR_MS).toISOString(),
  }
}
