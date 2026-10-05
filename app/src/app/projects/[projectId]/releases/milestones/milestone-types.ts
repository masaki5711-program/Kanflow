import type { Translations } from "@/lib/i18n"
import type { MilestoneBoardDto } from "@/services/milestones/milestones.service"

/** A server DTO after JSON: Date fields arrive as ISO strings. */
type Json<T> = T extends Date ? string : T extends ReadonlyArray<infer U> ? Json<U>[] : T extends object ? { [K in keyof T]: Json<T[K]> } : T

export interface BoardPermissions {
  /** plan.write (PO / SM): stages, check / document definitions, budget, settings. */
  canEdit: boolean
  /** milestone.track (any member): results, ticks, punch items, documents received, values. */
  canTrack: boolean
}

export type MilestoneBoard = Json<MilestoneBoardDto> & { permissions: BoardPermissions; viewerId: string }
export type Stage = MilestoneBoard["stages"][number]
export type Step = Stage["steps"][number]
export type AcceptanceCheck = MilestoneBoard["checks"][number]
export type PunchItem = MilestoneBoard["punchItems"][number]
export type HandoverDocument = MilestoneBoard["documents"][number]
export type BudgetLine = MilestoneBoard["budgetLines"][number]
export type Metric = MilestoneBoard["metrics"][number]
export type Member = MilestoneBoard["members"][number]

export const TAB_KEYS = ["checks", "punch", "docs", "budget", "trend"] as const
export type TabKey = (typeof TAB_KEYS)[number]

/** The board's 呼び名 of the check items (template text), else the localized default. */
export function checkLabel(board: Pick<MilestoneBoard, "settings">, t: Translations): string {
  return board.settings.checkLabel?.trim() || t.msChecksDefaultLabel
}

/** Tabs shown: 予算 only when on, 推移 when on or a metric exists. */
export function visibleTabs(board: Pick<MilestoneBoard, "settings" | "metrics">): TabKey[] {
  return TAB_KEYS.filter((k) => (k === "budget" ? board.settings.budgetEnabled : k === "trend" ? board.settings.trendEnabled || board.metrics.length > 0 : true))
}

export function stageStatusLabel(status: string, t: Translations): string {
  const map: Record<string, string> = { not_started: t.msStatusNotStarted, in_progress: t.msStatusInProgress, done: t.msStatusDone, on_hold: t.msStatusOnHold }
  return map[status] ?? status
}

export function punchStatusLabel(status: string, t: Translations): string {
  const map: Record<string, string> = { open: t.msPunchStatusOpen, in_progress: t.msPunchStatusInProgress, done: t.msPunchStatusDone }
  return map[status] ?? status
}

export function resultLabel(result: string | null, t: Translations): string {
  const map: Record<string, string> = { passed: t.msResultPassed, conditional: t.msResultConditional, failed: t.msResultFailed }
  return result ? (map[result] ?? result) : t.msResultPending
}

/** Whole yen with digit grouping. */
export function formatYen(value: number, locale: string): string {
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(value)
}

/** Stage / step names by id (punch and check rows show where they belong). */
export function stageNameMap(stages: readonly Stage[], nameOf: (s: { name: string; i18n: unknown }) => string): Map<string, string> {
  return new Map(stages.flatMap((s) => [[s.id, nameOf(s)] as const, ...s.steps.map((st) => [st.id, nameOf(st)] as const)]))
}

export type PunchFilter = "open" | "overdue" | "mine" | "all"

export function filterPunch(items: readonly PunchItem[], filter: PunchFilter, todayKey: string, viewerId: string): PunchItem[] {
  switch (filter) {
    case "open":
      return items.filter((p) => p.status !== "done")
    case "overdue":
      return items.filter((p) => p.status !== "done" && p.dueDate !== null && p.dueDate < todayKey)
    case "mine":
      return items.filter((p) => p.assigneeId === viewerId)
    default:
      return [...items]
  }
}
