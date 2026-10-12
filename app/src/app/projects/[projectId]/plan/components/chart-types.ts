/**
 * Shared props of the chart pieces (grid rows, bars). Kept in one place so
 * the row components stay small and memoizable.
 */
import type { PointerEvent } from "react"
import type { Language, Translations } from "@/lib/i18n"
import type { PlanItem, Ymd } from "../lib/plan-types"
import type { PlanColumn } from "../lib/prefs"

export interface ChartEnv {
  t: Translations
  language: Language
  startDay: number
  dayWidth: number
  today: Ymd
  canEdit: boolean
  columns: readonly PlanColumn[]
  gridWidth: number
  /** Width of the name column (splitter / default). */
  nameWidth: number
  gridCollapsed: boolean
  /** Print layout (bar labels that do not fit move right of the bar). */
  printing: boolean
  /** Localized display name of an item. */
  nameOf: (item: PlanItem) => string
  /** Durations / shifts count business days (土日・祝日を除く). */
  businessDays: boolean
  /** Multi-select mode: rows show a checkbox. */
  selecting: boolean
}

export interface RowHandlers {
  select: (id: string, options?: { scrollBar?: boolean }) => void
  open: (item: PlanItem) => void
  toggle: (id: string) => void
  startRename: (id: string) => void
  commitRename: (item: PlanItem, name: string) => void
  cancelRename: () => void
  move: (id: string, action: "moveUp" | "moveDown" | "indent" | "outdent") => void
  addChild: (parentId: string) => void
  addSuccessor: (item: PlanItem) => void
  /** Pointer down on a bar's connector ●: drag to the bar that should follow. */
  startLink: (e: PointerEvent<HTMLElement>, id: string) => void
  /** An arrow was clicked: confirm and remove the dependency. */
  pickArrow: (arrow: { id: string; predecessorId: string; successorId: string }) => void
  linkPbis: (item: PlanItem) => void
  remove: (item: PlanItem) => void
  /** Inline date edit in the grid: persist both planned dates (offers to move the followers). */
  editDates: (item: PlanItem, start: Ymd, end: Ymd) => void
  /** An inline entry was rejected (end before start). */
  invalidDates: () => void
  /** Toggle the row's checkbox (`range` = extend from the last checked row). */
  check: (id: string, range?: boolean) => void
  duplicate: (item: PlanItem) => void
}
