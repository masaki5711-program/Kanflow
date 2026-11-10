"use client"

import { AlertTriangle, Loader2 } from "lucide-react"
import { Button } from "@/components/ui"
import { fillTemplate } from "@/lib/fill-template"
import { formatDateTime } from "@/lib/format-date"
import type { Language, Translations } from "@/lib/i18n"

/** Mirrors lib/plan-estimate/params.ts TunedParams. */
export interface TunedParams {
  outlierMads: number
  halfLifeDays: number
  shrinkK: number
  spreadPrior: number
}
export const TUNED_KEYS = ["outlierMads", "halfLifeDays", "shrinkK", "spreadPrior"] as const
export type TunedKey = (typeof TUNED_KEYS)[number]

interface Subset {
  projects: number
  leaves: number
  mape: number
  mapeTemplate: number
  p80Hit: number
  endErrorDays: number
  endErrorTemplateDays: number
}
interface CandidateMetrics {
  full: { n: number; mape: number; mapeTemplate: number; p80Hit: number; endErrorDays: number; endErrorTemplateDays: number }
  search: Subset
  holdout: Subset
}

export type KeepReason = "not_enough_actuals" | "no_improvement" | "holdout_worse" | "not_passing" | "time_budget"

/** Mirrors services/plan-estimate-eval/params.service.ts LineageParamsView. */
export interface LineageParams {
  active: { params: TunedParams; approvedAt: string; approvedByName: string | null } | null
  lastEnded: { endedAt: string; reason: "withdrawn" | "failed" | "method" | "replaced" } | null
  latest: {
    id: string
    createdAt: string
    outcome: "propose" | "keep_default"
    reason: KeepReason | null
    params: TunedParams
    before: CandidateMetrics | null
    after: CandidateMetrics | null
    candidates: number
    evaluated: number
    outdated: boolean
    decision: "approved" | "rejected" | "superseded" | null
  } | null
  searching: boolean
}

function settingName(t: Translations, k: (typeof TUNED_KEYS)[number]): string {
  return { outlierMads: t.peeParamsName_outlierMads, halfLifeDays: t.peeParamsName_halfLifeDays, shrinkK: t.peeParamsName_shrinkK, spreadPrior: t.peeParamsName_spreadPrior }[k]
}

function keepText(t: Translations, r: KeepReason): string {
  return {
    not_enough_actuals: t.peeParamsKeep_not_enough_actuals,
    no_improvement: t.peeParamsKeep_no_improvement,
    holdout_worse: t.peeParamsKeep_holdout_worse,
    not_passing: t.peeParamsKeep_not_passing,
    time_budget: t.peeParamsKeep_time_budget,
  }[r]
}

function endedText(t: Translations, ended: NonNullable<LineageParams["lastEnded"]>, date: string): string {
  const template = { failed: t.peeParamsEndedFailed, withdrawn: t.peeParamsEndedWithdrawn, method: t.peeParamsEndedMethod, replaced: t.peeParamsEndedReplaced }[ended.reason]
  return fillTemplate(template, { date })
}

interface Props {
  t: Translations
  language: Language
  /** The lineage's display name (table captions). */
  name: string
  params: LineageParams
  defaults: TunedParams
  /** This card's action is running. */
  busy: boolean
  /** Another action is running (buttons stay focusable but do nothing). */
  blocked: boolean
  onApprove: () => void
  onReject: () => void
  onRevert: () => void
}

/**
 * The estimator settings of one lineage on the administrators' page: the values in use, the latest deterministic
 * search and its proposal (settings and the backtest numbers before / after, administrators only), approve / reject /
 * return to the defaults. Met / not met and decisions are said in words, never by color alone.
 */
export function ParamProposal({ t, language, name, params, defaults, busy, blocked, onApprove, onReject, onRevert }: Props) {
  const num = new Intl.NumberFormat(language, { maximumFractionDigits: 2 })
  const percent = new Intl.NumberFormat(language, { style: "percent", maximumFractionDigits: 0 })
  const days = (x: number) => fillTemplate(t.peeAdminDays, { value: new Intl.NumberFormat(language, { maximumFractionDigits: 1 }).format(x) })
  const value = (k: (typeof TUNED_KEYS)[number], v: number) =>
    k === "outlierMads" ? fillTemplate(t.peeParamsValueMads, { value: num.format(v) }) : k === "halfLifeDays" ? fillTemplate(t.peeParamsValueDays, { value: num.format(v) }) : num.format(v)

  const p = params.latest
  const inUse = params.active
    ? params.active.approvedByName
      ? fillTemplate(t.peeParamsInUseApprovedBy, { name: params.active.approvedByName, date: formatDateTime(params.active.approvedAt, language) })
      : fillTemplate(t.peeParamsInUseApprovedOn, { date: formatDateTime(params.active.approvedAt, language) })
    : t.peeParamsInUseDefault
  const pending = p?.outcome === "propose" && p.decision === null
  const canDecide = pending && !p.outdated && !params.searching
  const decided = p?.outcome === "propose" && p.decision !== null
  const decisionText = p?.decision ? { approved: t.peeParamsDecision_approved, rejected: t.peeParamsDecision_rejected, superseded: t.peeParamsDecision_superseded }[p.decision] : null
  const cell = "px-2 py-1.5 text-left align-top"
  const showTables = p?.outcome === "propose" && p.before && p.after && !decided

  return (
    <section aria-label={t.peeParamsTitle} className="mt-4 space-y-3 border-t border-border pt-3">
      <h3 className="text-body font-semibold text-fg">{t.peeParamsTitle}</h3>
      <p className="text-caption text-fg-muted">
        {inUse}
        {!params.active && params.lastEnded && <span className="block">{endedText(t, params.lastEnded, formatDateTime(params.lastEnded.endedAt, language))}</span>}
      </p>
      {params.active && (
        <dl className="grid grid-cols-1 gap-x-4 gap-y-1 text-caption sm:grid-cols-2">
          {TUNED_KEYS.map((k) => (
            <div key={k} className="flex flex-wrap gap-x-2">
              <dt className="text-fg-muted">{settingName(t, k)}</dt>
              <dd className="tabular-nums text-fg">{value(k, params.active?.params[k] ?? defaults[k])}</dd>
            </div>
          ))}
        </dl>
      )}

      {params.searching ? (
        <p className="flex items-center gap-2 text-caption text-fg-muted">
          <Loader2 aria-hidden="true" className="h-3.5 w-3.5 motion-safe:animate-spin" />
          {t.peeParamsSearchingLine}
        </p>
      ) : !p ? (
        <p className="text-caption text-fg-subtle">{t.peeParamsNone}</p>
      ) : (
        <div className="space-y-2">
          <p className="text-caption text-fg-subtle">
            {fillTemplate(t.peeParamsSearchedOn, { date: formatDateTime(p.createdAt, language), evaluated: p.evaluated, candidates: p.candidates })}
            {decisionText && <span className="ml-2 font-medium text-fg-muted">{decisionText}</span>}
          </p>
          {p.outcome === "keep_default" && p.reason && <p className="rounded-ui-sm bg-surface-sunken px-3 py-2 text-body text-fg">{fillTemplate(t.peeParamsKeep, { reason: keepText(t, p.reason) })}</p>}
          {showTables && p.before && p.after && (
            <div className="space-y-3">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[20rem] border-collapse text-caption">
                  <caption className="sr-only">{fillTemplate(t.peeParamsSettingsCaption, { name })}</caption>
                  <thead>
                    <tr className="border-b border-border text-fg-muted">
                      <th scope="col" className={cell}>{t.peeParamsColSetting}</th>
                      <th scope="col" className={cell}>{t.peeParamsColDefault}</th>
                      <th scope="col" className={cell}>{t.peeParamsColProposed}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {TUNED_KEYS.map((k) => (
                      <tr key={k} className="border-b border-border last:border-b-0">
                        <th scope="row" className={`${cell} font-normal text-fg-muted`}>{settingName(t, k)}</th>
                        <td className={`${cell} tabular-nums text-fg`}>{value(k, defaults[k])}</td>
                        <td className={`${cell} tabular-nums ${p.params[k] !== defaults[k] ? "font-semibold text-fg" : "text-fg"}`}>{value(k, p.params[k])}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[20rem] border-collapse text-caption">
                  <caption className="sr-only">{fillTemplate(t.peeParamsMetricsCaption, { name })}</caption>
                  <thead>
                    <tr className="border-b border-border text-fg-muted">
                      <th scope="col" className={cell}>{t.peeParamsColSetting}</th>
                      <th scope="col" className={cell}>{t.peeParamsColDefault}</th>
                      <th scope="col" className={cell}>{t.peeParamsColProposed}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      [fillTemplate(t.peeParamsMetricError, { n: p.after.full.n }), percent.format(p.before.full.mape), percent.format(p.after.full.mape)],
                      [fillTemplate(t.peeParamsMetricP80, { n: p.after.full.n }), percent.format(p.before.full.p80Hit), percent.format(p.after.full.p80Hit)],
                      [fillTemplate(t.peeParamsMetricEnd, { n: p.after.full.n }), days(p.before.full.endErrorDays), days(p.after.full.endErrorDays)],
                      [fillTemplate(t.peeParamsMetricHoldout, { n: p.after.holdout.projects }), percent.format(p.before.holdout.mape), percent.format(p.after.holdout.mape)],
                    ].map(([label, before, after]) => (
                      <tr key={label} className="border-b border-border last:border-b-0">
                        <th scope="row" className={`${cell} font-normal text-fg-muted`}>{label}</th>
                        <td className={`${cell} tabular-nums text-fg`}>{before}</td>
                        <td className={`${cell} tabular-nums font-semibold text-fg`}>{after}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
          {pending && p.outdated && (
            <p className="flex items-start gap-2 rounded-ui-sm border-l-2 border-l-warning bg-warning-soft px-3 py-2 text-body text-warning-strong">
              <AlertTriangle aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
              {t.peeParamsOutdated}
            </p>
          )}
        </div>
      )}

      {(canDecide || params.active) && (
        <div className="flex flex-wrap justify-end gap-2">
          {params.active && (
            <Button size="sm" variant="secondary" onClick={onRevert} loading={busy && !canDecide} aria-disabled={blocked || undefined}>
              {t.peeParamsRevert}
            </Button>
          )}
          {canDecide && (
            <>
              <Button size="sm" variant="secondary" onClick={onReject} aria-disabled={blocked || busy || undefined}>
                {t.peeParamsReject}
              </Button>
              <Button size="sm" onClick={onApprove} loading={busy} aria-disabled={blocked || undefined}>
                {t.peeParamsApprove}
              </Button>
            </>
          )}
        </div>
      )}
    </section>
  )
}
