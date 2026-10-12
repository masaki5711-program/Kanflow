/**
 * Shapes of the scheduling-assist endpoints (/plan/bulk, /plan/reflow,
 * /plan/import, /plan/:id/duplicate) and small helpers shared by their dialogs.
 */
import type { Translations } from "@/lib/i18n"
import type { PlanStatus, Ymd } from "./plan-types"

export interface MoveRow {
  id: string
  name: string
  plannedStart: Ymd
  plannedEnd: Ymd
  newStart: Ymd
  newEnd: Ymd
}

export type SkipReason = "undated" | "done" | "started" | "derived" | "not_found"

export interface SkipRow {
  id: string
  name: string
  reason: SkipReason
}

/** Answer of /plan/bulk and /plan/reflow (preview when `applied` is false). */
export interface ScheduleResult {
  applied: boolean
  updated?: number
  moved: MoveRow[]
  skipped: SkipRow[]
}

export type BulkTarget = { ids: string[] } | { fromDate: Ymd }

export type BulkOp =
  | { type: "shift"; days: number; businessDays?: boolean }
  | { type: "owner"; ownerId: string | null }
  | { type: "status"; status: PlanStatus }

export type ImportErrorCode = "name" | "dates" | "order" | "depth" | "owner" | "parent"

export interface ImportRowInput {
  depth: number
  name: string
  plannedStart: Ymd | null
  plannedEnd: Ymd | null
  ownerId: string | null
}

export interface ImportResult {
  applied: boolean
  count: number
  errors: Array<{ row: number; code: ImportErrorCode }>
  createdIds: string[]
}

export function skipReasonLabel(t: Translations, reason: SkipReason): string {
  switch (reason) {
    case "undated": return t.pscReasonUndated
    case "done": return t.pscReasonDone
    case "started": return t.pscReasonStarted
    case "derived": return t.pscReasonDerived
    default: return t.pscReasonNotFound
  }
}

export function importErrorLabel(t: Translations, code: ImportErrorCode): string {
  switch (code) {
    case "name": return t.pscImportErrName
    case "dates": return t.pscImportErrDates
    case "order": return t.pscImportErrOrder
    case "depth": return t.pscImportErrDepth
    case "owner": return t.pscImportErrOwner
    default: return t.pscImportErrParent
  }
}
