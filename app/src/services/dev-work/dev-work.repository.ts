import type { Db } from "@/services/_shared/db"
import { LIVE_PBI, NOT_DELETED } from "@/services/_shared/soft-delete"

/** Upper bound of claims in one list answer (one more row is read to say `truncated`). */
export const CLAIM_LIST_LIMIT = 200
/**
 * Upper bound of ACTIVE claims on one PBI read for the blocking check. One more row is
 * read: hitting it is an error (dev-work.service), never a silently missed blocker.
 * With one active claim per target and DEV_CLAIM_MAX_OPEN_PER_USER it is not reachable
 * in normal use.
 */
export const ACTIVE_CLAIMS_PER_PBI_LIMIT = 100
/** Stale claims superseded per claim call (older ones are superseded by a later call). */
export const STALE_CLAIMS_PER_CALL = 50

export const CLAIM_SELECT = {
  id: true,
  projectId: true,
  backlogItemId: true,
  taskId: true,
  userId: true,
  sessionId: true,
  branch: true,
  heartbeatAt: true,
  releasedAt: true,
  releaseReason: true,
  createdAt: true,
  backlogItem: { select: { id: true, displayId: true, initiative: true, userStory: true } },
  task: { select: { id: true, taskName: true, sprintId: true } },
  user: { select: { id: true, name: true } },
} as const

/** A live PBI of the project by internal id or number. */
export function findPbi(db: Db, projectId: string, ref: { id: string } | { displayId: number }) {
  return db.productBacklogItem.findFirst({
    where: { projectId, ...NOT_DELETED, ...("id" in ref ? { id: ref.id } : { displayId: ref.displayId }) },
    select: { id: true, displayId: true, initiative: true, userStory: true },
  })
}

/** A sprint task of the project whose PBI is live. */
export function findTask(db: Db, projectId: string, taskId: string) {
  return db.sprintBacklogItem.findFirst({ where: { id: taskId, sprint: { projectId }, ...LIVE_PBI }, select: { id: true, pbItemId: true } })
}

/**
 * Serializes claims of one PBI: an exclusive row lock on the PBI, taken inside the
 * claim transaction before any claim row is read. The transaction runs READ COMMITTED
 * (dev-work.service), so the claim reads after the lock see what the previous lock
 * holder committed — under REPEATABLE READ they would see an older snapshot and two
 * concurrent first claims could both insert.
 */
export async function lockPbi(db: Db, backlogItemId: string): Promise<void> {
  await db.$queryRaw`SELECT id FROM ProductBacklogItem WHERE id = ${backlogItemId} FOR UPDATE`
}

/** Active (open, heartbeat at or after `since`) claims on a PBI, newest heartbeat first, ACTIVE_CLAIMS_PER_PBI_LIMIT + 1 rows. */
export function findActiveClaimsOnPbi(db: Db, backlogItemId: string, since: Date) {
  return db.workClaim.findMany({
    where: { backlogItemId, releasedAt: null, heartbeatAt: { gte: since } },
    select: CLAIM_SELECT,
    orderBy: [{ heartbeatAt: "desc" }, { id: "desc" }],
    take: ACTIVE_CLAIMS_PER_PBI_LIMIT + 1,
  })
}

/** Stale (open, heartbeat before `before`) claims on a PBI, oldest first, at most STALE_CLAIMS_PER_CALL. */
export function findStaleClaimsOnPbi(db: Db, backlogItemId: string, before: Date) {
  return db.workClaim.findMany({
    where: { backlogItemId, releasedAt: null, heartbeatAt: { lt: before } },
    select: CLAIM_SELECT,
    orderBy: [{ heartbeatAt: "asc" }, { id: "asc" }],
    take: STALE_CLAIMS_PER_CALL,
  })
}

/** The caller's open claim (active or stale) on exactly this target from this session. */
export function findOwnOpenClaim(db: Db, key: { userId: string; sessionId: string; backlogItemId: string; taskId: string | null }) {
  return db.workClaim.findFirst({ where: { ...key, releasedAt: null }, select: CLAIM_SELECT, orderBy: { createdAt: "desc" } })
}

/** Active claims of a user in a project (the per-user cap). */
export function countActiveClaimsOfUser(db: Db, projectId: string, userId: string, since: Date) {
  return db.workClaim.count({ where: { projectId, userId, releasedAt: null, heartbeatAt: { gte: since } } })
}

export interface NewClaim {
  projectId: string
  backlogItemId: string
  taskId: string | null
  userId: string
  sessionId: string
  branch: string | null
  heartbeatAt: Date
}

export function createClaim(db: Db, data: NewClaim) {
  return db.workClaim.create({ data, select: CLAIM_SELECT })
}

export type ClaimEndReason = "released" | "takeover" | "stale" | "moderator"

/** Heartbeat / branch of a claim that is still open; returns how many rows changed (0 = released meanwhile). */
export async function touchOpenClaim(db: Db, claimId: string, data: { heartbeatAt: Date; branch?: string }): Promise<number> {
  return (await db.workClaim.updateMany({ where: { id: claimId, releasedAt: null }, data })).count
}

/** End open claims (released ones are left alone); returns how many were ended. */
export async function endClaims(
  db: Db,
  claimIds: readonly string[],
  end: { releasedAt: Date; releaseReason: ClaimEndReason; releasedById: string | null },
): Promise<number> {
  if (claimIds.length === 0) return 0
  return (await db.workClaim.updateMany({ where: { id: { in: [...claimIds] }, releasedAt: null }, data: end })).count
}

export function findClaim(db: Db, projectId: string, claimId: string) {
  return db.workClaim.findFirst({ where: { id: claimId, projectId }, select: CLAIM_SELECT })
}

/** Unreleased claims of the project (PBI live) with a heartbeat since `since` (active and stale), newest heartbeat first, CLAIM_LIST_LIMIT + 1 rows. */
export function findOpenClaims(db: Db, projectId: string, since: Date, filter: { backlogItemId?: string; taskId?: string }) {
  return db.workClaim.findMany({
    where: { projectId, releasedAt: null, heartbeatAt: { gte: since }, backlogItem: NOT_DELETED, ...filter },
    select: CLAIM_SELECT,
    orderBy: [{ heartbeatAt: "desc" }, { id: "desc" }],
    take: CLAIM_LIST_LIMIT + 1,
  })
}

/** The project's repository at host + path, only while the project's Git integration is on. */
export function findRegisteredRepository(db: Db, projectId: string, apiBase: string, repoPath: string) {
  return db.gitRepository.findFirst({
    where: { projectId, apiBase, repoPath, project: { ...NOT_DELETED, gitIntegration: { enabled: true } } },
    select: { id: true, name: true, webUrl: true },
  })
}

export const LINK_SELECT = {
  id: true,
  kind: true,
  ref: true,
  title: true,
  url: true,
  state: true,
  backlogItemId: true,
  declaredAt: true,
  createdAt: true,
  repository: { select: { id: true, name: true } },
  declaredBy: { select: { id: true, name: true } },
} as const

export interface LinkKey {
  repositoryId: string
  kind: "mr"
  ref: string
  backlogItemId: string
}

export function findLink(db: Db, key: LinkKey) {
  return db.gitLink.findUnique({ where: { repositoryId_kind_ref_backlogItemId: key }, select: LINK_SELECT })
}

/** The same merge request as the sync stored it for any PBI (repository + iid), if any. */
export function findSyncedMergeRequest(db: Db, repositoryId: string, ref: string) {
  return db.gitLink.findFirst({
    where: { repositoryId, kind: "mr", ref, declaredAt: null },
    select: { title: true, state: true, pipeline: true, author: true, sourceBranch: true, occurredAt: true, mergedAt: true },
    orderBy: { updatedAt: "desc" },
  })
}

export function createDeclaredLink(
  db: Db,
  data: LinkKey & {
    projectId: string
    title: string
    url: string
    occurredAt: Date
    declaredById: string
    declaredAt: Date
    state?: string | null
    pipeline?: string | null
    author?: string | null
    sourceBranch?: string | null
    mergedAt?: Date | null
  },
) {
  return db.gitLink.create({ data, select: LINK_SELECT })
}
