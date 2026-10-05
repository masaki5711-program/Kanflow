"use client"

import { BOARD_STAGES } from "@/lib/improvement/constants"
import { stageLabel } from "@/lib/improvement/labels"
import type { ImprovementSummary } from "@/lib/improvement/metrics"
import { DATE_LOCALE } from "@/lib/format-date"
import { useLanguage } from "@/lib/language-context"
import { STAGE_STYLE } from "./stage-style"

/**
 * The management numbers above the board: 効果金額合計, 標準化済み件数,
 * 横展開完了率 and the count per stage. Large figures, readable from a
 * distance on the floor PC.
 */
export function SummaryStrip({ summary }: { summary: ImprovementSummary }) {
  const { t, language } = useLanguage()
  const locale = DATE_LOCALE[language]
  const yen = new Intl.NumberFormat(locale).format(summary.totalAnnualEffectYen)
  const rollout = summary.rolloutCompletion === null ? t.kzNone : `${Math.round(summary.rolloutCompletion * 100)}%`

  return (
    <section aria-label={t.kzSumByStage} className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-[1.4fr_1fr_1fr_2fr]">
      <Figure label={t.kzSumEffect} value={t.kzYen.replace("{value}", yen)} unit={t.kzSumEffectUnit} emphasis />
      <Figure label={t.kzSumStandardized} value={String(summary.standardizedCount)} unit={`/ ${summary.itemCount - summary.countByStage.deferred}`} />
      <Figure
        label={t.kzSumRollout}
        value={rollout}
        unit={summary.rolloutTotal > 0 ? `${summary.rolloutDone}/${summary.rolloutTotal}` : undefined}
      />
      <div className="col-span-2 rounded-ui-lg border border-border bg-surface p-4 shadow-ui-sm lg:col-span-1">
        <p className="text-caption font-medium text-fg-muted">{t.kzSumByStage}</p>
        <ul className="mt-2 flex flex-wrap gap-2">
          {BOARD_STAGES.map((stage) => (
            <li key={stage} className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-caption font-medium ${STAGE_STYLE[stage].chip}`}>
              <span aria-hidden="true" className={`h-2 w-2 rounded-full ${STAGE_STYLE[stage].dot}`} />
              {stageLabel(stage, t)}
              <span className="font-bold tabular-nums">{summary.countByStage[stage]}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}

interface FigureProps {
  label: string
  value: string
  unit?: string
  emphasis?: boolean
}

function Figure({ label, value, unit, emphasis = false }: FigureProps) {
  return (
    <div
      className={`rounded-ui-lg border p-4 shadow-ui-sm ${emphasis ? "col-span-2 border-primary/30 bg-primary-soft/50 lg:col-span-1" : "border-border bg-surface"}`}
    >
      <p className="text-caption font-medium text-fg-muted">{label}</p>
      <p className="mt-1 flex flex-wrap items-baseline gap-x-1.5">
        <span className={`font-bold tabular-nums text-fg ${emphasis ? "text-[1.75rem] leading-tight" : "text-heading"}`}>{value}</span>
        {unit && <span className="text-caption text-fg-muted">{unit}</span>}
      </p>
    </div>
  )
}
