"use client"

import { useCallback, useMemo, useState } from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { AlertTriangle, Briefcase, FilterX } from "lucide-react"
import { Button, EmptyState, PageHeader, Select, cn } from "@/components/ui"
import { useLanguage } from "@/lib/language-context"
import { pickText } from "@/lib/translation/pick-text"
import { filterPortfolio, type PortfolioDto, type PortfolioRow } from "@/services/portfolio/portfolio.types"
import { fillTemplate } from "./portfolio-cells"
import { nextSort, portfolioKpis, sortPortfolio, viewFromParams, viewToQuery, type PortfolioKpis, type PortfolioViewState, type SortKey } from "./portfolio-state"
import { PortfolioTable } from "./portfolio-table"

interface KpiProps {
  label: string
  value: number
  tone?: "danger" | "warning" | "neutral"
  hero?: boolean
  pressed?: boolean
  onClick?: () => void
}

const KPI_TONE = {
  danger: "border-danger/40 bg-danger-soft text-danger-strong",
  warning: "border-warning/40 bg-warning-soft text-warning-strong",
  neutral: "border-border bg-surface text-fg",
} as const

/**
 * One tile of the KPI strip. Every tile has the same box (A3-04: the hero
 * tile used to span two rows and left the grid looking unfinished); the
 * attention tile stands out by colour, weight and its pressed ring instead.
 */
function Kpi({ label, value, tone = "neutral", hero, pressed, onClick }: KpiProps) {
  const body = (
    <>
      <span className={cn("tabular-nums text-heading leading-none", hero ? "font-bold" : "font-semibold")}>{value}</span>
      <span className={cn("text-caption font-medium", tone === "neutral" ? "text-fg-muted" : "")}>{label}</span>
    </>
  )
  const cls = cn(
    "flex h-full min-h-20 flex-col justify-between gap-2 rounded-ui-lg border px-4 py-3 text-left shadow-ui-sm",
    KPI_TONE[value > 0 ? tone : "neutral"],
    hero && value > 0 && "border-2"
  )
  if (!onClick) return <div className={cls}>{body}</div>
  return (
    <button type="button" aria-pressed={pressed} onClick={onClick} className={cn(cls, "transition-shadow hover:shadow-ui-md", pressed && "ring-2 ring-danger ring-offset-2")}>
      {body}
    </button>
  )
}

function KpiStrip({ kpis, attentionOnly, onToggleAttention }: { kpis: PortfolioKpis; attentionOnly: boolean; onToggleAttention: () => void }) {
  const { t } = useLanguage()
  return (
    <section aria-label={t.portfolioTitle} className="mb-6 grid auto-rows-fr grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6" data-testid="portfolio-kpis">
      <Kpi label={t.portfolioKpiAttention} value={kpis.attention} tone="danger" hero pressed={attentionOnly} onClick={onToggleAttention} />
      <Kpi label={t.portfolioKpiProjects} value={kpis.projects} />
      <Kpi label={t.portfolioKpiActiveSprints} value={kpis.activeSprints} />
      <Kpi label={t.portfolioKpiOverdue} value={kpis.overdueTasks} tone="danger" />
      <Kpi label={t.portfolioKpiDelayedPlan} value={kpis.delayedPlan} tone="warning" />
      <Kpi label={t.portfolioKpiCritical} value={kpis.critical} tone="danger" />
    </section>
  )
}

interface FilterBarProps {
  data: PortfolioDto
  view: PortfolioViewState
  shown: number
  onChange: (patch: Partial<PortfolioViewState>) => void
}

function FilterBar({ data, view, shown, onChange }: FilterBarProps) {
  const { t } = useLanguage()
  const active = view.section !== "" || view.status !== "" || view.attentionOnly
  return (
    <div role="group" aria-label={t.portfolioFiltersLabel} className="mb-3 flex flex-wrap items-center gap-2">
      <Select selectSize="sm" aria-label={t.portfolioFilterSection} value={view.section} onChange={(e) => onChange({ section: e.target.value })} className="w-auto max-w-56">
        <option value="">
          {t.portfolioFilterSection}: {t.portfolioFilterAll}
        </option>
        {data.sections.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
        <option value="none">{t.portfolioNoSection}</option>
      </Select>
      <Select selectSize="sm" aria-label={t.portfolioFilterStatus} value={view.status} onChange={(e) => onChange({ status: e.target.value })} className="w-auto">
        <option value="">
          {t.portfolioFilterStatus}: {t.portfolioFilterAll}
        </option>
        <option value="active">{t.portfolioStatusActive}</option>
        <option value="archived">{t.portfolioStatusArchived}</option>
      </Select>
      <Button
        size="sm"
        variant={view.attentionOnly ? "danger" : "secondary"}
        aria-pressed={view.attentionOnly}
        leftIcon={<AlertTriangle className="h-4 w-4" />}
        onClick={() => onChange({ attentionOnly: !view.attentionOnly })}
      >
        {t.portfolioAttentionOnly}
      </Button>
      {active && (
        <Button size="sm" variant="ghost" leftIcon={<FilterX className="h-4 w-4" />} onClick={() => onChange({ section: "", status: "", attentionOnly: false })}>
          {t.portfolioFilterClear}
        </Button>
      )}
      <span role="status" className="ml-auto text-caption text-fg-muted">
        {fillTemplate(t.portfolioResultCount, { shown, total: data.rows.length })}
      </span>
    </div>
  )
}

/**
 * Portfolio page body. Filters and sort live in the URL (shareable, Back
 * works); the data comes from the server component.
 */
export function PortfolioView({ data }: { data: PortfolioDto }) {
  const { t, language } = useLanguage()
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  const view = useMemo(() => viewFromParams(new URLSearchParams(params?.toString() ?? "")), [params])
  const [now] = useState(() => Date.now())

  const update = useCallback(
    (patch: Partial<PortfolioViewState>) => router.replace(`${pathname}${viewToQuery({ ...view, ...patch })}`, { scroll: false }),
    [router, pathname, view]
  )
  const displayName = useCallback((r: PortfolioRow) => pickText(r.i18n, "name", r.name, language).text, [language])
  const visible = useMemo(
    () => sortPortfolio(filterPortfolio(data.rows, view), view.sort, view.dir, displayName),
    [data.rows, view, displayName]
  )
  const kpis = useMemo(() => portfolioKpis(data.rows), [data.rows])
  const asOf = new Date(data.asOf).toLocaleString(language, { dateStyle: "medium", timeStyle: "short" })

  return (
    <>
      <PageHeader
        title={t.portfolioTitle}
        icon={<Briefcase className="h-7 w-7 text-primary" />}
        eyebrow={data.scope === "all" ? t.portfolioScopeAll : t.portfolioScopeSections}
        description={
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span>{t.portfolioDescription}</span>
            <span className="text-caption">{fillTemplate(t.portfolioAsOf, { date: asOf })}</span>
          </span>
        }
      />
      {data.capped && (
        <p role="note" className="mb-4 rounded-ui-md border border-warning/30 bg-warning-soft px-4 py-2 text-body text-warning-strong">
          {fillTemplate(t.portfolioCapped, { count: data.rows.length })}
        </p>
      )}
      {data.rows.length === 0 ? (
        <EmptyState icon={<Briefcase className="h-6 w-6" />} title={t.portfolioEmpty} />
      ) : (
        <>
          <KpiStrip kpis={kpis} attentionOnly={view.attentionOnly} onToggleAttention={() => update({ attentionOnly: !view.attentionOnly })} />
          <FilterBar data={data} view={view} shown={visible.length} onChange={update} />
          {visible.length === 0 ? (
            <EmptyState
              compact
              title={t.portfolioEmptyFiltered}
              action={
                <Button variant="secondary" onClick={() => update({ section: "", status: "", attentionOnly: false })}>
                  {t.portfolioFilterClear}
                </Button>
              }
            />
          ) : (
            <PortfolioTable rows={visible} view={view} onSort={(key: SortKey) => update(nextSort(view, key))} now={now} />
          )}
        </>
      )}
    </>
  )
}
