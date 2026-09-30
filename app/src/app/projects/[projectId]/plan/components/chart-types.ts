/**
 * Shared props of the chart pieces (grid rows, bars). Kept in one place so
 * the row components stay small and memoizable.
 */
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
  linkPbis: (item: PlanItem) => void
  remove: (item: PlanItem) => void
}
