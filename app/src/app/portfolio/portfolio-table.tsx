"use client"

import Link from "next/link"
import { AlertTriangle, ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react"
import { Badge, cn } from "@/components/ui"
import { useLanguage } from "@/lib/language-context"
import { pickText } from "@/lib/translation/pick-text"
import type { PortfolioRow } from "@/services/portfolio/portfolio.types"
import { PlanCell, RelativeTime, SprintCell, SurveillanceBadge, VelocityBars, fillTemplate } from "./portfolio-cells"
import type { PortfolioViewState, SortKey } from "./portfolio-state"
import { PORTFOLIO_COLUMNS, type PortfolioColumn } from "./portfolio-columns"

interface Props {
  rows: readonly PortfolioRow[]
  view: PortfolioViewState
  onSort: (key: SortKey) => void
  /** Render time (ms) for relative dates. */
  now: number
}

interface SortHeaderProps {
  column: PortfolioColumn
  view: PortfolioViewState
  onSort: (k: SortKey) => void
}

/**
 * One-line header (A3-04): short visible label (= accessible name), the full
 * meaning as a tooltip, numeric columns right-aligned. Sticky inside the
 * table's scroll box.
 */
function SortHeader({ column, view, onSort }: SortHeaderProps) {
  const { t } = useLanguage()
  const active = view.sort === column.key
  const Icon = !active ? ArrowUpDown : view.dir === "asc" ? ArrowUp : ArrowDown
  return (
    <th
      scope="col"
      aria-sort={active ? (view.dir === "asc" ? "ascending" : "descending") : "none"}
      className={cn(
        "sticky top-0 z-10 whitespace-nowrap bg-surface-muted px-3 py-2.5 align-bottom shadow-[inset_0_-1px_0_var(--color-border)]",
        column.numeric ? "text-right" : "text-left",
        column.key === "name" && "pl-4"
      )}
    >
      <button
        type="button"
        onClick={() => onSort(column.key)}
        title={t[column.hintKey]}
        className={cn(
          "group inline-flex min-h-8 items-center gap-1 whitespace-nowrap rounded-ui-sm px-1 -mx-1 text-caption font-semibold transition-colors hover:text-fg",
          column.numeric && "flex-row-reverse",
          active ? "text-fg" : "text-fg-muted"
        )}
      >
        {t[column.labelKey]}
        <Icon aria-hidden className={cn("h-3.5 w-3.5 shrink-0", active ? "text-primary" : "text-fg-subtle group-hover:text-fg-muted")} />
      </button>
    </th>
  )
}

function ProjectCell({ row }: { row: PortfolioRow }) {
  const { t, language } = useLanguage()
  const name = pickText(row.i18n, "name", row.name, language).text
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <Link
        href={`/projects/${row.id}`}
        title={name}
        className="line-clamp-2 break-words text-body font-semibold text-fg underline-offset-2 hover:text-primary hover:underline"
      >
        {name}
      </Link>
      {(row.needsAttention || row.status === "archived") && (
        <span className="flex flex-wrap items-center gap-1.5">
          {row.needsAttention && (
            <Badge tone="danger" size="sm">
              <AlertTriangle aria-hidden className="h-3 w-3" />
              {t.portfolioAttentionBadge}
            </Badge>
          )}
          {row.status === "archived" && (
            <Badge tone="neutral" size="sm">
              {t.portfolioStatusArchived}
            </Badge>
          )}
        </span>
      )}
    </div>
  )
}

function Row({ row, now }: { row: PortfolioRow; now: number }) {
  const { t } = useLanguage()
  const sections = row.sections.map((s) => s.name).join(" / ")
  return (
    <tr className={cn("border-t border-border align-top transition-colors hover:bg-surface-muted/60", row.needsAttention && "bg-danger-soft/25")}>
      <td className={cn("border-l-4 py-3 pl-3 pr-3", row.needsAttention ? "border-l-danger" : "border-l-transparent")}>
        <ProjectCell row={row} />
      </td>
      <td className="px-3 py-3 text-caption text-fg-muted">
        {sections ? (
          <span className="block truncate" title={sections}>{sections}</span>
        ) : (
          <span className="block truncate text-fg-subtle" title={t.portfolioNoSection}>{t.portfolioNoSection}</span>
        )}
      </td>
      <td className="px-3 py-3">
        <SprintCell sprint={row.activeSprint} />
      </td>
      <td className="px-3 py-3 text-right">
        <span className={cn("tabular-nums text-title font-semibold", row.overdueTasks > 0 ? "text-danger" : "text-fg-subtle")}>{row.overdueTasks}</span>
      </td>
      <td className="whitespace-nowrap px-3 py-3 text-right">
        <span className="tabular-nums text-body text-fg">{fillTemplate(t.portfolioOpenPbis, { count: row.openPbis, points: row.openPoints })}</span>
      </td>
      <td className="px-3 py-3 text-right">
        <VelocityBars points={row.velocity} trend={row.velocityTrend} />
      </td>
      <td className="px-3 py-3">
        <SurveillanceBadge value={row.surveillance} />
      </td>
      <td className="px-3 py-3">
        <PlanCell plan={row.plan} />
      </td>
      <td className="px-3 py-3 text-right">
        <RelativeTime iso={row.lastActivityAt} now={now} />
      </td>
    </tr>
  )
}

/**
 * Dense sortable table with fixed column widths (only the project name
 * flexes, clamped to two lines). The box scrolls horizontally only when the
 * viewport is narrower than the table, and vertically past one screen so the
 * header stays sticky while scanning many projects.
 */
export function PortfolioTable({ rows, view, onSort, now }: Props) {
  const { t } = useLanguage()
  return (
    // `relative` makes this scroll box the containing block of the sr-only
    // (position:absolute) cell texts; otherwise they escape the overflow clip
    // and widen the whole page on phones (P-03: 679px horizontal scroll).
    <div
      data-portfolio-scroll=""
      className="relative max-h-[calc(100dvh-7rem)] max-w-full overflow-auto rounded-ui-lg border border-border bg-surface shadow-ui-sm"
    >
      <table className="w-full min-w-[75rem] table-fixed border-collapse text-left">
        <caption className="sr-only">{t.portfolioTableCaption}</caption>
        <colgroup>
          {PORTFOLIO_COLUMNS.map((c) => (
            <col key={c.key} className={c.widthClass} />
          ))}
        </colgroup>
        <thead>
          <tr>
            {PORTFOLIO_COLUMNS.map((c) => (
              <SortHeader key={c.key} column={c} view={view} onSort={onSort} />
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <Row key={r.id} row={r} now={now} />
          ))}
        </tbody>
      </table>
    </div>
  )
}
