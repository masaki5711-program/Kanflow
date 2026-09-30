/**
 * Pure validation / normalization of plan item writes (dates, milestones,
 * parent-derived dates, reorder trees). Throws ValidationError (400).
 */
import type { Prisma } from "@/generated/prisma/client"
import { normalizePlanDate } from "@/lib/plan-progress"
import { INVALID_DATE_MESSAGE } from "@/services/_shared/dates"
import { NotFoundError, ValidationError } from "@/services/_shared/errors"
import { wouldCreateCycle, type TreeNode } from "@/services/_shared/tree"
import type { PlanReorderUpdate, UpdatePlanItemInput } from "./plan.schemas"

export const PARENT_MISSING = "親項目が見つかりません"

/** 404 PLAN_ITEM_NOT_FOUND (missing, trashed or another project's item). */
export const planItemNotFound = () => new NotFoundError("Not found", {}, "PLAN_ITEM_NOT_FOUND")

/** Date-only (UTC midnight) or 400 INVALID_DATE. */
export function planDateOrThrow(value: string): Date {
  const d = normalizePlanDate(value)
  if (!d) throw new ValidationError(INVALID_DATE_MESSAGE, {}, "INVALID_DATE")
  return d
}

/** `undefined` stays undefined, "" / null clears, otherwise a date-only value (400 when invalid). */
export function optionalPlanDate(value: string | null | undefined): Date | null | undefined {
  if (value === undefined) return undefined
  return value ? planDateOrThrow(value) : null
}

function assertRange(start: Date, end: Date): void {
  if (start.getTime() > end.getTime()) {
    throw new ValidationError("開始日は終了日以前にしてください", {}, "PLAN_INVALID_RANGE")
  }
}

export interface PlannedDates {
  plannedStart: Date
  plannedEnd: Date
}

/** Create: normalized planned dates; a milestone is one day (start = end). */
export function resolveCreateDates(input: { plannedStart: string; plannedEnd: string; isMilestone?: boolean }): PlannedDates {
  const plannedStart = planDateOrThrow(input.plannedStart)
  const plannedEnd = planDateOrThrow(input.plannedEnd)
  if (input.isMilestone) return { plannedStart: plannedEnd, plannedEnd }
  assertRange(plannedStart, plannedEnd)
  return { plannedStart, plannedEnd }
}

export interface ExistingDates {
  plannedStart: Date
  plannedEnd: Date
  actualStart: Date | null
  actualEnd: Date | null
  isMilestone: boolean
}

type UpdateFields = Omit<UpdatePlanItemInput, "version">

const sameDay = (a: Date, b: Date) => a.getTime() === b.getTime()

/**
 * Planned-date part of a PATCH. Parents (live children) have derived dates:
 * sending a DIFFERENT date → 400 PLAN_PARENT_DATES_DERIVED (the same date is
 * accepted as a no-op). A milestone collapses to one day (the end date, or
 * the start date when only that was sent). start > end → 400 PLAN_INVALID_RANGE.
 */
function plannedPatch(data: UpdateFields, existing: ExistingDates, hasChildren: boolean): Partial<PlannedDates> {
  const start = data.plannedStart !== undefined ? planDateOrThrow(data.plannedStart) : undefined
  const end = data.plannedEnd !== undefined ? planDateOrThrow(data.plannedEnd) : undefined
  if (hasChildren) {
    const changed = (start && !sameDay(start, existing.plannedStart)) || (end && !sameDay(end, existing.plannedEnd))
    if (changed) {
      throw new ValidationError("子項目を持つ項目の期間は子項目から計算されます", {}, "PLAN_PARENT_DATES_DERIVED")
    }
    return {}
  }
  const isMilestone = data.isMilestone ?? existing.isMilestone
  if (isMilestone) {
    const day = end ?? start ?? existing.plannedEnd
    const unchanged = sameDay(day, existing.plannedStart) && sameDay(day, existing.plannedEnd)
    return unchanged ? {} : { plannedStart: day, plannedEnd: day }
  }
  const nextStart = start ?? existing.plannedStart
  const nextEnd = end ?? existing.plannedEnd
  assertRange(nextStart, nextEnd)
  return { ...(start && { plannedStart: start }), ...(end && { plannedEnd: end }) }
}

function actualPatch(data: UpdateFields, existing: ExistingDates): { actualStart?: Date | null; actualEnd?: Date | null } {
  const actualStart = optionalPlanDate(data.actualStart)
  const actualEnd = optionalPlanDate(data.actualEnd)
  const s = actualStart === undefined ? existing.actualStart : actualStart
  const e = actualEnd === undefined ? existing.actualEnd : actualEnd
  if (s && e && (actualStart !== undefined || actualEnd !== undefined)) assertRange(s, e)
  return { ...(actualStart !== undefined && { actualStart }), ...(actualEnd !== undefined && { actualEnd }) }
}

/**
 * Pure: the Prisma update payload for a PATCH (only the provided fields),
 * dates validated and normalized. Derived columns (progressPct, parent
 * status / dates) are left to the recalculation.
 */
export function buildPlanUpdate(data: UpdateFields, existing: ExistingDates, hasChildren: boolean): Prisma.PlanItemUncheckedUpdateManyInput {
  return {
    ...(data.name !== undefined && { name: data.name }),
    ...(data.description !== undefined && { description: data.description }),
    ...(data.notes !== undefined && { notes: data.notes }),
    ...(data.parentId !== undefined && { parentId: data.parentId }),
    ...plannedPatch(data, existing, hasChildren),
    ...actualPatch(data, existing),
    ...(data.isMilestone !== undefined && { isMilestone: data.isMilestone }),
    ...(data.color !== undefined && { color: data.color }),
    ...(data.status !== undefined && { status: data.status }),
    ...(data.sortOrder !== undefined && { sortOrder: data.sortOrder }),
    ...(data.ownerId !== undefined && { ownerId: data.ownerId }),
    ...(data.progressMode !== undefined && { progressMode: data.progressMode }),
  }
}

export const PLAN_LINK_MILESTONE_MESSAGE = "マイルストーンには PBI を紐付けられません"

/** 400 PLAN_LINK_MILESTONE: milestones never take PBI links (no "linked" progress mode either). */
export function milestoneLinkError(): ValidationError {
  return new ValidationError(PLAN_LINK_MILESTONE_MESSAGE, {}, "PLAN_LINK_MILESTONE")
}

/** Pure: 400 PLAN_LINK_MILESTONE when the item would be a milestone in "linked" progress mode. */
export function assertMilestoneNotLinked(isMilestone: boolean, progressMode: string): void {
  if (isMilestone && progressMode === "linked") throw milestoneLinkError()
}

/** Reparent guard against the live tree: parent exists, not itself, not a descendant. */
export function assertValidParent(tree: readonly TreeNode[], itemId: string, parentId: string): void {
  if (parentId === itemId) throw new ValidationError("自分自身を親にできません", {}, "PLAN_SELF_PARENT")
  if (!tree.some((n) => n.id === parentId)) throw new ValidationError(PARENT_MISSING, {}, "PLAN_PARENT_NOT_FOUND")
  if (wouldCreateCycle(tree, itemId, parentId)) throw new ValidationError("循環参照になります", {}, "PLAN_CYCLE")
}

/**
 * Pure: every non-null target parent is a live plan item of the same
 * project, no item becomes its own parent, and the tree after applying ALL
 * updates is acyclic (a batch can swap parents, so each update is checked
 * against the final state, not the current one).
 */
export function assertValidReorder(tree: readonly TreeNode[], updates: readonly PlanReorderUpdate[]): void {
  const ids = new Set(tree.map((n) => n.id))
  for (const u of updates) {
    if (u.parentId === null) continue
    if (u.parentId === u.id) throw new ValidationError("自分自身を親にできません", {}, "PLAN_SELF_PARENT")
    if (!ids.has(u.parentId)) throw new ValidationError(PARENT_MISSING, {}, "PLAN_PARENT_NOT_FOUND")
  }
  const nextParent = new Map(updates.map((u) => [u.id, u.parentId]))
  const finalTree = tree.map((n) => (nextParent.has(n.id) ? { id: n.id, parentId: nextParent.get(n.id) ?? null } : n))
  for (const u of updates) {
    if (u.parentId && wouldCreateCycle(finalTree, u.id, u.parentId)) {
      throw new ValidationError("循環参照になります", {}, "PLAN_CYCLE")
    }
  }
}

/** Pure: `rootId` and the descendants trashed in the same batch (same deletedAt), cycle-safe. */
export function collectTrashBatch(
  rows: ReadonlyArray<{ id: string; parentId: string | null; deletedAt: Date | null }>,
  rootId: string
): string[] {
  const root = rows.find((r) => r.id === rootId)
  const stamp = root?.deletedAt?.getTime()
  if (!root || stamp === undefined) return []
  const children = new Map<string, string[]>()
  for (const r of rows) {
    if (r.parentId && r.deletedAt?.getTime() === stamp) children.set(r.parentId, [...(children.get(r.parentId) ?? []), r.id])
  }
  const out: string[] = []
  const seen = new Set<string>()
  const stack = [rootId]
  while (stack.length > 0) {
    const id = stack.pop() as string
    if (seen.has(id)) continue
    seen.add(id)
    out.push(id)
    stack.push(...(children.get(id) ?? []))
  }
  return out
}
