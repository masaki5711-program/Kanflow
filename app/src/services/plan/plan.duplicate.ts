/**
 * 複製: copy a plan item and its live subtree as new rows under the same
 * parent (placed after the siblings). Copied: text, planned dates, milestone
 * flag, colour, owner, 目安期間, and the dependencies whose BOTH ends are
 * inside the copied subtree. Reset: status, progress, actual dates, baseline,
 * PBI links (a "linked" row becomes "manual").
 */
import { recalcPlanProgress } from "@/lib/plan-progress"
import type { Actor } from "@/services/_shared/actor"
import { logCreate } from "@/services/_shared/activity"
import { withTransaction } from "@/services/_shared/db"
import { ValidationError } from "@/services/_shared/errors"
import { collectSubtreeIds } from "@/services/_shared/tree"
import { enqueueIn, prepareText } from "@/services/_shared/translations"
import type { DuplicatePlanInput } from "./plan.assist.schemas"
import * as repo from "./plan.repository"
import { planItemNotFound } from "./plan.rules"

/** Most rows one duplicate may create. */
export const PLAN_DUPLICATE_MAX = 300
export const DEFAULT_COPY_SUFFIX = " (copy)"
const NAME_MAX = 255

export interface DuplicateResult {
  /** New row ids, the root first. */
  createdIds: string[]
  rootId: string
}

type Row = Awaited<ReturnType<typeof repo.findPlanItems>>[number]

/** The root's name + suffix, cut so it stays within the column. */
export function copyName(name: string, suffix: string): string {
  return name.slice(0, Math.max(0, NAME_MAX - suffix.length)) + suffix
}

/** The subtree rows, every parent before its children, siblings in plan order. */
function subtreeInOrder(rows: readonly Row[], rootId: string): Row[] {
  const inTree = new Set(collectSubtreeIds(rows, rootId))
  const children = new Map<string, Row[]>()
  for (const r of rows) if (r.parentId && inTree.has(r.id)) children.set(r.parentId, [...(children.get(r.parentId) ?? []), r])
  const out: Row[] = []
  const queue = [rows.find((r) => r.id === rootId) as Row]
  while (queue.length > 0) {
    const cur = queue.shift() as Row
    out.push(cur)
    queue.push(...(children.get(cur.id) ?? []))
  }
  return out
}

function copyData(projectId: string, src: Row, parentId: string | null, name: string, sortOrder: number) {
  return {
    projectId,
    parentId,
    name,
    description: src.description,
    notes: src.notes,
    plannedStart: src.plannedStart,
    plannedEnd: src.plannedEnd,
    isMilestone: src.isMilestone,
    color: src.color,
    status: "not_started",
    progressPct: 0,
    progressMode: "manual",
    ownerId: src.ownerId,
    durationDays: src.durationDays,
    sortOrder,
  }
}

/** Copy `itemId` and its live subtree; 400 VALIDATION above PLAN_DUPLICATE_MAX rows. */
export async function duplicatePlanItem(projectId: string, itemId: string, input: DuplicatePlanInput, actor: Actor): Promise<DuplicateResult> {
  const suffix = input.suffix ?? DEFAULT_COPY_SUFFIX
  return withTransaction(async (tx) => {
    const rows = await repo.findPlanItems(tx, projectId)
    const source = rows.find((r) => r.id === itemId)
    if (!source) throw planItemNotFound()
    const tree = subtreeInOrder(rows, itemId)
    if (tree.length > PLAN_DUPLICATE_MAX) {
      throw new ValidationError(`複製できるのは ${PLAN_DUPLICATE_MAX} 件までです`, {}, "VALIDATION")
    }
    const { name } = await prepareText({ name: copyName(source.name, suffix) }, actor.userId)
    const idMap = new Map<string, string>()
    const created: Array<Awaited<ReturnType<typeof repo.insertPlanItem>>> = []
    for (const src of tree) {
      const isRoot = src.id === itemId
      const parentId = isRoot ? source.parentId : (idMap.get(src.parentId as string) ?? null)
      const sortOrder = isRoot ? await repo.nextPlanSortOrder(tx, projectId, source.parentId) : src.sortOrder
      const row = await repo.insertPlanItem(tx, copyData(projectId, src, parentId, isRoot ? name : src.name, sortOrder))
      idMap.set(src.id, row.id)
      created.push(row)
      await enqueueIn(tx, "plan_item", row.id, row)
    }
    for (const d of await repo.findDependencies(tx, projectId)) {
      const pred = idMap.get(d.predecessorId)
      const succ = idMap.get(d.successorId)
      if (pred && succ) await repo.insertDependency(tx, { projectId, predecessorId: pred, successorId: succ })
    }
    await recalcPlanProgress(projectId, [...idMap.values(), source.parentId], tx)
    await logCreate(tx, { projectId, entityType: "plan_item", entityId: created[0].id, actor, row: created[0], meta: { duplicatedFrom: itemId, count: created.length } })
    return { createdIds: created.map((r) => r.id), rootId: created[0].id }
  })
}
