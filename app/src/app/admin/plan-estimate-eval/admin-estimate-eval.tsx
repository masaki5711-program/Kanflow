"use client"

import { useEffect, useRef, useState } from "react"
import { AlertTriangle, Check, RefreshCw } from "lucide-react"
import { Badge, Button, EmptyState, PageHeader, SkeletonCard, cn, useConfirm, useToast, type BadgeTone } from "@/components/ui"
import { gateReasonText, type GateReason } from "@/components/plan-estimate/types"
import { apiFetch, useApiQuery } from "@/hooks"
import { localizeApiError } from "@/hooks/api-client"
import { useDocumentTitle } from "@/hooks/use-document-title"
import { fillTemplate } from "@/lib/fill-template"
import { formatDateTime, formatLongDate } from "@/lib/format-date"
import { useLanguage } from "@/lib/language-context"
import type { Translations } from "@/lib/i18n"

/** Mirrors services/plan-estimate-eval/admin.service.ts EvalOverview (the API's shape). */
export interface LineageEval {
  lineage: string
  name: string | null
  latest: { id: string; evaluatedOn: string; n: number; skipped: number | null; mape: number; mapeTemplate: number; p80Hit: number; endErrorDays: number; endErrorTemplateDays: number } | null
  outdated: boolean
  passes: boolean
  reason: GateReason | null
  approval: { approvedAt: string; approvedByName: string | null } | null
  lastEnded: { endedAt: string; reason: "withdrawn" | "failed" | "method" } | null
  on: boolean
}

export interface EvalOverview {
  methodVersion: string
  conditions: { minProjects: number; mapeRatio: number; p80Range: readonly [number, number] }
  lineages: LineageEval[]
}

const URL = "/api/admin/plan-estimate-eval"
/** id of a card's heading (by position: a lineage may contain spaces, which an id / aria-labelledby cannot). */
const headingIdOf = (index: number) => `pee-lineage-${index}`

type State = "on" | "ready" | "outdated" | "off" | "none"

function stateOf(l: LineageEval): State {
  if (!l.latest) return "none"
  if (l.on) return "on"
  if (!l.passes) return "off"
  return l.outdated ? "outdated" : "ready"
}

const STATE_TONE: Record<State, BadgeTone> = { on: "success", ready: "info", outdated: "warning", off: "warning", none: "neutral" }
const STATE_ACCENT: Record<State, string> = { on: "border-l-success", ready: "border-l-info", outdated: "border-l-warning", off: "border-l-warning", none: "border-l-border-strong" }

function stateLabel(t: Translations, s: State): string {
  return { on: t.peeAdminStateOn, ready: t.peeAdminStateReady, outdated: t.peeAdminStateOutdated, off: t.peeAdminStateOff, none: t.peeAdminStateNone }[s]
}

function endedText(t: Translations, ended: NonNullable<LineageEval["lastEnded"]>, date: string): string {
  const template = ended.reason === "failed" ? t.peeAdminEndedFailed : ended.reason === "method" ? t.peeAdminEndedMethod : t.peeAdminEndedWithdrawn
  return fillTemplate(template, { date })
}

interface MetricProps {
  label: string
  value: string
  sub?: string
  met: boolean
}

/** One number with its condition: met / not met is said in words (and an icon), not by color alone. */
function Metric({ label, value, sub, met }: MetricProps) {
  const { t } = useLanguage()
  const Icon = met ? Check : AlertTriangle
  return (
    <div className={cn("min-w-0 rounded-ui-md border-l-2 bg-surface-sunken px-3 py-2", met ? "border-l-success" : "border-l-warning")}>
      <dt className="text-caption font-medium text-fg-muted">{label}</dt>
      <dd className="mt-0.5 flex flex-wrap items-baseline gap-x-2">
        <span className="text-body-lg font-semibold tabular-nums text-fg">{value}</span>
        {sub && <span className="text-caption tabular-nums text-fg-subtle">{sub}</span>}
      </dd>
      <dd className={cn("mt-0.5 flex items-center gap-1 text-caption", met ? "text-success-strong" : "text-warning-strong")}>
        <Icon aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
        {met ? t.peeAdminMet : t.peeAdminNotMet}
      </dd>
    </div>
  )
}

/**
 * /admin/plan-estimate-eval: the backtest of real actuals per lineage (exact numbers — administrators only) and the
 * approval that turns "実績での見直し" on for a lineage (plan 12 §5 / §8 item 6).
 */
export function AdminEstimateEval() {
  const { t, language } = useLanguage()
  useDocumentTitle([t.peeAdminTitle])
  const toast = useToast()
  const confirm = useConfirm()
  const { data, isLoading, error, refetch, mutate } = useApiQuery<EvalOverview>(URL, { toastOnError: () => t.peeAdminLoadFailed })
  const [busy, setBusy] = useState<string | null>(null)
  /** The lineage whose card gets the focus once the reloaded list rendered (its button was replaced). */
  const [focusLineage, setFocusLineage] = useState<string | null>(null)

  useEffect(() => {
    if (!focusLineage || !data) return
    const index = data.lineages.findIndex((l) => l.lineage === focusLineage)
    if (index >= 0) document.getElementById(headingIdOf(index))?.focus()
    setFocusLineage(null)
  }, [data, focusLineage])

  const percent = new Intl.NumberFormat(language, { style: "percent", maximumFractionDigits: 0 })
  const days = (x: number) => fillTemplate(t.peeAdminDays, { value: new Intl.NumberFormat(language, { maximumFractionDigits: 1 }).format(x) })

  // A ref as well as the state: two clicks in the same tick both see the state before it re-renders.
  const inFlight = useRef(false)

  async function act(key: string, action: () => Promise<EvalOverview & { failed?: string[] }>, done: string) {
    if (busy || inFlight.current) return
    inFlight.current = true
    setBusy(key)
    try {
      const next = await action()
      mutate(next)
      if (next.failed && next.failed.length > 0) toast.error(fillTemplate(t.peeAdminRecomputeFailed, { n: next.failed.length }))
      else toast.success(done)
    } catch (err) {
      toast.error(localizeApiError(err, t))
      void refetch()
    } finally {
      if (key !== "*") setFocusLineage(key)
      inFlight.current = false
      setBusy(null)
    }
  }

  // aria-disabled does not stop a click: without a list there is nothing to recompute yet.
  const recompute = () => (data ? act("*", () => apiFetch<EvalOverview & { failed: string[] }>(URL, { method: "POST" }), t.peeAdminRecomputed) : Promise.resolve())
  const label = (l: LineageEval) => l.name ?? t.peeAdminUnnamed

  async function approve(l: LineageEval) {
    if (busy || !l.latest) return
    const yes = await confirm({ title: t.peeAdminApproveTitle, message: `${label(l)}\n\n${t.peeAdminApproveBody}`, confirmLabel: t.peeAdminApprove, variant: "warning" })
    if (!yes) return
    const evalId = l.latest.id
    await act(l.lineage, () => apiFetch<EvalOverview>(`${URL}/approval`, { method: "POST", json: { decision: "approve", lineage: l.lineage, evalId } }), t.peeAdminApproved)
  }

  async function withdraw(l: LineageEval) {
    if (busy) return
    const yes = await confirm({ title: t.peeAdminWithdrawTitle, message: `${label(l)}\n\n${t.peeAdminWithdrawBody}`, confirmLabel: t.peeAdminWithdraw, variant: "danger" })
    if (!yes) return
    await act(l.lineage, () => apiFetch<EvalOverview>(`${URL}/approval`, { method: "POST", json: { decision: "withdraw", lineage: l.lineage } }), t.peeAdminWithdrawn)
  }

  const recomputing = busy === "*"

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeader
        title={t.peeAdminTitle}
        description={t.peeAdminDescription}
        actions={
          // Stays focusable while busy (aria-disabled, not disabled): the focus is not lost when the work ends.
          <Button
            variant="secondary"
            onClick={() => void recompute()}
            aria-disabled={!data || busy !== null || undefined}
            aria-busy={recomputing || undefined}
            leftIcon={<RefreshCw aria-hidden="true" className={cn("h-4 w-4", recomputing && "motion-safe:animate-spin")} />}
          >
            {t.peeAdminRecompute}
          </Button>
        }
      />
      <span className="sr-only" role="status">
        {/* Always mounted (announced when filled): the pressed row button is disabled while it works. */}
        {recomputing ? t.peeAdminRecomputing : busy !== null ? t.peeAdminSaving : ""}
      </span>

      {data && (
        <p className="rounded-ui-md bg-surface-sunken px-4 py-3 text-body text-fg-muted">
          {fillTemplate(t.peeAdminConditions, {
            min: data.conditions.minProjects,
            ratio: Math.round(data.conditions.mapeRatio * 100),
            low: Math.round(data.conditions.p80Range[0] * 100),
            high: Math.round(data.conditions.p80Range[1] * 100),
          })}{" "}
          <span className="text-caption text-fg-subtle">{fillTemplate(t.peeAdminMethod, { version: data.methodVersion })}</span>
        </p>
      )}

      {isLoading && !data ? (
        <div className="space-y-3" aria-busy="true">
          <span className="sr-only" role="status">
            {t.loading}
          </span>
          <SkeletonCard />
          <SkeletonCard />
        </div>
      ) : error && !data ? (
        <EmptyState headingLevel={2} title={t.peeAdminLoadFailed} action={<Button onClick={() => void refetch()}>{t.errorRetry}</Button>} />
      ) : !data || data.lineages.length === 0 ? (
        <EmptyState headingLevel={2} title={t.peeAdminEmptyTitle} description={t.peeAdminEmptyBody} />
      ) : (
        <ul className="space-y-4">
          {data.lineages.map((l, index) => {
            const s = stateOf(l)
            const r = l.latest
            const c = data.conditions
            const headingId = headingIdOf(index)
            const rowBusy = busy === l.lineage
            const canApprove = l.passes && !l.outdated && !l.approval
            const status = l.approval
              ? l.approval.approvedByName
                ? fillTemplate(t.peeAdminApprovedBy, { name: l.approval.approvedByName, date: formatDateTime(l.approval.approvedAt, language) })
                : fillTemplate(t.peeAdminApprovedOn, { date: formatDateTime(l.approval.approvedAt, language) })
              : l.lastEnded
                ? endedText(t, l.lastEnded, formatDateTime(l.lastEnded.endedAt, language))
                : null
            return (
              <li key={l.lineage}>
                <article
                  aria-labelledby={headingId}
                  className={cn(
                    "rounded-ui-md border border-l-4 border-border bg-surface p-4 shadow-ui-sm transition-[box-shadow,opacity] sm:p-5",
                    STATE_ACCENT[s],
                    rowBusy && "opacity-70",
                  )}
                >
                  <header className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h2 id={headingId} tabIndex={-1} className="rounded-ui-sm text-title font-semibold text-fg [overflow-wrap:anywhere] focus:outline-none focus-visible:ring-2 focus-visible:ring-primary">
                        {label(l)}
                      </h2>
                      <p className="mt-0.5 font-mono text-caption text-fg-subtle [overflow-wrap:anywhere]">{fillTemplate(t.peeAdminLineage, { lineage: l.lineage })}</p>
                    </div>
                    <Badge tone={STATE_TONE[s]} size="md" className="max-w-full whitespace-normal rounded-ui-sm text-left">
                      {stateLabel(t, s)}
                    </Badge>
                  </header>

                  {r && (
                    <dl className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
                      <Metric
                        label={t.peeAdminProjects}
                        value={fillTemplate(t.peeAdminProjectsValue, { n: r.n })}
                        sub={r.skipped ? fillTemplate(t.peeAdminSkipped, { n: r.skipped }) : undefined}
                        met={r.n >= c.minProjects}
                      />
                      <Metric label={t.peeAdminError} value={percent.format(r.mape)} sub={fillTemplate(t.peeAdminVsTemplate, { value: percent.format(r.mapeTemplate) })} met={r.mape <= c.mapeRatio * r.mapeTemplate} />
                      <Metric label={t.peeAdminP80} value={percent.format(r.p80Hit)} met={r.p80Hit >= c.p80Range[0] && r.p80Hit <= c.p80Range[1]} />
                      <Metric label={t.peeAdminEndError} value={days(r.endErrorDays)} sub={fillTemplate(t.peeAdminVsTemplate, { value: days(r.endErrorTemplateDays) })} met={r.endErrorDays <= r.endErrorTemplateDays} />
                    </dl>
                  )}

                  {r && (
                    <div className="mt-3 space-y-2">
                      <p className="text-caption text-fg-subtle">
                        {fillTemplate(t.peeAdminEvaluatedOn, { date: formatLongDate(r.evaluatedOn, language) })}
                        {r.skipped ? <span className="block">{t.peeAdminSkippedHint}</span> : null}
                      </p>
                      {l.outdated && (
                        <p className="flex items-start gap-2 rounded-ui-sm border-l-2 border-l-warning bg-warning-soft px-3 py-2 text-body text-warning-strong">
                          <AlertTriangle aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
                          {t.peeAdminOutdated}
                        </p>
                      )}
                      {!l.passes && l.reason && l.reason !== "no_backtest" && (
                        <p className="rounded-ui-sm border-l-2 border-l-warning bg-surface-sunken px-3 py-2 text-body text-fg">{fillTemplate(t.peeAdminReason, { reason: gateReasonText(t, l.reason) })}</p>
                      )}
                    </div>
                  )}

                  {(status || l.approval || canApprove) && (
                    <footer className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3">
                      <p className="text-caption text-fg-muted">
                        {status}
                        {l.approval && !l.on && <span className="block">{t.peeAdminApproveWaits}</span>}
                      </p>
                      {l.approval ? (
                        <Button size="sm" variant="secondary" onClick={() => void withdraw(l)} loading={rowBusy} aria-disabled={(busy !== null && !rowBusy) || undefined}>
                          {t.peeAdminWithdraw}
                        </Button>
                      ) : canApprove ? (
                        <Button size="sm" onClick={() => void approve(l)} loading={rowBusy} aria-disabled={(busy !== null && !rowBusy) || undefined}>
                          {t.peeAdminApprove}
                        </Button>
                      ) : null}
                    </footer>
                  )}
                </article>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
