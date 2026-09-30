/**
 * Master plan (全体計画): list / create / update / trash / reorder.
 * Links to PBIs: ./plan.links.ts; baseline + dependencies: ./plan.schedule.ts;
 * trash restore / purge: ./plan.trash.ts; Excel export: ./plan.export.ts.
 * Progress / status / schedule rules: src/lib/plan-progress.ts.
 */
import { logger } from "@/lib/logger"
import { recalcPlanProgress, statusToProgress, tokyoDateKey } from "@/lib/plan-progress"
import type { Actor } from "@/services/_shared/actor"
import { logActivity, logCreate, logDelete, logUpdate } from "@/services/_shared/activity"
import { defaultDb, withTransaction, type Db } from "@/services/_shared/db"
import { ValidationError, VersionConflictError } from "@/services/_shared/errors"
import { collectSubtreeIds } from "@/services/_shared/tree"
import { enqueueIn, getI18nFor, prepareText } from "@/services/_shared/translations"
import { noteUnversionedWrite, staleOrMissing, takeVersion } from "@/services/_shared/versioning"
import { summarizeLinked, toPlanItemDto, type PlanItemDto, type PlanListDto, type PlanRow } from "./plan.dto"
import { claimPlanHeal, computePlanHeal, persistPlanHeal, releasePlanHeal } from "./plan.heal"
import * as repo from "./plan.repository"
import {
  PARENT_MISSING,
  assertMilestoneNotLinked,
  assertValidParent,
  assertValidReorder,
  buildPlanUpdate,
  milestoneLinkError,
  planItemNotFound,
  resolveCreateDates,
} from "./plan.rules"
import type { CreatePlanItemInput, PlanReorderUpdate, UpdatePlanItemInput } from "./plan.schemas"

const log = logger.child({ module: "plan-service" })

export { planItemNotFound }

/**
 * Recompute every derived value of the tree in memory (always answered) and
 * persist the drifted rows (see ./plan.heal.ts). The write is skipped when
 * nothing drifted, when the list hit its cap, and when this project was
 * healed by a GET within PLAN_HEAL_DEBOUNCE_MS. Best effort: a failed write
 * is logged and releases the debounce so the next GET retries.
 */
async function healDerived<T extends PlanRow>(projectId: string, rows: readonly T[], pbis: Parameters<typeof computePlanHeal>[1], now: Date): Promise<T[]> {
  const { items, updates } = computePlanHeal(rows, pbis)
  if (updates.length === 0 || !claimPlanHeal(projectId, now.getTime())) return items
  try {
    await persistPlanHeal(updates)
  } catch (err) {
    releasePlanHeal(projectId)
    log.warn("plan derived values heal failed", { projectId, count: updates.length, error: err instanceof Error ? err.message : String(err) })
  }
  return items
}

/** GET /plan: live items (derived values fresh), live-to-live dependencies and the Tokyo "today". */
export async function listPlan(projectId: string, now: Date = new Date()): Promise<PlanListDto> {
  const today = tokyoDateKey(now)
  const [rows, pbis, deps] = await Promise.all([
    repo.findPlanItems(defaultDb, projectId),
    repo.findLinkedPbisOfProject(defaultDb, projectId),
    repo.findDependencies(defaultDb, projectId),
  ])
  const items = await healDerived(projectId, rows, pbis, now)
  const ids = new Set(items.map((i) => i.id))
  const parents = new Set(items.map((i) => i.parentId).filter((id): id is string => !!id && ids.has(id)))
  const [i18n, linked] = [await getI18nFor("plan_item", [...ids]), summarizeLinked(pbis)]
  return {
    items: items.map((row) => toPlanItemDto(row, { hasChildren: parents.has(row.id), linked: linked.get(row.id), i18n: i18n.get(row.id), today })),
    dependencies: deps.filter((d) => ids.has(d.predecessorId) && ids.has(d.successorId)),
    today,
  }
}

/** The DTO of a loaded live row (children count, linked PBIs and i18n read from `db`). */
async function dtoOfRow(db: Db, row: PlanRow, now: Date): Promise<PlanItemDto> {
  const [children, pbis, i18n] = await Promise.all([
    repo.countPlanChildren(db, row.id),
    repo.findLinkedPbisOfItem(db, row.projectId, row.id),
    getI18nFor("plan_item", [row.id]),
  ])
  return toPlanItemDto(row, {
    hasChildren: children > 0,
    linked: summarizeLinked(pbis).get(row.id),
    i18n: i18n.get(row.id),
    today: tokyoDateKey(now),
  })
}

/** The DTO of a live item, or 404 PLAN_ITEM_NOT_FOUND. */
export async function getPlanItemDto(projectId: string, itemId: string, now: Date = new Date(), db: Db = defaultDb): Promise<PlanItemDto> {
  const row = await repo.findPlanItem(db, projectId, itemId)
  if (!row) throw planItemNotFound()
  return dtoOfRow(db, row, now)
}

/** 400 PLAN_OWNER_NOT_MEMBER unless the owner is a member of the project. */
async function assertOwner(tx: Db, projectId: string, ownerId: string | null | undefined): Promise<void> {
  if (!ownerId) return
  if (!(await repo.isProjectMember(tx, projectId, ownerId))) {
    throw new ValidationError("担当者はプロジェクトメンバーから選択してください", {}, "PLAN_OWNER_NOT_MEMBER")
  }
}

export async function createPlanItem(projectId: string, input: CreatePlanItemInput, actor: Actor, now: Date = new Date()): Promise<PlanItemDto> {
  assertMilestoneNotLinked(input.isMilestone ?? false, input.progressMode ?? "manual")
  const data = await prepareText(input, actor.userId)
  const dates = resolveCreateDates(data)
  const parentId = data.parentId ?? null
  const item = await withTransaction(async (tx) => {
    if (parentId && !(await repo.findPlanItem(tx, projectId, parentId))) {
      throw new ValidationError(PARENT_MISSING, {}, "PLAN_PARENT_NOT_FOUND")
    }
    await assertOwner(tx, projectId, data.ownerId)
    const status = data.status ?? "not_started"
    const row = await repo.insertPlanItem(tx, {
      projectId,
      parentId,
      name: data.name,
      description: data.description ?? null,
      notes: data.notes ?? null,
      ...dates,
      isMilestone: data.isMilestone ?? false,
      color: data.color ?? null,
      status,
      progressPct: statusToProgress(status),
      progressMode: data.progressMode ?? "manual",
      ownerId: data.ownerId ?? null,
      sortOrder: await repo.nextPlanSortOrder(tx, projectId, parentId),
    })
    await recalcPlanProgress(projectId, [row.id], tx)
    await enqueueIn(tx, "plan_item", row.id, row)
    await logCreate(tx, { projectId, entityType: "plan_item", entityId: row.id, actor, row })
    return row
  })
  return getPlanItemDto(projectId, item.id, now)
}

/**
 * 400 PLAN_LINK_MILESTONE when the PATCH would leave a milestone in "linked"
 * mode, or turn an item that still has linked PBIs into a milestone.
 */
async function assertMilestoneLinkRules(
  tx: Db,
  projectId: string,
  existing: { id: string; isMilestone: boolean; progressMode: string },
  data: { isMilestone?: boolean; progressMode?: string }
): Promise<void> {
  const isMilestone = data.isMilestone ?? existing.isMilestone
  assertMilestoneNotLinked(isMilestone, data.progressMode ?? existing.progressMode)
  if (isMilestone && !existing.isMilestone && (await repo.findLinkedPbisOfItem(tx, projectId, existing.id)).length > 0) {
    throw milestoneLinkError()
  }
}

/** `input.version` (optional) = the version the client loaded; stale → 409 VERSION_CONFLICT with `current`. */
export async function updatePlanItem(projectId: string, itemId: string, input: UpdatePlanItemInput, actor: Actor, now: Date = new Date()): Promise<PlanItemDto> {
  const { version, data: fields } = takeVersion(input)
  noteUnversionedWrite("plan_item", itemId, version)
  const data = await prepareText(fields, actor.userId)
  await withTransaction(async (tx) => {
    const existing = await repo.findPlanItem(tx, projectId, itemId)
    if (!existing) throw planItemNotFound()
    if (version !== undefined && existing.version !== version) throw new VersionConflictError(await dtoOfRow(tx, existing, now))
    if (data.parentId) assertValidParent(await repo.findPlanTree(tx, projectId), itemId, data.parentId)
    await assertOwner(tx, projectId, data.ownerId)
    await assertMilestoneLinkRules(tx, projectId, existing, data)
    const hasChildren = (await repo.countPlanChildren(tx, itemId)) > 0
    const updated = await repo.updatePlanItemVersioned(tx, projectId, itemId, buildPlanUpdate(data, existing, hasChildren), version)
    if (!updated) {
      const current = await repo.findPlanItem(tx, projectId, itemId)
      throw staleOrMissing(current && (await dtoOfRow(tx, current, now)), planItemNotFound)
    }
    // Rebalance the item and both the old and the new ancestor chain.
    await recalcPlanProgress(projectId, [itemId, existing.parentId, data.parentId], tx)
    await enqueueIn(tx, "plan_item", itemId, data)
    await logUpdate(tx, { projectId, entityType: "plan_item", entityId: itemId, actor, before: existing, after: updated })
  })
  return getPlanItemDto(projectId, itemId, now)
}

/**
 * Moves the item AND its live subtree to the trash (one shared deletedAt, so
 * a restore brings the batch back together). Translations, PBI links and
 * dependencies are kept until the purge. `version` (optional) guards the item.
 */
export async function deletePlanItem(projectId: string, itemId: string, actor: Actor, version?: number, now: Date = new Date()): Promise<{ deletedCount: number }> {
  noteUnversionedWrite("plan_item", itemId, version)
  return withTransaction(async (tx) => {
    const existing = await repo.findPlanItem(tx, projectId, itemId)
    if (!existing) throw planItemNotFound()
    const subtree = collectSubtreeIds(await repo.findPlanTree(tx, projectId), itemId)
    if ((await repo.softDeletePlanItems(tx, projectId, [itemId], actor.userId, now, version)) === 0) {
      const current = await repo.findPlanItem(tx, projectId, itemId)
      throw staleOrMissing(current && (await dtoOfRow(tx, current, now)), planItemNotFound)
    }
    const rest = subtree.filter((id) => id !== itemId)
    const restCount = rest.length > 0 ? await repo.softDeletePlanItems(tx, projectId, rest, actor.userId, now) : 0
    await recalcPlanProgress(projectId, [existing.parentId], tx)
    await logDelete(tx, { projectId, entityType: "plan_item", entityId: itemId, actor, row: existing, meta: { trashed: true, subtreeCount: subtree.length } })
    return { deletedCount: 1 + restCount }
  })
}

/**
 * Activity of a reorder: one "move" per reparented item; a pure sort-order
 * change is one project-level row (per-item rows would flood the feed).
 */
async function logPlanMoves(
  tx: Db,
  projectId: string,
  existing: ReadonlyArray<{ id: string; parentId: string | null }>,
  updates: readonly PlanReorderUpdate[],
  actor: Actor | null
): Promise<void> {
  const parentOf = new Map(existing.map((e) => [e.id, e.parentId]))
  const moved = updates.filter((u) => (parentOf.get(u.id) ?? null) !== u.parentId)
  for (const u of moved) {
    await logActivity(tx, {
      projectId,
      entityType: "plan_item",
      entityId: u.id,
      action: "move",
      actor,
      diff: { changes: { parentId: { from: parentOf.get(u.id) ?? null, to: u.parentId } } },
    })
  }
  if (moved.length > 0) return
  await logActivity(tx, {
    projectId,
    entityType: "project",
    entityId: projectId,
    action: "move",
    actor,
    diff: { changes: { planOrder: { changed: true } }, meta: { count: updates.length } },
  })
}

/** Bulk reparent / reorder (drag & drop). Every id and parent must be a live item of the project. */
export async function reorderPlan(projectId: string, updates: readonly PlanReorderUpdate[], actor: Actor | null = null): Promise<void> {
  await withTransaction(async (tx) => {
    const existing = await repo.findPlanItemsByIds(tx, projectId, updates.map((u) => u.id))
    if (existing.length !== new Set(updates.map((u) => u.id)).size) {
      throw new ValidationError("対象の項目が見つかりません", {}, "PLAN_ITEM_NOT_FOUND")
    }
    assertValidReorder(await repo.findPlanTree(tx, projectId), updates)
    for (const u of updates) {
      await repo.updatePlanItem(tx, u.id, { parentId: u.parentId, sortOrder: u.sortOrder })
    }
    const affected = new Set<string>()
    for (const e of existing) if (e.parentId) affected.add(e.parentId)
    for (const u of updates) if (u.parentId) affected.add(u.parentId)
    if (affected.size > 0) await recalcPlanProgress(projectId, Array.from(affected), tx)
    await logPlanMoves(tx, projectId, existing, updates, actor)
  })
}
