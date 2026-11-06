"use client"

import { useState } from "react"
import { RefreshCw } from "lucide-react"
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
  latest: { id: string; evaluatedOn: string; n: number; mape: number; mapeTemplate: number; p80Hit: number; endErrorDays: number; endErrorTemplateDays: number } | null
  passes: boolean
  reason: GateReason | null
  approval: { approvedAt: string; approvedByName: string | null } | null
  on: boolean
}

export interface EvalOverview {
  methodVersion: string
  conditions: { minProjects: number; mapeRatio: number; p80Range: readonly [number, number] }
  lineages: LineageEval[]
}

const URL = "/api/admin/plan-estimate-eval"
const pct = (x: number) => `${Math.round(x * 100)}%`
const oneDecimal = (x: number) => (Math.round(x * 10) / 10).toString()

type State = "on" | "ready" | "off" | "none"

function stateOf(l: LineageEval): State {
  if (!l.latest) return "none"
  if (l.on) return "on"
  return l.passes ? "ready" : "off"
}

const STATE_TONE: Record<State, BadgeTone> = { on: "success", ready: "info", off: "warning", none: "neutral" }
const STATE_ACCENT: Record<State, string> = { on: "border-l-success", ready: "border-l-info", off: "border-l-warning", none: "border-l-border-strong" }

function stateLabel(t: Translations, s: State): string {
  return s === "on" ? t.peeAdminStateOn : s === "ready" ? t.peeAdminStateReady : s === "off" ? t.peeAdminStateOff : t.peeAdminStateNone
}

interface MetricProps {
  label: string
  value: string
  sub?: string
  met: boolean
}

/** One number with its condition: met / not met is said in words too (not by color alone). */
function Metric({ label, value, sub, met }: MetricProps) {
  const { t } = useLanguage()
  return (
    <div className="min-w-0 rounded-ui-md bg-surface-sunken px-3 py-2">
      <dt className="text-caption font-medium text-fg-muted">{label}</dt>
      <dd className="mt-0.5 flex flex-wrap items-baseline gap-x-2">
        <span className="text-title font-semibold tabular-nums text-fg">{value}</span>
        {sub && <span className="text-caption tabular-nums text-fg-subtle">{sub}</span>}
      </dd>
      <dd className={cn("mt-0.5 text-caption", met ? "text-success" : "text-warning")}>{met ? t.peeAdminMet : t.peeAdminNotMet}</dd>
    </div>
  )
}

/**
 * /admin/plan-estimate-eval: the backtest of real actuals per lineage (exact numbers — administrators only) and the
 * approval that turns "実績で調整" on for a lineage (plan 12 §5 / §8 item 6).
 */
export function AdminEstimateEval() {
  const { t, language } = useLanguage()
  useDocumentTitle([t.peeAdminTitle])
  const toast = useToast()
  const confirm = useConfirm()
  const { data, isLoading, error, refetch, mutate } = useApiQuery<EvalOverview>(URL, { toastOnError: () => t.peeAdminLoadFailed })
  const [busy, setBusy] = useState<string | null>(null)

  async function act(key: string, action: () => Promise<EvalOverview>, done: string) {
    if (busy) return
    setBusy(key)
    try {
      mutate(await action())
      toast.success(done)
    } catch (err) {
      toast.error(localizeApiError(err, t))
      void refetch()
    } finally {
      setBusy(null)
    }
  }

  const recompute = () => act("*", () => apiFetch<EvalOverview>(URL, { method: "POST" }), t.peeAdminRecomputed)

  async function approve(l: LineageEval) {
    if (busy || !l.latest) return
    const yes = await confirm({ title: t.peeAdminApproveTitle, message: `${l.name ?? l.lineage}\n\n${t.peeAdminApproveBody}`, confirmLabel: t.peeAdminApprove, variant: "warning" })
    if (!yes) return
    const evalId = l.latest.id
    await act(l.lineage, () => apiFetch<EvalOverview>(`${URL}/approval`, { method: "POST", json: { decision: "approve", lineage: l.lineage, evalId } }), t.peeAdminApproved)
  }

  async function withdraw(l: LineageEval) {
    if (busy) return
    const yes = await confirm({ title: t.peeAdminWithdrawTitle, message: `${l.name ?? l.lineage}\n\n${t.peeAdminWithdrawBody}`, confirmLabel: t.peeAdminWithdraw, variant: "danger" })
    if (!yes) return
    await act(l.lineage, () => apiFetch<EvalOverview>(`${URL}/approval`, { method: "POST", json: { decision: "withdraw", lineage: l.lineage } }), t.peeAdminWithdrawn)
  }

  const c = data?.conditions
  const conditions = c
    ? fillTemplate(t.peeAdminConditions, { min: c.minProjects, ratio: Math.round(c.mapeRatio * 100), low: Math.round(c.p80Range[0] * 100), high: Math.round(c.p80Range[1] * 100) })
    : null

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeader
        title={t.peeAdminTitle}
        description={t.peeAdminDescription}
        actions={
          <Button variant="secondary" onClick={() => void recompute()} loading={busy === "*"} disabled={!data || (busy !== null && busy !== "*")} leftIcon={<RefreshCw aria-hidden="true" className="h-4 w-4" />}>
            {busy === "*" ? t.peeAdminRecomputing : t.peeAdminRecompute}
          </Button>
        }
      />

      {data && (
        <p className="rounded-ui-md border border-border bg-surface px-4 py-3 text-body text-fg-muted">
          {conditions} <span className="whitespace-nowrap text-caption text-fg-subtle">{fillTemplate(t.peeAdminMethod, { version: data.methodVersion })}</span>
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
          {data.lineages.map((l) => {
            const s = stateOf(l)
            const r = l.latest
            const headingId = `pee-${l.lineage}`
            const rowBusy = busy === l.lineage
            return (
              <li key={l.lineage}>
                <article
                  aria-labelledby={headingId}
                  aria-busy={rowBusy || undefined}
                  className={cn("rounded-ui-lg border border-l-4 border-border bg-surface p-4 shadow-ui-sm transition-shadow focus-within:shadow-ui-md hover:shadow-ui-md sm:p-5", STATE_ACCENT[s])}
                >
                  <header className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h2 id={headingId} className="text-title font-semibold text-fg [overflow-wrap:anywhere]">
                        {l.name ?? l.lineage}
                      </h2>
                      {l.name && <p className="mt-0.5 font-mono text-caption text-fg-subtle [overflow-wrap:anywhere]">{fillTemplate(t.peeAdminLineage, { lineage: l.lineage })}</p>}
                    </div>
                    <Badge tone={STATE_TONE[s]} size="md" className="whitespace-normal text-left">
                      {stateLabel(t, s)}
                    </Badge>
                  </header>

                  {r && (
                    <>
                      <dl className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
                        <Metric label={t.peeAdminProjects} value={fillTemplate(t.peeAdminProjectsValue, { n: r.n })} met={r.n >= (c?.minProjects ?? Infinity)} />
                        <Metric label={t.peeAdminError} value={pct(r.mape)} sub={fillTemplate(t.peeAdminVsTemplate, { value: pct(r.mapeTemplate) })} met={r.mape <= (c?.mapeRatio ?? 0) * r.mapeTemplate} />
                        <Metric label={t.peeAdminP80} value={pct(r.p80Hit)} met={!!c && r.p80Hit >= c.p80Range[0] && r.p80Hit <= c.p80Range[1]} />
                        <Metric
                          label={t.peeAdminEndError}
                          value={fillTemplate(t.peeAdminDays, { value: oneDecimal(r.endErrorDays) })}
                          sub={fillTemplate(t.peeAdminVsTemplate, { value: fillTemplate(t.peeAdminDays, { value: oneDecimal(r.endErrorTemplateDays) }) })}
                          met={r.endErrorDays <= r.endErrorTemplateDays}
                        />
                      </dl>
                      <p className="mt-2 text-caption text-fg-subtle">{fillTemplate(t.peeAdminEvaluatedOn, { date: formatLongDate(r.evaluatedOn, language) })}</p>
                    </>
                  )}
                  {!l.passes && l.reason && l.reason !== "no_backtest" && <p className="mt-2 text-body text-fg">{fillTemplate(t.peeAdminReason, { reason: gateReasonText(t, l.reason) })}</p>}

                  <footer className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3">
                    <p className="text-caption text-fg-muted">
                      {l.approval
                        ? l.approval.approvedByName
                          ? fillTemplate(t.peeAdminApprovedBy, { name: l.approval.approvedByName, date: formatDateTime(l.approval.approvedAt, language) })
                          : fillTemplate(t.peeAdminApprovedOn, { date: formatDateTime(l.approval.approvedAt, language) })
                        : null}
                      {l.approval && !l.passes && <span className="block">{t.peeAdminApproveWaits}</span>}
                    </p>
                    <div className="flex gap-2">
                      {l.approval ? (
                        <Button size="sm" variant="secondary" onClick={() => void withdraw(l)} loading={rowBusy} disabled={busy !== null && !rowBusy}>
                          {t.peeAdminWithdraw}
                        </Button>
                      ) : l.passes ? (
                        <Button size="sm" onClick={() => void approve(l)} loading={rowBusy} disabled={busy !== null && !rowBusy}>
                          {t.peeAdminApprove}
                        </Button>
                      ) : null}
                    </div>
                  </footer>
                </article>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
