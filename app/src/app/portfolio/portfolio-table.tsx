"use client"

import Link from "next/link"
import { AlertTriangle, ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react"
import { Badge, cn } from "@/components/ui"
import { useLanguage } from "@/lib/language-context"
import { pickText } from "@/lib/translation/pick-text"
import type { PortfolioRow } from "@/services/portfolio/portfolio.types"
import { PlanCell, RelativeTime, SprintCell, SurveillanceBadge, VelocityBars, fillTemplate } from "./portfolio-cells"
import type { PortfolioViewState, SortKey } from "./portfolio-state"

interface Props {
  rows: readonly PortfolioRow[]
  view: PortfolioViewState
  onSort: (key: SortKey) => void
  /** Render time (ms) for relative dates. */
  now: number
}

interface SortHeaderProps {
  label: string
  sortKey: SortKey
  view: PortfolioViewState
  onSort: (k: SortKey) => void
  className?: string
}

function SortHeader({ label, sortKey, view, onSort, className }: SortHeaderProps) {
  const active = view.sort === sortKey
  const Icon = !active ? ArrowUpDown : view.dir === "asc" ? ArrowUp : ArrowDown
  return (
    <th scope="col" aria-sort={active ? (view.dir === "asc" ? "ascending" : "descending") : "none"} className={cn("px-3 py-2.5 text-left align-bottom", className)}>
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className={cn(
          "group inline-flex min-h-8 items-center gap-1 rounded-ui-sm px-1 -mx-1 text-caption font-semibold uppercase tracking-wide transition-colors hover:text-fg",
          active ? "text-fg" : "text-fg-muted"
        )}
      >
        {label}
        <Icon aria-hidden className={cn("h-3.5 w-3.5", active ? "text-primary" : "text-fg-subtle group-hover:text-fg-muted")} />
      </button>
    </th>
  )
}

function ProjectCell({ row }: { row: PortfolioRow }) {
  const { t, language } = useLanguage()
  const name = pickText(row.i18n, "name", row.name, language).text
  return (
    <div className="flex min-w-48 flex-col gap-1">
      <Link href={`/projects/${row.id}`} className="text-body font-semibold text-fg underline-offset-2 hover:text-primary hover:underline">
        {name}
      </Link>
      <span className="flex flex-wrap items-center gap-1.5">
        {row.needsAttention && (
          <Badge tone="danger" size="sm">
            <AlertTriangle aria-hidden className="h-3 w-3" />
            {t.portfolioAttentionBadge}
          </Badge>
        )}
      </span>
    </div>
  )
}

function Row({ row, now }: { row: PortfolioRow; now: number }) {
  const { t } = useLanguage()
  return (
    <tr className={cn("border-t border-border align-top transition-colors hover:bg-surface-muted/60", row.needsAttention && "bg-danger-soft/25")}>
      <td className={cn("border-l-4 py-3 pl-3 pr-3", row.needsAttention ? "border-l-danger" : "border-l-transparent")}>
        <ProjectCell row={row} />
      </td>
      <td className="px-3 py-3 text-caption text-fg-muted">
        {row.sections.length > 0 ? row.sections.map((s) => s.name).join(" / ") : <span className="text-fg-subtle">{t.portfolioNoSection}</span>}
      </td>
      <td className="px-3 py-3">
        <Badge tone={row.status === "archived" ? "neutral" : "primary"} size="sm">
          {row.status === "archived" ? t.portfolioStatusArchived : t.portfolioStatusActive}
        </Badge>
      </td>
      <td className="px-3 py-3">
        <SprintCell sprint={row.activeSprint} />
      </td>
      <td className="px-3 py-3 text-right">
        <span className={cn("tabular-nums text-title font-semibold", row.overdueTasks > 0 ? "text-danger" : "text-fg-subtle")}>{row.overdueTasks}</span>
      </td>
      <td className="px-3 py-3">
        <span className="tabular-nums text-body text-fg">{fillTemplate(t.portfolioOpenPbis, { count: row.openPbis, points: row.openPoints })}</span>
      </td>
      <td className="px-3 py-3">
        <VelocityBars points={row.velocity} trend={row.velocityTrend} />
      </td>
      <td className="px-3 py-3">
        <SurveillanceBadge value={row.surveillance} />
      </td>
      <td className="px-3 py-3">
        <PlanCell plan={row.plan} />
      </td>
      <td className="px-3 py-3">
        <RelativeTime iso={row.lastActivityAt} now={now} />
      </td>
    </tr>
  )
}

/** Dense sortable table; horizontally scrollable inside its card on narrow screens. */
export function PortfolioTable({ rows, view, onSort, now }: Props) {
  const { t } = useLanguage()
  const header = (label: string, key: SortKey, className?: string) => <SortHeader label={label} sortKey={key} view={view} onSort={onSort} className={className} />
  return (
    <div className="overflow-x-auto rounded-ui-lg border border-border bg-surface shadow-ui-sm">
      <table className="w-full min-w-[74rem] border-collapse text-left">
        <caption className="sr-only">{t.portfolioTableCaption}</caption>
        <thead className="bg-surface-muted">
          <tr>
            {header(t.portfolioColProject, "name", "pl-4")}
            {header(t.portfolioColSection, "section")}
            {header(t.portfolioColStatus, "status")}
            {header(t.portfolioColSprint, "sprint")}
            {header(t.portfolioColOverdue, "overdue", "text-right")}
            {header(t.portfolioColBacklog, "backlog")}
            {header(t.portfolioColVelocity, "velocity")}
            {header(t.portfolioColSurveillance, "surveillance")}
            {header(t.portfolioColPlan, "plan")}
            {header(t.portfolioColLastActivity, "activity")}
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
