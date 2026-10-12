/**
 * 一括取り込み: a flat outline (depth 0 = child of `parentId`, or top level)
 * becomes plan rows in ONE transaction. Every row is validated first; any
 * error is returned per row and nothing is written.
 */
import { normalizePlanDate, recalcPlanProgress, statusToProgress } from "@/lib/plan-progress"
import type { Actor } from "@/services/_shared/actor"
import { logActivity, logCreate } from "@/services/_shared/activity"
import { defaultDb, withTransaction, type Db } from "@/services/_shared/db"
import { enqueueIn, prepareText } from "@/services/_shared/translations"
import { PLAN_IMPORT_MAX_DEPTH, type ImportPlanInput } from "./plan.assist.schemas"
import * as repo from "./plan.repository"

export type ImportErrorCode = "name" | "dates" | "order" | "depth" | "owner" | "parent"

export interface ImportRowError {
  row: number
  code: ImportErrorCode
}

export interface ImportResult {
  applied: boolean
  count: number
  errors: ImportRowError[]
  createdIds: string[]
}

type ImportRow = ImportPlanInput["rows"][number]
export interface CheckedRow extends ImportRow {
  start: Date | null
  end: Date | null
}

/** Top-level rows that get their own "create" activity row per import. */
const CREATE_LOG_CAP = 20
const MEMBER_CHECK_BATCH = 20

/** Date of a row: both-or-neither, valid, end >= start. A milestone is one day: start = end, or only one of them. */
function rowDates(r: ImportRow): { start: Date | null; end: Date | null } | null {
  const start = r.plannedStart ? normalizePlanDate(r.plannedStart) : null
  const end = r.plannedEnd ? normalizePlanDate(r.plannedEnd) : null
  if ((r.plannedStart && !start) || (r.plannedEnd && !end)) return null
  if (r.isMilestone) {
    if (start && end && start.getTime() !== end.getTime()) return null
    const day = start ?? end
    return { start: day, end: day }
  }
  if ((start === null) !== (end === null)) return null
  if (start && end && start.getTime() > end.getTime()) return null
  return { start, end }
}

/** Pure: per-row errors and the rows with parsed dates (members = the allowed owner ids). */
export function checkImportRows(rows: readonly ImportRow[], members: ReadonlySet<string>): { errors: ImportRowError[]; checked: CheckedRow[] } {
  const errors: ImportRowError[] = []
  const checked: CheckedRow[] = []
  let prevDepth = -1
  rows.forEach((r, i) => {
    const row = i + 1
    const dates = rowDates(r)
    if (r.name.trim() === "") errors.push({ row, code: "name" })
    if (r.depth < 0 || r.depth > PLAN_IMPORT_MAX_DEPTH) errors.push({ row, code: "depth" })
    else if (r.depth > prevDepth + 1) errors.push({ row, code: "order" })
    if (!dates) errors.push({ row, code: "dates" })
    if (r.ownerId && !members.has(r.ownerId)) errors.push({ row, code: "owner" })
    prevDepth = r.depth
    checked.push({ ...r, name: r.name.trim(), start: dates?.start ?? null, end: dates?.end ?? null })
  })
  return { errors, checked }
}

async function memberSet(db: Db, projectId: string, rows: readonly ImportRow[]): Promise<Set<string>> {
  const owners = [...new Set(rows.map((r) => r.ownerId).filter((id): id is string => !!id))]
  const members = new Set<string>()
  // Distinct ids only, in small batches (up to 500 rows must not open 500 parallel queries).
  for (let i = 0; i < owners.length; i += MEMBER_CHECK_BATCH) {
    const batch = owners.slice(i, i + MEMBER_CHECK_BATCH)
    const flags = await Promise.all(batch.map((id) => repo.isProjectMember(db, projectId, id)))
    batch.forEach((id, k) => flags[k] && members.add(id))
  }
  return members
}

async function insertRows(tx: Db, projectId: string, parentId: string | null, rows: readonly CheckedRow[], actor: Actor): Promise<string[]> {
  const lastAtDepth: Array<string | null> = []
  const nextSort = new Map<string | null, number>()
  const created: string[] = []
  let topLevel = 0
  for (const r of rows) {
    const rowParent = r.depth === 0 ? parentId : (lastAtDepth[r.depth - 1] ?? null)
    if (!nextSort.has(rowParent)) nextSort.set(rowParent, await repo.nextPlanSortOrder(tx, projectId, rowParent))
    const sortOrder = nextSort.get(rowParent) as number
    nextSort.set(rowParent, sortOrder + 1)
    const name = r.name.includes("<<") ? (await prepareText({ name: r.name }, actor.userId)).name : r.name
    const row = await repo.insertPlanItem(tx, {
      projectId,
      parentId: rowParent,
      name,
      plannedStart: r.start,
      plannedEnd: r.end,
      isMilestone: r.isMilestone ?? false,
      status: "not_started",
      progressPct: statusToProgress("not_started"),
      progressMode: "manual",
      ownerId: r.ownerId,
      sortOrder,
    })
    lastAtDepth[r.depth] = row.id
    lastAtDepth.length = r.depth + 1
    created.push(row.id)
    await enqueueIn(tx, "plan_item", row.id, row)
    if (r.depth === 0 && topLevel++ < CREATE_LOG_CAP) await logCreate(tx, { projectId, entityType: "plan_item", entityId: row.id, actor, row })
  }
  return created
}

const parentError = (checked: readonly CheckedRow[]): ImportResult => ({ applied: false, count: checked.length, errors: [{ row: 1, code: "parent" }], createdIds: [] })

/** Validate (and with apply=true and no error, write) the outline. The parent is checked inside the write transaction. */
export async function importPlanRows(projectId: string, input: ImportPlanInput, actor: Actor): Promise<ImportResult> {
  const parentId = input.parentId ?? null
  const members = await memberSet(defaultDb, projectId, input.rows)
  const { errors, checked } = checkImportRows(input.rows, members)
  if (errors.length > 0) return { applied: false, count: checked.length, errors, createdIds: [] }
  if (!input.apply) {
    const parentOk = parentId === null || (await repo.findPlanItem(defaultDb, projectId, parentId)) !== null
    return parentOk ? { applied: false, count: checked.length, errors: [], createdIds: [] } : parentError(checked)
  }
  return withTransaction(async (tx) => {
    if (parentId && !(await repo.findPlanItem(tx, projectId, parentId))) return parentError(checked)
    const ids = await insertRows(tx, projectId, parentId, checked, actor)
    await recalcPlanProgress(projectId, [...ids, parentId], tx)
    await logActivity(tx, {
      projectId,
      entityType: "project",
      entityId: projectId,
      action: "update",
      actor,
      diff: { changes: { planImport: { from: null, to: ids.length } }, meta: { count: ids.length } },
    })
    return { applied: true, count: ids.length, errors: [], createdIds: ids }
  })
}
