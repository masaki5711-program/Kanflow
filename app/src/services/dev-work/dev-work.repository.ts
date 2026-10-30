import type { Db } from "@/services/_shared/db"
import { LIVE_PBI, NOT_DELETED } from "@/services/_shared/soft-delete"

/** Upper bound of claims in one list answer (one more row is read to say `truncated`). */
export const CLAIM_LIST_LIMIT = 200
/** Upper bound of claims on one PBI read for the overlap check. */
const CLAIMS_PER_PBI_LIMIT = 100

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
 * Serializes claims of one PBI: row lock on the PBI inside the caller's transaction,
 * so two sessions claiming the same task at once cannot both pass the "one active
 * claim per target" check (MariaDB REPEATABLE READ alone would let both read "free").
 */
export async function lockPbi(db: Db, backlogItemId: string): Promise<void> {
  await db.$queryRaw`SELECT id FROM ProductBacklogItem WHERE id = ${backlogItemId} FOR UPDATE`
}

/** Unreleased claims on a PBI (any task or the whole PBI), active or stale. */
export function findOpenClaimsOnPbi(db: Db, backlogItemId: string) {
  return db.workClaim.findMany({
    where: { backlogItemId, releasedAt: null },
    select: CLAIM_SELECT,
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    take: CLAIMS_PER_PBI_LIMIT,
  })
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

export function updateClaim(db: Db, claimId: string, data: { heartbeatAt?: Date; branch?: string; releasedAt?: Date }) {
  return db.workClaim.update({ where: { id: claimId }, data, select: CLAIM_SELECT })
}

/** End claims that were taken over (only ones still open). */
export function releaseClaims(db: Db, claimIds: readonly string[], releasedAt: Date) {
  return db.workClaim.updateMany({ where: { id: { in: [...claimIds] }, releasedAt: null }, data: { releasedAt } })
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

export function createDeclaredLink(
  db: Db,
  data: LinkKey & { projectId: string; title: string; url: string; occurredAt: Date; declaredById: string; declaredAt: Date },
) {
  return db.gitLink.create({ data, select: LINK_SELECT })
}
