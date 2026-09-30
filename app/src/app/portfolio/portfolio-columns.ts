/**
 * Portfolio table columns (A3-04): order, sort key, short header + tooltip
 * keys and a fixed width. The widths leave the project name ≥ ~13rem inside
 * the 75rem minimum table, which fits the 80rem page at 1280 / 1440 / 1920
 * without horizontal scrolling; narrower viewports scroll inside the box.
 */
import type { Translations } from "@/lib/i18n"
import type { SortKey } from "./portfolio-state"

type ColumnTextKey = {
  [K in keyof Translations]: K extends `portfolioCol${string}` ? K : never
}[keyof Translations]

export interface PortfolioColumn {
  key: SortKey
  labelKey: ColumnTextKey
  hintKey: ColumnTextKey
  /** Tailwind width of the <col>; the name column has none and takes the rest. */
  widthClass?: string
  /** Right-aligned header (numbers read right-aligned with tabular digits). */
  numeric?: boolean
}

export const PORTFOLIO_COLUMNS: readonly PortfolioColumn[] = [
  { key: "name", labelKey: "portfolioColProject", hintKey: "portfolioColProjectHint" },
  { key: "section", labelKey: "portfolioColSection", hintKey: "portfolioColSectionHint", widthClass: "w-24" },
  { key: "sprint", labelKey: "portfolioColSprint", hintKey: "portfolioColSprintHint", widthClass: "w-[13.5rem]" },
  { key: "overdue", labelKey: "portfolioColOverdue", hintKey: "portfolioColOverdueHint", widthClass: "w-[6.25rem]", numeric: true },
  { key: "backlog", labelKey: "portfolioColBacklog", hintKey: "portfolioColBacklogHint", widthClass: "w-28", numeric: true },
  { key: "velocity", labelKey: "portfolioColVelocity", hintKey: "portfolioColVelocityHint", widthClass: "w-28", numeric: true },
  { key: "surveillance", labelKey: "portfolioColSurveillance", hintKey: "portfolioColSurveillanceHint", widthClass: "w-28" },
  { key: "plan", labelKey: "portfolioColPlan", hintKey: "portfolioColPlanHint", widthClass: "w-[9.25rem]" },
  { key: "activity", labelKey: "portfolioColLastActivity", hintKey: "portfolioColLastActivityHint", widthClass: "w-[6.5rem]", numeric: true },
]
