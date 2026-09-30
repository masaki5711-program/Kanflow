/**
 * Backlog Excel import — the pure part: read the sheet, validate each row
 * with the backlog schemas and plan create / update / skip. No I/O besides
 * parsing the given buffer; the DB context (existing PBIs, goals) is passed in.
 *
 * Rules:
 * - Columns are recognised by header (any language; the project's own type
 *   wording first, then the other types', or the field key); unknown columns
 *   (sprint, dates, JA / ID columns) are ignored.
 * - An empty cell means "leave unchanged"; fully empty rows are ignored.
 * - A row with an ID updates that live PBI (only the filled, changed fields);
 *   a row without an ID creates a PBI (needs a user story or an initiative).
 */
import ExcelJS from "exceljs"
import type { ProjectType } from "@/lib/project-type-labels"
import { ValidationError } from "@/services/_shared/errors"
import { createBacklogItemSchema, type CreateBacklogItemInput, type UpdateBacklogItemInput } from "@/services/backlog/backlog.schemas"
import { IMPORT_FIELDS, backlogHeaderMap, backlogStatusMap, normalizeHeader, type ImportField } from "./backlog.columns"
import { IMPORT_MAX_BYTES, IMPORT_MAX_ROWS } from "./excel.limits"
import { loadWorkbook } from "./excel.shared"

export { IMPORT_MAX_BYTES, IMPORT_MAX_ROWS }
/** userStory has no schema limit; keep it within a MySQL TEXT column (3-byte UTF-8). */
export const USER_STORY_MAX = 20_000
const POINTS_MAX = 1_000_000

export type ImportErrorCode =
  | "PBI_NOT_FOUND"
  | "INVALID_ID"
  | "DUPLICATE_ID"
  | "INVALID_STATUS"
  | "INVALID_POINTS"
  | "TOO_LONG"
  | "GOAL_NOT_FOUND"
  | "EMPTY_STORY"
  | "INVALID"

export interface ImportRowError {
  code: ImportErrorCode
  field?: ImportField
  value?: string
}

export type ImportAction = "create" | "update" | "skip"

export interface ParsedRow {
  /** 1-based sheet row number (the header is row 1). */
  rowNumber: number
  /** Non-empty trimmed cell texts of recognised columns. */
  cells: Partial<Record<ImportField, string>>
}

export interface ParsedSheet {
  columns: ImportField[]
  rows: ParsedRow[]
}

/** Comparable fields of an existing PBI (for update / skip). */
export interface ExistingPbi {
  id: string
  displayId: number
  initiative: string | null
  epic: string | null
  userStory: string | null
  acceptanceCriteria: string | null
  referenceDoc: string | null
  workloadScore: number
  status: string
  assignedPo: string | null
  poNote: string | null
  notReadyReason: string | null
  productGoalId: string | null
}

export interface ImportContext {
  /** Live PBIs of the project by displayId (only the ids the sheet mentions are needed). */
  existing: ReadonlyMap<number, ExistingPbi>
  /** Product goals of the project: normalized title → id. */
  goals: ReadonlyMap<string, string>
}

export interface PlannedRow {
  rowNumber: number
  action: ImportAction
  displayId: number | null
  /** Short text to recognise the row in the preview. */
  label: string
  /** Fields that will be written (create: filled fields; update: changed fields). */
  fields: string[]
  errors: ImportRowError[]
  create?: CreateBacklogItemInput
  update?: { id: string; data: UpdateBacklogItemInput }
}

export interface ImportSummary {
  total: number
  create: number
  update: number
  skip: number
  error: number
}

/** Rejected before any row is looked at (400; `reason` is localized by the client). */
export type ImportFileProblem = "UNREADABLE" | "NO_HEADER" | "TOO_MANY_ROWS"

export function importFileError(reason: ImportFileProblem, message: string): ValidationError {
  return new ValidationError(message, { reason, maxRows: IMPORT_MAX_ROWS }, "VALIDATION")
}

// === reading ===

/** Plain text of any exceljs cell value (rich text, formulas' results, hyperlinks, dates). */
export function cellText(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return ""
  if (value instanceof Date) return value.toISOString()
  if (typeof value === "object") {
    if ("richText" in value && Array.isArray(value.richText)) return value.richText.map((r) => r.text).join("")
    if ("result" in value) return cellText((value.result ?? null) as ExcelJS.CellValue)
    if ("text" in value && typeof value.text === "string") return value.text
    if ("error" in value) return ""
    return ""
  }
  return String(value)
}

/** Header cell → import field, or null (unknown / export-only column). */
function importFieldOf(header: string, projectType: ProjectType): ImportField | null {
  const field = backlogHeaderMap(projectType).get(normalizeHeader(header))
  return field && (IMPORT_FIELDS as readonly string[]).includes(field) ? (field as ImportField) : null
}

function headerColumns(ws: ExcelJS.Worksheet, projectType: ProjectType): Map<number, ImportField> {
  const cols = new Map<number, ImportField>()
  ws.getRow(1).eachCell((cell, col) => {
    const field = importFieldOf(cellText(cell.value), projectType)
    if (field && ![...cols.values()].includes(field)) cols.set(col, field)
  })
  return cols
}

function readRows(ws: ExcelJS.Worksheet, cols: ReadonlyMap<number, ImportField>): ParsedRow[] {
  const rows: ParsedRow[] = []
  ws.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return
    const cells: Partial<Record<ImportField, string>> = {}
    for (const [col, field] of cols) {
      const text = cellText(row.getCell(col).value).replace(/\r\n/g, "\n").trim()
      if (text) cells[field] = text
    }
    if (Object.keys(cells).length > 0) rows.push({ rowNumber, cells })
    if (rows.length > IMPORT_MAX_ROWS) throw importFileError("TOO_MANY_ROWS", `More than ${IMPORT_MAX_ROWS} rows`)
  })
  return rows
}

/**
 * The first worksheet whose header row names at least one import column
 * (so the template's instructions sheet is skipped wherever it sits).
 */
export async function readImportSheet(buffer: Buffer | Uint8Array, projectType: ProjectType = "software"): Promise<ParsedSheet> {
  let wb: ExcelJS.Workbook
  try {
    wb = await loadWorkbook(buffer)
  } catch {
    throw importFileError("UNREADABLE", "The file is not a readable .xlsx workbook")
  }
  for (const ws of wb.worksheets) {
    const cols = headerColumns(ws, projectType)
    if (cols.size > 0) return { columns: [...cols.values()], rows: readRows(ws, cols) }
  }
  throw importFileError("NO_HEADER", "No recognisable header row")
}

// === validation / planning ===

const DISPLAY_ID = /^(?:pbi[\s-]*|#\s*)?(\d{1,9})(?:\.0+)?$/i

/** "12" / "#12" / "PBI-12" / "12.0" (a number cell) → 12; anything else → null. */
export function parseImportDisplayId(raw: string): number | null {
  const m = DISPLAY_ID.exec(raw.normalize("NFKC").trim())
  const n = m ? Number(m[1]) : NaN
  return Number.isInteger(n) && n > 0 ? n : null
}

function parsePoints(raw: string): number | null {
  const n = Number(raw.normalize("NFKC").trim())
  return Number.isInteger(n) && n >= 0 && n <= POINTS_MAX ? n : null
}

const TEXT_FIELDS = ["initiative", "epic", "userStory", "acceptanceCriteria", "referenceDoc", "assignedPo", "poNote", "notReadyReason"] as const

interface RowFields {
  data: CreateBacklogItemInput
  errors: ImportRowError[]
}

/** Cells → schema-validated fields (without displayId). */
function rowFields(cells: ParsedRow["cells"], ctx: ImportContext): RowFields {
  const errors: ImportRowError[] = []
  const draft: Record<string, unknown> = {}
  for (const f of TEXT_FIELDS) {
    const text = cells[f]
    if (text === undefined) continue
    if (f === "userStory" && text.length > USER_STORY_MAX) errors.push({ code: "TOO_LONG", field: f })
    else draft[f] = text
  }
  if (cells.status !== undefined) {
    const status = backlogStatusMap().get(normalizeHeader(cells.status))
    if (status) draft.status = status
    else errors.push({ code: "INVALID_STATUS", field: "status", value: cells.status })
  }
  if (cells.workloadScore !== undefined) {
    const points = parsePoints(cells.workloadScore)
    if (points !== null) draft.workloadScore = points
    else errors.push({ code: "INVALID_POINTS", field: "workloadScore", value: cells.workloadScore })
  }
  if (cells.goal !== undefined) {
    const goalId = ctx.goals.get(normalizeHeader(cells.goal))
    if (goalId) draft.productGoalId = goalId
    else errors.push({ code: "GOAL_NOT_FOUND", field: "goal", value: cells.goal })
  }
  const parsed = createBacklogItemSchema.safeParse(draft)
  if (parsed.success) return { data: parsed.data, errors }
  for (const issue of parsed.error.issues) {
    const field = String(issue.path[0] ?? "") as ImportField
    errors.push({ code: issue.code === "too_big" ? "TOO_LONG" : "INVALID", field })
  }
  return { data: {}, errors }
}

const COMPARED: ReadonlyArray<keyof CreateBacklogItemInput & keyof ExistingPbi> = [
  ...TEXT_FIELDS,
  "status",
  "workloadScore",
  "productGoalId",
]

/** Pure: the fields of `data` that differ from the PBI (as a new object). */
export function changedFields(existing: ExistingPbi, data: CreateBacklogItemInput): UpdateBacklogItemInput {
  const out: Record<string, unknown> = {}
  for (const f of COMPARED) {
    const next = data[f as keyof CreateBacklogItemInput]
    if (next === undefined) continue
    if ((existing[f] ?? null) !== next) out[f] = next
  }
  return out as UpdateBacklogItemInput
}

/** Preview label: the PBI title as the backlog list shows it (initiative, else the user story). */
function labelOf(cells: ParsedRow["cells"], existing?: ExistingPbi): string {
  const text = cells.initiative || cells.userStory || existing?.initiative || existing?.userStory || ""
  return text.length > 80 ? `${text.slice(0, 80)}…` : text
}

function duplicateIds(rows: readonly ParsedRow[]): Set<number> {
  const seen = new Set<number>()
  const dupes = new Set<number>()
  for (const r of rows) {
    const id = r.cells.displayId ? parseImportDisplayId(r.cells.displayId) : null
    if (id === null) continue
    if (seen.has(id)) dupes.add(id)
    seen.add(id)
  }
  return dupes
}

function planUpdate(row: ParsedRow, displayId: number, fields: RowFields, ctx: ImportContext, dupes: ReadonlySet<number>): PlannedRow {
  const existing = ctx.existing.get(displayId)
  const errors = [...fields.errors]
  if (dupes.has(displayId)) errors.push({ code: "DUPLICATE_ID", field: "displayId", value: String(displayId) })
  if (!existing) errors.push({ code: "PBI_NOT_FOUND", field: "displayId", value: String(displayId) })
  const base = { rowNumber: row.rowNumber, displayId, label: labelOf(row.cells, existing), errors }
  if (!existing || errors.length > 0) return { ...base, action: "update", fields: [] }
  const data = changedFields(existing, fields.data)
  const changed = Object.keys(data)
  if (changed.length === 0) return { ...base, action: "skip", fields: [] }
  return { ...base, action: "update", fields: changed, update: { id: existing.id, data } }
}

function planCreate(row: ParsedRow, fields: RowFields): PlannedRow {
  const errors = [...fields.errors]
  if (!row.cells.userStory && !row.cells.initiative) errors.push({ code: "EMPTY_STORY" })
  const base = { rowNumber: row.rowNumber, action: "create" as const, displayId: null, label: labelOf(row.cells), errors }
  if (errors.length > 0) return { ...base, fields: [] }
  return { ...base, fields: Object.keys(fields.data), create: fields.data }
}

/** Pure: validate every row and decide create / update / skip. */
export function planImport(rows: readonly ParsedRow[], ctx: ImportContext): PlannedRow[] {
  const dupes = duplicateIds(rows)
  return rows.map((row) => {
    const fields = rowFields(row.cells, ctx)
    const rawId = row.cells.displayId
    if (rawId === undefined) return planCreate(row, fields)
    const displayId = parseImportDisplayId(rawId)
    if (displayId === null) {
      return { rowNumber: row.rowNumber, action: "update", displayId: null, label: labelOf(row.cells), fields: [], errors: [{ code: "INVALID_ID", field: "displayId", value: rawId }, ...fields.errors] }
    }
    return planUpdate(row, displayId, fields, ctx, dupes)
  })
}

export function summarize(rows: readonly PlannedRow[]): ImportSummary {
  const ok = rows.filter((r) => r.errors.length === 0)
  return {
    total: rows.length,
    create: ok.filter((r) => r.action === "create").length,
    update: ok.filter((r) => r.action === "update").length,
    skip: ok.filter((r) => r.action === "skip").length,
    error: rows.length - ok.length,
  }
}

/** Display ids the sheet refers to (to load only those PBIs). */
export function referencedDisplayIds(rows: readonly ParsedRow[]): number[] {
  return [...new Set(rows.map((r) => (r.cells.displayId ? parseImportDisplayId(r.cells.displayId) : null)).filter((n): n is number => n !== null))]
}

/** Normalized goal title → id (first wins on duplicate titles). */
export function goalIndex(goals: ReadonlyArray<{ id: string; title: string }>): Map<string, string> {
  const map = new Map<string, string>()
  for (const g of goals) {
    const key = normalizeHeader(g.title)
    if (!map.has(key)) map.set(key, g.id)
  }
  return map
}
