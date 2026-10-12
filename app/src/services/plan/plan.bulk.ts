/**
 * 一括編集: shift / owner / status on many plan rows at once (preview, then
 * apply). A shift is one versioned transaction on the LEAF rows covered;
 * owner / status go through updatePlanItem so progress, translation and
 * versioning rules stay in one place.
 */
import { addBusinessDays } from "@/lib/business-days"
import { dateFromKey, recalcPlanProgress, type PlanStatus } from "@/lib/plan-progress"
import type { Actor } from "@/services/_shared/actor"
import { logActivity, logUpdate } from "@/services/_shared/activity"
import { withTransaction, type Db } from "@/services/_shared/db"
import { ConflictError, ValidationError } from "@/services/_shared/errors"
import type { BulkPlanInput } from "./plan.assist.schemas"
import * as repo from "./plan.repository"
import { assertOwnerMember, loadPlanSnapshot, type PlanSnapshot } from "./plan.snapshot"

export type BulkSkipReason = "undated" | "done" | "started" | "derived" | "not_found"

export interface BulkResult {
  applied: boolean
  updated: number
  moved: Array<{ id: string; name: string; plannedStart: string; plannedEnd: string; newStart: string; newEnd: string }>
  skipped: Array<{ id: string; name: string; reason: BulkSkipReason }>
}

type Node = PlanSnapshot["nodes"][number]
type ShiftOp = Extract<BulkPlanInput["op"], { type: "shift" }>

const DAY_MS = 86_400_000
/** Most leaves a fromDate target may cover. */
export const BULK_FROM_DATE_MAX = 500
const STALE_MESSAGE = "計画が更新されました。内容を確認してもう一度お試しください"

const skip = (id: string, name: string, reason: BulkSkipReason) => ({ id, name, reason })
const isDone = (n: Node): boolean => n.status === "done" || n.actualEnd !== null

function childMap(nodes: readonly Node[]): Map<string, string[]> {
  const out = new Map<string, string[]>()
  for (const n of nodes) if (n.parentId) out.set(n.parentId, [...(out.get(n.parentId) ?? []), n.id])
  return out
}

/** Live leaf ids under `id` (itself when a leaf), in plan order. */
function leafIdsUnder(children: ReadonlyMap<string, string[]>, id: string, seen: Set<string> = new Set()): string[] {
  if (seen.has(id)) return []
  seen.add(id)
  const kids = children.get(id) ?? []
  return kids.length === 0 ? [id] : kids.flatMap((k) => leafIdsUnder(children, k, seen))
}

/** Resolve the target to leaf ids (ids: parents expand, unknown ids are reported; fromDate: later, unstarted, unfinished leaves). */
function resolveLeaves(snap: PlanSnapshot, target: BulkPlanInput["target"], skipped: BulkResult["skipped"]): string[] {
  const known = new Set(snap.nodes.map((n) => n.id))
  const children = childMap(snap.nodes)
  if ("fromDate" in target) {
    const leaves = snap.nodes
      .filter((n) => !children.has(n.id) && n.plannedStart !== null && n.plannedStart >= target.fromDate && !isDone(n) && n.actualStart === null)
      .map((n) => n.id)
    if (leaves.length > BULK_FROM_DATE_MAX) {
      throw new ValidationError(`対象が多すぎます（${BULK_FROM_DATE_MAX} 件まで）`, {}, "VALIDATION")
    }
    return leaves
  }
  const out = new Set<string>()
  for (const id of target.ids) {
    if (!known.has(id)) skipped.push(skip(id, "", "not_found"))
    else for (const leaf of leafIdsUnder(children, id)) out.add(leaf)
  }
  return [...out]
}

function shiftKey(key: string, op: ShiftOp): string {
  if (op.businessDays) return addBusinessDays(key, op.days)
  return new Date(Date.parse(`${key}T00:00:00Z`) + op.days * DAY_MS).toISOString().slice(0, 10)
}

/** Pure: the moves and skips of a shift over the target leaves (a milestone keeps start = end). */
function planBulkShift(snap: PlanSnapshot, leafIds: readonly string[], op: ShiftOp, skipped: BulkResult["skipped"]): BulkResult["moved"] {
  const byId = new Map(snap.nodes.map((n) => [n.id, n]))
  const milestone = new Map(snap.rows.map((r) => [r.id, r.isMilestone]))
  const moved: BulkResult["moved"] = []
  for (const id of leafIds) {
    const n = byId.get(id) as Node
    if (!n.plannedStart || !n.plannedEnd) skipped.push(skip(id, n.name, "undated"))
    else if (isDone(n)) skipped.push(skip(id, n.name, "done"))
    else if (n.actualStart) skipped.push(skip(id, n.name, "started"))
    else {
      const newStart = shiftKey(n.plannedStart, op)
      const newEnd = milestone.get(id) ? newStart : shiftKey(n.plannedEnd, op)
      if (newStart !== n.plannedStart || newEnd !== n.plannedEnd) {
        moved.push({ id, name: n.name, plannedStart: n.plannedStart, plannedEnd: n.plannedEnd, newStart, newEnd })
      }
    }
  }
  return moved
}

async function writeShift(tx: Db, projectId: string, snap: PlanSnapshot, moved: BulkResult["moved"], actor: Actor): Promise<void> {
  const versionOf = new Map(snap.rows.map((r) => [r.id, r.version]))
  for (const m of moved) {
    // Versioned: a row edited since the snapshot is not overwritten.
    const written = await repo.updatePlanItemVersioned(tx, projectId, m.id, { plannedStart: dateFromKey(m.newStart), plannedEnd: dateFromKey(m.newEnd) }, versionOf.get(m.id))
    if (!written) throw new ConflictError(STALE_MESSAGE)
  }
  await recalcPlanProgress(projectId, moved.map((m) => m.id), tx)
  await logActivity(tx, {
    projectId,
    entityType: "project",
    entityId: projectId,
    action: "update",
    actor,
    diff: { changes: { planBulkShift: { from: null, to: moved.length } }, meta: { count: moved.length } },
  })
}

async function bulkShift(projectId: string, input: BulkPlanInput, op: ShiftOp, actor: Actor): Promise<BulkResult> {
  return withTransaction(async (tx) => {
    const snap = await loadPlanSnapshot(tx, projectId)
    const skipped: BulkResult["skipped"] = []
    const moved = planBulkShift(snap, resolveLeaves(snap, input.target, skipped), op, skipped)
    const applied = input.apply && moved.length > 0
    if (applied) await writeShift(tx, projectId, snap, moved, actor)
    return { applied, updated: moved.length, moved, skipped }
  })
}

/** Rows whose status is derived (parents, linked leaves with PBIs) are not set by hand. */
async function derivedIds(projectId: string, snap: PlanSnapshot, db: Db): Promise<Set<string>> {
  const pbis = await repo.findLinkedPbisOfProject(db, projectId)
  const linkedWithPbis = new Set(pbis.map((p) => p.planItemId))
  const children = childMap(snap.nodes)
  return new Set(snap.rows.filter((r) => children.has(r.id) || (r.progressMode === "linked" && linkedWithPbis.has(r.id))).map((r) => r.id))
}

/** ids targets: parents included (owner) / skipped as derived (status); fromDate targets: leaves. */
function resolveFieldTargets(snap: PlanSnapshot, target: BulkPlanInput["target"], skipped: BulkResult["skipped"]): string[] {
  if (!("ids" in target)) return resolveLeaves(snap, target, skipped)
  const known = new Set(snap.rows.map((r) => r.id))
  const ids = [...new Set(target.ids)]
  for (const id of ids) if (!known.has(id)) skipped.push(skip(id, "", "not_found"))
  return ids.filter((id) => known.has(id))
}

/** Versioned owner / status write of one row inside the caller's transaction (progress is recalculated by the caller). */
async function writeField(tx: Db, projectId: string, row: PlanSnapshot["rows"][number], patch: { ownerId: string | null } | { status: PlanStatus }, actor: Actor): Promise<void> {
  const updated = await repo.updatePlanItemVersioned(tx, projectId, row.id, patch, row.version)
  if (!updated) throw new ConflictError(STALE_MESSAGE)
  await logUpdate(tx, { projectId, entityType: "plan_item", entityId: row.id, actor, before: row, after: updated })
}

/** owner / status: all rows in ONE transaction, version-guarded; any failure rolls everything back. */
async function bulkFieldEdit(projectId: string, input: BulkPlanInput, actor: Actor): Promise<BulkResult> {
  const op = input.op as Exclude<BulkPlanInput["op"], ShiftOp>
  return withTransaction(async (tx) => {
    const snap = await loadPlanSnapshot(tx, projectId)
    const rowOf = new Map(snap.rows.map((r) => [r.id, r]))
    const skipped: BulkResult["skipped"] = []
    const ids = resolveFieldTargets(snap, input.target, skipped)
    if (op.type === "owner") await assertOwnerMember(tx, projectId, op.ownerId)
    const derived = op.type === "status" ? await derivedIds(projectId, snap, tx) : new Set<string>()
    const todo: Array<(typeof snap.rows)[number]> = []
    for (const id of ids) {
      const row = rowOf.get(id) as (typeof snap.rows)[number]
      if (derived.has(id)) skipped.push(skip(id, row.name, "derived"))
      else if (op.type === "owner" ? row.ownerId !== op.ownerId : row.status !== op.status) todo.push(row)
    }
    if (input.apply && todo.length > 0) {
      const patch = op.type === "owner" ? { ownerId: op.ownerId } : { status: op.status as PlanStatus }
      for (const row of todo) await writeField(tx, projectId, row, patch, actor)
      if (op.type === "status") await recalcPlanProgress(projectId, todo.map((r) => r.id), tx)
    }
    return { applied: input.apply && todo.length > 0, updated: todo.length, moved: [], skipped }
  })
}

/** Preview (apply=false) or apply one operation on the targeted plan rows. */
export async function bulkEditPlan(projectId: string, input: BulkPlanInput, actor: Actor): Promise<BulkResult> {
  const op = input.op
  return op.type === "shift" ? bulkShift(projectId, input, op, actor) : bulkFieldEdit(projectId, input, actor)
}
