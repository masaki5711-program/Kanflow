"use client"

import { ArrowDownRight, ArrowRight, ArrowUpRight } from "lucide-react"
import { Badge, cn, type BadgeTone } from "@/components/ui"
import { useLanguage } from "@/lib/language-context"
import { pickText } from "@/lib/translation/pick-text"
import type { PortfolioPlan, PortfolioRow, PortfolioSprint, Severity, VelocityTrend } from "@/services/portfolio/portfolio.types"

const fill = (template: string, values: Record<string, string | number>) =>
  Object.entries(values).reduce((s, [k, v]) => s.replaceAll(`{${k}}`, String(v)), template)

/** Remaining-task line of the active sprint (actual burn; the dashed diagonal is the ideal). */
export function BurnSparkline({ burn, label }: { burn: readonly number[]; label: string }) {
  const [w, h, pad] = [72, 22, 2]
  const max = Math.max(1, ...burn)
  const step = burn.length > 1 ? (w - pad * 2) / (burn.length - 1) : 0
  const points = burn.map((v, i) => `${pad + i * step},${pad + (1 - v / max) * (h - pad * 2)}`).join(" ")
  const last = burn.at(-1) ?? 0
  return (
    <span className="inline-flex items-center gap-1.5" title={label}>
      <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden="true" className="shrink-0 overflow-visible">
        <line x1={pad} y1={pad} x2={w - pad} y2={h - pad} className="stroke-border-strong" strokeWidth={1} strokeDasharray="2 2" />
        {burn.length > 1 ? (
          <polyline points={points} fill="none" className="stroke-primary" strokeWidth={1.75} strokeLinejoin="round" strokeLinecap="round" />
        ) : null}
        <circle cx={pad + (burn.length - 1) * step} cy={pad + (1 - last / max) * (h - pad * 2)} r={2} className="fill-primary" />
      </svg>
      <span className="sr-only">{label}</span>
    </span>
  )
}

const TREND_ICON: Record<VelocityTrend, typeof ArrowUpRight> = { up: ArrowUpRight, down: ArrowDownRight, flat: ArrowRight }
const TREND_CLASS: Record<VelocityTrend, string> = { up: "text-success", down: "text-danger", flat: "text-fg-muted" }

/** Three bars (oldest → newest) + trend arrow; the newest bar is emphasized. */
export function VelocityBars({ points, trend }: { points: readonly number[]; trend: VelocityTrend | null }) {
  const { t } = useLanguage()
  if (points.length === 0) return <span className="text-caption text-fg-subtle">{t.portfolioVelocityNone}</span>
  const max = Math.max(1, ...points)
  const trendLabel = trend ? { up: t.portfolioVelocityUp, down: t.portfolioVelocityDown, flat: t.portfolioVelocityFlat }[trend] : ""
  const Icon = trend ? TREND_ICON[trend] : null
  return (
    <span className="inline-flex items-end gap-2">
      <span aria-hidden="true" className="flex h-6 items-end gap-0.5">
        {points.map((p, i) => (
          <span
            key={i}
            className={cn("w-2 rounded-t-[2px]", i === points.length - 1 ? "bg-primary" : "bg-primary-soft")}
            style={{ height: `${Math.max(8, (p / max) * 100)}%` }}
          />
        ))}
      </span>
      <span className="tabular-nums text-body font-medium text-fg">{points.at(-1)}</span>
      {Icon && (
        <span className={cn("inline-flex items-center", TREND_CLASS[trend as VelocityTrend])} title={trendLabel}>
          <Icon aria-hidden className="h-4 w-4" />
          <span className="sr-only">{trendLabel}</span>
        </span>
      )}
      <span className="sr-only">{points.join(" → ")}</span>
    </span>
  )
}

const SEVERITY_TONE: Record<Severity, BadgeTone> = { critical: "danger", warning: "warning", none: "success" }

export function SurveillanceBadge({ value }: { value: PortfolioRow["surveillance"] }) {
  const { t, language } = useLanguage()
  if (!value) return <span className="text-caption text-fg-subtle">{t.portfolioNoReport}</span>
  const label = { critical: t.portfolioSeverityCritical, warning: t.portfolioSeverityWarning, none: t.portfolioSeverityNone }[value.severity]
  return (
    <span className="flex flex-col items-start gap-0.5">
      <Badge tone={SEVERITY_TONE[value.severity]} dot>
        {label}
      </Badge>
      <span className="text-caption text-fg-muted">{new Date(value.at).toLocaleDateString(language, { month: "numeric", day: "numeric" })}</span>
    </span>
  )
}

export function PlanCell({ plan }: { plan: PortfolioPlan }) {
  const { t } = useLanguage()
  if (plan.total === 0 || plan.progressPct === null) return <span className="text-caption text-fg-subtle">{t.portfolioNoPlan}</span>
  const clean = plan.delayed === 0 && plan.atRisk === 0
  return (
    <span className="flex min-w-0 flex-col gap-1">
      <ProgressBar pct={plan.progressPct} tone={plan.delayed > 0 ? "danger" : plan.atRisk > 0 ? "warning" : "primary"} label={t.portfolioColPlan} />
      <span className="flex flex-wrap gap-1 whitespace-nowrap">
        {plan.delayed > 0 && <Badge tone="danger">{fill(t.portfolioPlanDelayed, { count: plan.delayed })}</Badge>}
        {plan.atRisk > 0 && <Badge tone="warning">{fill(t.portfolioPlanAtRisk, { count: plan.atRisk })}</Badge>}
        {clean && <span className="text-caption text-fg-muted">{t.portfolioPlanOnTrack}</span>}
      </span>
    </span>
  )
}

const BAR_TONE = { primary: "bg-primary", warning: "bg-warning", danger: "bg-danger", success: "bg-success" } as const

/** Compact bar + value; `label` names the measure (tooltip), e.g. 計画進捗 / スプリント完了率 (A3-13). */
export function ProgressBar({ pct, tone = "primary", label }: { pct: number; tone?: keyof typeof BAR_TONE; label?: string }) {
  return (
    <span className="flex items-center gap-2 whitespace-nowrap" title={label ? `${label} ${pct}%` : undefined}>
      <span className="h-1.5 w-16 shrink-0 overflow-hidden rounded-full bg-surface-sunken" aria-hidden="true">
        <span className={cn("block h-full rounded-full", BAR_TONE[tone])} style={{ width: `${Math.min(100, Math.max(0, pct))}%` }} />
      </span>
      <span className="tabular-nums text-caption font-medium text-fg">{pct}%</span>
    </span>
  )
}

function daysChip(sprint: PortfolioSprint, t: ReturnType<typeof useLanguage>["t"]): { text: string; tone: BadgeTone } {
  if (sprint.daysLeft < 0) return { text: fill(t.portfolioDaysOverdue, { days: -sprint.daysLeft }), tone: "danger" }
  if (sprint.daysLeft === 0) return { text: t.portfolioLastDay, tone: "warning" }
  return { text: fill(t.portfolioDaysLeft, { days: sprint.daysLeft }), tone: sprint.daysLeft <= 2 ? "warning" : "neutral" }
}

export function SprintCell({ sprint }: { sprint: PortfolioSprint | null }) {
  const { t, language } = useLanguage()
  if (!sprint) return <span className="text-caption text-fg-subtle">{t.portfolioNoSprint}</span>
  const chip = daysChip(sprint, t)
  const burnLabel = `${t.portfolioBurndownLabel}: ${sprint.burn.join(" → ")}`
  const sprintName = pickText(sprint.i18n, "sprintName", sprint.name, language).text
  return (
    <span className="flex min-w-0 flex-col gap-1">
      <span className="flex min-w-0 items-center gap-2">
        <span className="min-w-0 truncate text-body font-medium text-fg" title={sprintName}>{sprintName}</span>
        <span className="shrink-0 whitespace-nowrap">
          <Badge tone={chip.tone} size="sm">
            {chip.text}
          </Badge>
        </span>
      </span>
      <span className="flex items-center gap-3">
        {sprint.progressPct !== null && <ProgressBar pct={sprint.progressPct} tone={sprint.daysLeft < 0 ? "danger" : "primary"} label={t.sprintCompletionRate} />}
        <BurnSparkline burn={sprint.burn} label={burnLabel} />
      </span>
      <span className="whitespace-nowrap text-caption text-fg-muted tabular-nums">
        {fill(t.portfolioSprintPoints, { done: sprint.donePoints, planned: sprint.plannedPoints })}
      </span>
    </span>
  )
}

/** No activity for this long marks the date as stale (warning colour). */
const STALE_MS = 14 * 86_400_000

/** "3 hours ago" / "2 days ago" in the viewer's language. */
export function RelativeTime({ iso, now }: { iso: string | null; now: number }) {
  const { t, language } = useLanguage()
  if (!iso) return <span className="whitespace-nowrap text-caption text-fg-subtle">{t.portfolioNoActivity}</span>
  const diffMin = Math.round((Date.parse(iso) - now) / 60_000)
  const rtf = new Intl.RelativeTimeFormat(language, { numeric: "auto" })
  const text =
    Math.abs(diffMin) < 60 ? rtf.format(diffMin, "minute") : Math.abs(diffMin) < 1440 ? rtf.format(Math.round(diffMin / 60), "hour") : rtf.format(Math.round(diffMin / 1440), "day")
  const stale = now - Date.parse(iso) > STALE_MS
  return (
    <time dateTime={iso} title={new Date(iso).toLocaleString(language)} className={cn("text-caption [word-break:keep-all]", stale ? "text-warning-strong" : "text-fg-muted")}>
      {text}
    </time>
  )
}

export { fill as fillTemplate }
