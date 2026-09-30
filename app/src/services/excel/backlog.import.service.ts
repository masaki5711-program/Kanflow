/**
 * POST /backlog/import: dry run (preview) or commit of a backlog workbook.
 *
 * The commit re-validates against the current data and writes every row in
 * ONE transaction through the backlog service's create / update bodies, so
 * each PBI gets its activity row, translation enqueue, version bump, plan
 * recalculation and PO notification exactly as when edited in the UI. Any row
 * error (or a failure mid-way) leaves the backlog untouched.
 */
import type { Actor } from "@/services/_shared/actor"
import { defaultDb, withTransaction, type Db } from "@/services/_shared/db"
import { ValidationError, rethrowPrisma } from "@/services/_shared/errors"
import { LIST_LIMITS } from "@/services/_shared/limits"
import { assertProjectLive, notDeleted } from "@/services/_shared/soft-delete"
import { prepareText } from "@/services/_shared/translations"
import { DISPLAY_ID_CONFLICT, retryOnUniqueViolation } from "@/services/_shared/unique-retry"
import { emptyLinksToNull, insertBacklogItemIn, updateBacklogItemIn } from "@/services/backlog/backlog.service"
import {
  goalIndex,
  planImport,
  readImportSheet,
  referencedDisplayIds,
  summarize,
  type ExistingPbi,
  type ImportAction,
  type ImportRowError,
  type ImportSummary,
  type PlannedRow,
} from "./backlog.import"
import { findExportProject } from "./excel.project"

/** One preview row as the API returns it (no internal ids / payloads). */
export interface ImportPreviewRow {
  rowNumber: number
  action: ImportAction
  displayId: number | null
  label: string
  fields: string[]
  errors: ImportRowError[]
}

export interface ImportResult {
  dryRun: boolean
  summary: ImportSummary
  rows: ImportPreviewRow[]
  /** Commit only: what was written. */
  created?: number
  updated?: number
}

function toPreview(r: PlannedRow): ImportPreviewRow {
  return { rowNumber: r.rowNumber, action: r.action, displayId: r.displayId, label: r.label, fields: r.fields, errors: r.errors }
}

export function findPbisByDisplayIds(db: Db, projectId: string, displayIds: readonly number[]): Promise<ExistingPbi[]> {
  if (displayIds.length === 0) return Promise.resolve([])
  return db.productBacklogItem.findMany({
    where: notDeleted({ projectId, displayId: { in: [...displayIds] } }),
    select: {
      id: true,
      displayId: true,
      initiative: true,
      epic: true,
      userStory: true,
      acceptanceCriteria: true,
      referenceDoc: true,
      workloadScore: true,
      status: true,
      assignedPo: true,
      poNote: true,
      notReadyReason: true,
      productGoalId: true,
    },
  })
}

export function findProjectGoals(db: Db, projectId: string) {
  return db.productGoal.findMany({
    where: { projectId },
    select: { id: true, title: true },
    orderBy: { createdAt: "asc" },
    take: LIST_LIMITS.productGoals,
  })
}

/** Read + validate + plan against the current data (no writes). */
export async function previewImport(db: Db, projectId: string, buffer: Buffer | Uint8Array): Promise<PlannedRow[]> {
  const project = await findExportProject(db, projectId)
  const sheet = await readImportSheet(buffer, project.projectType)
  const [existing, goals] = await Promise.all([
    findPbisByDisplayIds(db, projectId, referencedDisplayIds(sheet.rows)),
    findProjectGoals(db, projectId),
  ])
  return planImport(sheet.rows, { existing: new Map(existing.map((p) => [p.displayId, p])), goals: goalIndex(goals) })
}

type Write = { kind: "create"; data: NonNullable<PlannedRow["create"]> } | { kind: "update"; id: string; data: NonNullable<PlannedRow["update"]>["data"] }

/** Glossary markup is stripped (and registered) before the transaction, like the single-PBI services. */
async function prepareWrites(planned: readonly PlannedRow[], actor: Actor): Promise<Write[]> {
  const writes: Write[] = []
  for (const r of planned) {
    if (r.create) writes.push({ kind: "create", data: await prepareText(r.create, actor.userId) })
    else if (r.update) writes.push({ kind: "update", id: r.update.id, data: emptyLinksToNull(await prepareText(r.update.data, actor.userId)) })
  }
  return writes
}

function applyWrites(projectId: string, writes: readonly Write[], actor: Actor): Promise<void> {
  return withTransaction(async (tx) => {
    await assertProjectLive(tx, projectId)
    for (const w of writes) {
      if (w.kind === "create") await insertBacklogItemIn(tx, projectId, w.data, actor)
      else await updateBacklogItemIn(tx, projectId, w.id, w.data, actor)
    }
  })
}

export async function importBacklog(
  projectId: string,
  buffer: Buffer | Uint8Array,
  actor: Actor,
  opts: { dryRun: boolean }
): Promise<ImportResult> {
  const planned = await previewImport(defaultDb, projectId, buffer)
  const summary = summarize(planned)
  const rows = planned.map(toPreview)
  if (opts.dryRun) return { dryRun: true, summary, rows }
  if (summary.error > 0) {
    throw new ValidationError("The file has rows with errors", { reason: "ROW_ERRORS", summary, rows }, "VALIDATION")
  }
  const writes = await prepareWrites(planned, actor)
  if (writes.length > 0) {
    await retryOnUniqueViolation(() => applyWrites(projectId, writes, actor)).catch((err: unknown) =>
      rethrowPrisma(err, { conflict: DISPLAY_ID_CONFLICT })
    )
  }
  return { dryRun: false, summary, rows, created: summary.create, updated: summary.update }
}
