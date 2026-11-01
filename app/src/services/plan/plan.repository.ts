import { Prisma } from "@/generated/prisma/client"
import type { Db } from "@/services/_shared/db"
import { LIST_LIMITS } from "@/services/_shared/limits"
import { NOT_DELETED, RESTORE_DATA, softDeleteData } from "@/services/_shared/soft-delete"
import { BUMP_VERSION, versionWhere } from "@/services/_shared/versioning"

const TRASHED = { deletedAt: { not: null } } as const

export const OWNER_SELECT = { owner: { select: { id: true, name: true } } } as const

/** Sprint summary carried by linked PBIs (one row per distinct sprint). */
export const SPRINT_OF_PBI = {
  select: { sprint: { select: { id: true, sprintName: true, startDate: true, endDate: true, status: true } } },
  distinct: ["sprintId"],
} satisfies Prisma.ProductBacklogItem$sprintItemsArgs

// === plan items (live) ===

/** The project's live plan rows with their owner, in display order. */
export function findPlanItems(db: Db, projectId: string) {
  return db.planItem.findMany({
    where: { projectId, ...NOT_DELETED },
    include: OWNER_SELECT,
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    take: LIST_LIMITS.planItems,
  })
}

/** id / parentId of every live plan row in the project (cycle checks, subtree collection). */
export function findPlanTree(db: Db, projectId: string) {
  return db.planItem.findMany({ where: { projectId, ...NOT_DELETED }, select: { id: true, parentId: true } })
}

/** Every plan row incl. trashed ones (restore / purge walk the deleted batch). */
export function findPlanTreeWithTrash(db: Db, projectId: string) {
  return db.planItem.findMany({ where: { projectId }, select: { id: true, parentId: true, deletedAt: true } })
}

/** A live plan row of the project (full row + owner), or null. */
export function findPlanItem(db: Db, projectId: string, itemId: string) {
  return db.planItem.findFirst({ where: { id: itemId, projectId, ...NOT_DELETED }, include: OWNER_SELECT })
}

export async function nextPlanSortOrder(db: Db, projectId: string, parentId: string | null): Promise<number> {
  const agg = await db.planItem.aggregate({ where: { projectId, parentId }, _max: { sortOrder: true } })
  return (agg._max.sortOrder ?? 0) + 1
}

export function insertPlanItem(db: Db, data: Prisma.PlanItemUncheckedCreateInput) {
  return db.planItem.create({ data })
}

/** Unversioned write (reorder / derived values). */
export function updatePlanItem(db: Db, itemId: string, data: Prisma.PlanItemUncheckedUpdateInput) {
  return db.planItem.update({ where: { id: itemId }, data })
}

/**
 * Optimistic-lock update of a live plan row: matches `version` when given and
 * always bumps it. Returns the updated row (with owner), or null when nothing
 * matched (missing / trashed / stale).
 */
export async function updatePlanItemVersioned(
  db: Db,
  projectId: string,
  itemId: string,
  data: Prisma.PlanItemUncheckedUpdateManyInput,
  version?: number
) {
  const res = await db.planItem.updateMany({
    where: { id: itemId, projectId, ...NOT_DELETED, ...versionWhere(version) },
    data: { ...data, ...BUMP_VERSION },
  })
  if (res.count === 0) return null
  return db.planItem.findFirst({ where: { id: itemId, projectId }, include: OWNER_SELECT })
}

/** Live children count. */
export function countPlanChildren(db: Db, itemId: string) {
  return db.planItem.count({ where: { parentId: itemId, ...NOT_DELETED } })
}

export function findPlanItemsByIds(db: Db, projectId: string, ids: readonly string[]) {
  return db.planItem.findMany({ where: { id: { in: [...ids] }, projectId, ...NOT_DELETED }, select: { id: true, parentId: true } })
}

/** True when the user is a member of the project (plan item owner guard). */
export async function isProjectMember(db: Db, projectId: string, userId: string): Promise<boolean> {
  return (await db.projectMember.findFirst({ where: { projectId, userId }, select: { id: true } })) !== null
}

export async function findProjectName(db: Db, projectId: string): Promise<string | null> {
  return (await db.project.findUnique({ where: { id: projectId }, select: { name: true } }))?.name ?? null
}

// === soft delete / trash ===

/** Move live rows of the project to the trash (one shared `deletedAt`); `version` guards the root only. */
export async function softDeletePlanItems(db: Db, projectId: string, ids: readonly string[], actorUserId: string, now: Date, version?: number): Promise<number> {
  const res = await db.planItem.updateMany({
    where: { id: { in: [...ids] }, projectId, ...NOT_DELETED, ...versionWhere(version) },
    data: { ...softDeleteData(actorUserId, now), ...BUMP_VERSION },
  })
  return res.count
}

export function findTrashedPlanItem(db: Db, projectId: string, itemId: string) {
  return db.planItem.findFirst({
    where: { id: itemId, projectId, ...TRASHED },
    select: { id: true, parentId: true, deletedAt: true, name: true },
  })
}

export async function restorePlanItems(db: Db, projectId: string, ids: readonly string[]): Promise<number> {
  const res = await db.planItem.updateMany({ where: { id: { in: [...ids] }, projectId, ...TRASHED }, data: RESTORE_DATA })
  return res.count
}

/** The project's trashed plan rows (parent's deletedAt tells batch roots apart), newest first. */
export function findTrashedPlanItems(db: Db, projectId: string) {
  return db.planItem.findMany({
    where: { projectId, ...TRASHED },
    select: {
      id: true,
      parentId: true,
      name: true,
      status: true,
      deletedAt: true,
      deletedById: true,
      parent: { select: { deletedAt: true } },
    },
    orderBy: { deletedAt: "desc" },
    take: LIST_LIMITS.planItems,
  })
}

/**
 * Trashed plan rows (any project) whose retention ended and that are the
 * top of what is being purged: no parent, a live parent, or a parent still
 * inside its retention (a parent that expires too cascades them).
 */
export function findExpiredTrashedPlanItems(db: Db, cutoff: Date, take: number) {
  return db.planItem.findMany({
    where: {
      deletedAt: { lt: cutoff },
      OR: [{ parentId: null }, { parent: { OR: [{ deletedAt: null }, { deletedAt: { gte: cutoff } }] } }],
    },
    select: { id: true, projectId: true },
    orderBy: { deletedAt: "asc" },
    take,
  })
}

/** Hard delete (purge); the subtree and dependencies cascade in the DB, linked PBIs are unlinked (SET NULL). */
export function deletePlanItemHard(db: Db, projectId: string, itemId: string) {
  return db.planItem.delete({ where: { id: itemId, projectId } })
}

// === linked PBIs ===

/** Live PBIs of the project linked to any plan item (list view aggregation). */
export function findLinkedPbisOfProject(db: Db, projectId: string) {
  return db.productBacklogItem.findMany({
    where: { projectId, planItemId: { not: null }, ...NOT_DELETED },
    select: { planItemId: true, status: true, workloadScore: true, sprintItems: SPRINT_OF_PBI },
  })
}

/** Live PBIs linked to one plan item (detail rows). */
export function findLinkedPbisOfItem(db: Db, projectId: string, planItemId: string) {
  return db.productBacklogItem.findMany({
    where: { projectId, planItemId, ...NOT_DELETED },
    select: {
      id: true,
      displayId: true,
      initiative: true,
      userStory: true,
      status: true,
      workloadScore: true,
      planItemId: true,
      sprintItems: SPRINT_OF_PBI,
    },
    orderBy: [{ sortOrder: "asc" }, { displayId: "asc" }],
  })
}

/** Live PBIs of the project among `ids` with their current link. */
export function findLivePbisByIds(db: Db, projectId: string, ids: readonly string[]) {
  return db.productBacklogItem.findMany({
    where: { projectId, id: { in: [...ids] }, ...NOT_DELETED },
    select: { id: true, displayId: true, userStory: true, planItemId: true },
  })
}

/** Set (or clear) the plan link of live PBIs of the project; bumps their versions. */
export async function setPbiPlanItem(db: Db, projectId: string, ids: readonly string[], planItemId: string | null): Promise<number> {
  if (ids.length === 0) return 0
  const res = await db.productBacklogItem.updateMany({
    where: { projectId, id: { in: [...ids] }, ...NOT_DELETED },
    data: { planItemId, ...BUMP_VERSION },
  })
  return res.count
}

export const LINKABLE_LIMIT = 200

/** Live PBIs for the link picker: `q` matches "#12" / "12" or text; with their current plan item. */
export function findLinkablePbis(db: Db, projectId: string, q: string | undefined, displayId: number | null) {
  const text = q?.trim()
  const where: Prisma.ProductBacklogItemWhereInput = {
    projectId,
    ...NOT_DELETED,
    ...(text
      ? {
          OR: [
            ...(displayId !== null ? [{ displayId }] : []),
            { initiative: { contains: text } },
            { epic: { contains: text } },
            { userStory: { contains: text } },
          ],
        }
      : {}),
  }
  return db.productBacklogItem.findMany({
    where,
    select: {
      id: true,
      displayId: true,
      initiative: true,
      userStory: true,
      status: true,
      workloadScore: true,
      planItem: { select: { id: true, name: true, deletedAt: true } },
    },
    orderBy: [{ sortOrder: "asc" }, { displayId: "asc" }],
    take: LINKABLE_LIMIT,
  })
}

// === baseline ===

/** Copy planned dates into the baseline of live rows (all of the project, or `ids`). Returns the row count. */
export function copyBaseline(db: Db, projectId: string, ids?: readonly string[]): Promise<number> {
  const scope = ids && ids.length > 0 ? Prisma.sql` AND \`id\` IN (${Prisma.join([...ids])})` : Prisma.empty
  return db.$executeRaw`UPDATE \`PlanItem\` SET \`baselineStart\` = \`plannedStart\`, \`baselineEnd\` = \`plannedEnd\` WHERE \`projectId\` = ${projectId} AND \`deletedAt\` IS NULL${scope}`
}

export async function clearBaseline(db: Db, projectId: string): Promise<number> {
  const res = await db.planItem.updateMany({
    where: { projectId, ...NOT_DELETED, OR: [{ baselineStart: { not: null } }, { baselineEnd: { not: null } }] },
    data: { baselineStart: null, baselineEnd: null },
  })
  return res.count
}

// === dependencies ===

export function findDependencies(db: Db, projectId: string) {
  return db.planItemDependency.findMany({
    where: { projectId },
    select: { id: true, predecessorId: true, successorId: true },
    orderBy: { createdAt: "asc" },
  })
}

export function insertDependency(db: Db, data: { projectId: string; predecessorId: string; successorId: string }) {
  return db.planItemDependency.create({ data, select: { id: true, predecessorId: true, successorId: true } })
}

export function findDependency(db: Db, projectId: string, id: string) {
  return db.planItemDependency.findFirst({ where: { id, projectId }, select: { id: true, predecessorId: true, successorId: true } })
}

export function deleteDependency(db: Db, id: string) {
  return db.planItemDependency.delete({ where: { id } })
}

// === base-schedule loads (W12) ===

/** Marker rows of /plan/load, one per approved proposal: a second load of the same proposal is refused. */
export const PLAN_LOAD_MARKER = "plan_load"

export function findPlanLoadMarker(db: Db, projectId: string, proposalId: string) {
  return db.activityLog.findFirst({ where: { projectId, entityType: PLAN_LOAD_MARKER, entityId: proposalId }, select: { id: true } })
}

/** Written inside the load's transaction (not through logActivity, which swallows failures): no marker, no load. */
export function insertPlanLoadMarker(db: Db, data: { projectId: string; proposalId: string; actorId: string | null; actorName: string | null }) {
  return db.activityLog.create({
    data: { projectId: data.projectId, entityType: PLAN_LOAD_MARKER, entityId: data.proposalId, action: "create", actorId: data.actorId, actorName: data.actorName },
    select: { id: true },
  })
}
