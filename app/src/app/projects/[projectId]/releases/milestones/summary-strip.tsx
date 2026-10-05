"use client"

import type { ReactNode } from "react"
import { CircleCheckBig, ClipboardCheck, FileCheck2, Flag, ListTodo, Wallet } from "lucide-react"
import { cn } from "@/components/ui"
import { fillTemplate } from "@/lib/fill-template"
import { DATE_LOCALE, formatShortDate } from "@/lib/format-date"
import { useLanguage } from "@/lib/language-context"
import { checkLabel, formatYen, type MilestoneBoard } from "./milestone-types"

interface Props {
  board: MilestoneBoard
  /** Localized stage / milestone name. */
  nameOf: (s: { name: string; i18n: unknown }) => string
  onOpenStage: (stageId: string) => void
}

/**
 * The numbers above the board, large enough to read from a distance: stage
 * progress (late in red, next milestone), checks passed (検収完了), open
 * 残課題 (overdue in red), documents received and — when on — the budget.
 */
export function SummaryStrip({ board, nameOf, onOpenStage }: Props) {
  const { t, language } = useLanguage()
  const s = board.summary
  const label = checkLabel(board, t)
  const next = s.stages.next
  const nextStage = next ? board.stages.find((st) => st.id === next.stageId) : undefined
  const nextNode = nextStage && next ? [nextStage, ...nextStage.steps].find((n) => n.id === next.id) : undefined
  const nextName = next ? nameOf(nextNode ?? { name: next.name, i18n: {} }) : ""
  return (
    <section aria-label={t.msSumAria} className={cn("mb-5 grid grid-cols-2 gap-3", board.settings.budgetEnabled ? "lg:grid-cols-5" : "lg:grid-cols-4")}>
      <Figure icon={<Flag className="h-4 w-4" />} label={t.msSumStages} value={fillTemplate(t.msSumStagesDone, { done: s.stages.done, total: s.stages.total })} tone={s.stages.late > 0 ? "danger" : "neutral"}>
        {s.stages.late > 0 && <span className="font-semibold text-danger-strong">{fillTemplate(t.msSumLate, { n: s.stages.late })}</span>}
        {next ? (
          <button type="button" onClick={() => onOpenStage(next.stageId)} className="block max-w-full truncate text-left text-primary-strong underline-offset-2 hover:underline">
            {fillTemplate(t.msSumNext, { name: nextName })}
            {next.date ? `（${formatShortDate(next.date, language, { utc: true })}）` : `（${t.msUndated}）`}
          </button>
        ) : (
          s.stages.total > 0 && <span>{t.msSumNextNone}</span>
        )}
      </Figure>
      <Figure icon={<ClipboardCheck className="h-4 w-4" />} label={fillTemplate(t.msSumChecks, { label })} value={fillTemplate(t.msSumChecksValue, { passed: s.checks.passed, total: s.checks.total })} tone={s.checks.complete ? "success" : s.checks.failed > 0 ? "danger" : "neutral"}>
        {s.checks.complete && (
          <span className="inline-flex items-center gap-1 font-bold text-success-strong" data-testid="ms-accepted">
            <CircleCheckBig aria-hidden="true" className="h-4 w-4" />
            {t.msAccepted}
          </span>
        )}
      </Figure>
      <Figure icon={<ListTodo className="h-4 w-4" />} label={t.msSumPunch} value={String(s.punch.open)} unit={t.msSumPunchOpen} tone={s.punch.overdue > 0 ? "danger" : s.punch.open > 0 ? "warning" : "neutral"} big>
        {s.punch.overdue > 0 && <span className="font-semibold text-danger-strong">{fillTemplate(t.msSumPunchOverdue, { n: s.punch.overdue })}</span>}
      </Figure>
      <Figure icon={<FileCheck2 className="h-4 w-4" />} label={t.msSumDocs} value={fillTemplate(t.msSumDocsValue, { received: s.documents.received, total: s.documents.total })} tone={s.documents.total > 0 && s.documents.received === s.documents.total ? "success" : "neutral"} />
      {board.settings.budgetEnabled && <BudgetFigure board={board} locale={DATE_LOCALE[language]} />}
    </section>
  )
}

function BudgetFigure({ board, locale }: { board: MilestoneBoard; locale: string }) {
  const { t } = useLanguage()
  const b = board.summary.budget
  const yen = (v: number) => fillTemplate(t.msYen, { value: formatYen(v, locale) })
  const over = b.variance !== null && b.variance > 0
  return (
    <Figure icon={<Wallet className="h-4 w-4" />} label={t.msSumBudget} value={yen(b.actual)} tone={over ? "danger" : "neutral"} className="col-span-2 lg:col-span-1">
      <span>{fillTemplate(t.msSumBudgetValue, { actual: yen(b.actual), planned: yen(b.planned) })}</span>
      {b.variance !== null && (
        <span className={over ? "font-semibold text-danger-strong" : "text-success-strong"}>
          {fillTemplate(over ? t.msOverBudget : t.msUnderBudget, { value: yen(Math.abs(b.variance)) })}
        </span>
      )}
    </Figure>
  )
}

const TONE = {
  neutral: "border-border bg-surface",
  success: "border-success/40 bg-success-soft/60",
  warning: "border-warning/40 bg-warning-soft/50",
  danger: "border-danger/40 bg-danger-soft/50",
} as const

interface FigureProps {
  icon: ReactNode
  label: string
  value: string
  unit?: string
  tone: keyof typeof TONE
  big?: boolean
  className?: string
  children?: ReactNode
}

function Figure({ icon, label, value, unit, tone, big = false, className, children }: FigureProps) {
  return (
    <div className={cn("min-w-0 rounded-ui-lg border p-3 shadow-ui-sm sm:p-4", TONE[tone], className)}>
      <p className="flex items-center gap-1.5 text-caption font-medium text-fg-muted">
        <span aria-hidden="true">{icon}</span>
        {label}
      </p>
      <p className="mt-1 flex flex-wrap items-baseline gap-x-1.5">
        <span className={cn("font-bold tabular-nums text-fg", big ? "text-[2rem] leading-none" : "text-heading")}>{value}</span>
        {unit && <span className="text-caption text-fg-muted">{unit}</span>}
      </p>
      {children && <div className="mt-1 flex flex-col items-start gap-0.5 text-caption text-fg-muted">{children}</div>}
    </div>
  )
}
