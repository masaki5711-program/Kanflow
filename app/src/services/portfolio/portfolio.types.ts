/**
 * Department portfolio DTOs (GET /api/portfolio, /portfolio page). Plain
 * serializable data, dependency-free: safe to import from client components.
 */
import type { EntityI18n } from "@/lib/translation/types"

export type Severity = "critical" | "warning" | "none"
export type VelocityTrend = "up" | "down" | "flat"

export interface PortfolioSection {
  id: string
  name: string
}

export interface PortfolioSprint {
  id: string
  name: string
  i18n: EntityI18n
  /** ISO end date. */
  endDate: string
  /** Calendar days (Tokyo) until the end date; negative once past it. */
  daysLeft: number
  tasksDone: number
  tasksTotal: number
  /** Done real tasks / all real tasks, null without tasks. */
  progressPct: number | null
  /** Completed points (Sprint.actualScore) / committed points (distinct PBIs in the sprint). */
  donePoints: number
  plannedPoints: number
  /** Remaining real tasks at the end of each day from the start up to min(today, end). */
  burn: number[]
}

export interface PortfolioPlan {
  /** Duration-weighted progress of the top-level items, null without a plan. */
  progressPct: number | null
  /** Leaf items past their planned end and not done. */
  delayed: number
  /** Leaf items running behind the elapsed share of their planned window (not yet delayed). */
  atRisk: number
  total: number
}

export interface PortfolioRow {
  id: string
  name: string
  i18n: EntityI18n
  status: string
  sections: PortfolioSection[]
  activeSprint: PortfolioSprint | null
  /** Unfinished real tasks of open sprints past their end date. */
  overdueTasks: number
  openPbis: number
  openPoints: number
  /** Completed points of the last (up to) 3 finished sprints, oldest → newest. */
  velocity: number[]
  velocityTrend: VelocityTrend | null
  surveillance: { severity: Severity; at: string } | null
  plan: PortfolioPlan
  /** ISO time of the newest activity-log row. */
  lastActivityAt: string | null
  needsAttention: boolean
}

export interface PortfolioDto {
  asOf: string
  scope: "all" | "sections"
  /** More projects exist than PORTFOLIO_PROJECT_CAP; only the first ones are listed. */
  capped: boolean
  sections: PortfolioSection[]
  rows: PortfolioRow[]
}

export interface PortfolioFilters {
  /** Section id, "none" (no section) or "" (all). */
  section: string
  /** Project status or "" (all). */
  status: string
  attentionOnly: boolean
}

export const EMPTY_PORTFOLIO_FILTERS: PortfolioFilters = Object.freeze({ section: "", status: "", attentionOnly: false })

/** Pure: rows matching the filters (new array). Shared by the API and the page. */
export function filterPortfolio(rows: readonly PortfolioRow[], f: PortfolioFilters): PortfolioRow[] {
  return rows.filter((r) => {
    if (f.attentionOnly && !r.needsAttention) return false
    if (f.status && r.status !== f.status) return false
    if (f.section === "none") return r.sections.length === 0
    if (f.section && !r.sections.some((s) => s.id === f.section)) return false
    return true
  })
}
