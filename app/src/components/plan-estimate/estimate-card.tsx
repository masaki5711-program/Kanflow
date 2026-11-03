"use client"

import { useState } from "react"
import { Button, useToast } from "@/components/ui"
import { apiFetch } from "@/hooks"
import { isApiError, localizeApiError } from "@/hooks/api-client"
import { fillTemplate } from "@/lib/fill-template"
import { formatDateTime, formatLongDate } from "@/lib/format-date"
import { useLanguage } from "@/lib/language-context"
import { bandText, daysText, gateReasonText, percentText, type RunCard, type UsageRow } from "./types"

interface Props {
  projectId: string
  card: RunCard
  evidenceOpen: boolean
  onToggleEvidence: () => void
  onLoaded: () => void
  /** The server refused the run as stale: reload the card so its notice and state are current. */
  onStale: () => void
}

function UsageList({ rows, empty }: { rows: UsageRow[]; empty: string }) {
  const { t } = useLanguage()
  if (rows.length === 0) return <p className="text-fg">{empty}</p>
  return (
    <ul className="space-y-0.5 tabular-nums text-fg">
      {rows.map((u) => (
        <li key={u.userId}>
          {u.name}: {percentText(t, u.maxUtilization)}
        </li>
      ))}
    </ul>
  )
}

/**
 * The card of an estimate run (plan 12 §3.6): end dates, data volume, rules, the largest changes, the proposed owners
 * (only with plan.viewMemberLoad; remove only), expiry / staleness, and the two actions.
 */
export function EstimateCard({ projectId, card, evidenceOpen, onToggleEvidence, onLoaded, onStale }: Props) {
  const { t, language } = useLanguage()
  const toast = useToast()
  const [removed, setRemoved] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState(false)
  const s = card.summary
  const day = (k: string) => formatLongDate(k, language, { utc: true })
  const blocked = card.expired || card.stale
  const notice = card.expired ? t.pesExpired : card.stale ? t.pesStale : ""
  const plan = card.ownerPlan
  const names = new Map((plan?.after ?? []).concat(plan?.before ?? []).map((u) => [u.userId, u.name]))
  const owners = plan ? Object.entries(plan.owners).filter(([, u]) => u !== null) : []

  async function load() {
    if (busy || blocked) return
    setBusy(true)
    try {
      await apiFetch(`/api/projects/${projectId}/plan/load`, { method: "POST", json: { estimateRunId: card.runId, removedOwnerKeys: [...removed] } })
      toast.success(t.pesLoaded)
      onLoaded()
    } catch (err) {
      toast.error(localizeApiError(err, t))
      if (isApiError(err) && err.code === "PLAN_ESTIMATE_STALE") onStale()
    } finally {
      setBusy(false)
    }
  }

  const ends: [string, string][] = [
    [t.pesEndTemplate, day(s.templateEnd)],
    [t.pesEndP50, day(s.p50End)],
    [t.pesEndP80, day(s.p80End)],
    [t.pesEndPlanned, day(s.plannedEnd)],
  ]
  const more = s.changesTotal - s.changes.length - card.changesWithheld

  return (
    <section aria-labelledby="pes-card-title" className="space-y-4 rounded-ui-lg border border-border bg-surface p-4 shadow-ui-sm sm:p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="pes-card-title" tabIndex={-1} className="text-title font-semibold text-fg focus-visible:outline-none">
          {t.pesCardTitle}
        </h2>
        <p className="text-caption text-fg-muted">{fillTemplate(t.pesExpires, { at: formatDateTime(card.expiresAt, language) })}</p>
      </div>

      {/* Always present, so a notice that appears after a reload is announced. */}
      <div id="pes-card-status" role="status" className={notice ? "rounded-ui-md border border-warning bg-warning-soft px-3 py-2 text-body text-fg" : "sr-only"}>
        {notice}
      </div>
      {!s.gateOn && s.gateReason && <p className="rounded-ui-md bg-surface-sunken px-3 py-2 text-body text-fg">{fillTemplate(t.pesGateOff, { reason: gateReasonText(t, s.gateReason) })}</p>}

      <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-4">
        {ends.map(([label, value], i) => (
          <div key={label} className={i === 3 ? "rounded-ui-md bg-primary-soft px-3 py-2" : "px-3 py-2"}>
            <dt className="text-caption text-fg-muted">{label}</dt>
            <dd className={i === 3 ? "text-title font-semibold text-fg" : "text-body font-medium text-fg"}>{value}</dd>
          </div>
        ))}
      </dl>
      <ul className="space-y-1 text-caption text-fg-muted">
        {s.bufferDays > 0 && <li>{fillTemplate(t.pesBuffer, { days: daysText(t, s.bufferDays) })}</li>}
        <li>{!s.gateOn ? t.pesDataNotUsed : s.matchedProjects ? fillTemplate(t.pesDataLine, { band: bandText(t, s.matchedProjects) }) : t.pesDataNone}</li>
        <li>{fillTemplate(t.pesRulesLine, { applied: s.rulesApplied, rejected: s.rulesRejected })}</li>
      </ul>

      <div className="space-y-2">
        <h3 className="text-body font-semibold text-fg">{t.pesChangesTitle}</h3>
        {s.changes.length === 0 ? (
          <p className="text-body text-fg-muted">{t.pesChangesEmpty}</p>
        ) : (
          <ul className="divide-y divide-border rounded-ui-lg border border-border text-body tabular-nums">
            {s.changes.map((c) => (
              <li key={c.key} className="px-3 py-2 [overflow-wrap:anywhere]">
                {fillTemplate(t.pesChangeRow, { name: c.name, from: c.templateDays === null ? t.pesNotInTemplate : daysText(t, c.templateDays), to: daysText(t, c.days) })}
              </li>
            ))}
          </ul>
        )}
        {more > 0 && <p className="text-caption text-fg-muted">{fillTemplate(t.pesChangesMore, { n: more })}</p>}
        {card.changesWithheld > 0 && <p className="text-caption text-fg-muted">{fillTemplate(t.pesChangesWithheld, { n: card.changesWithheld })}</p>}
      </div>

      {plan ? (
        owners.length > 0 && (
          <div className="space-y-2">
            <h3 className="text-body font-semibold text-fg">{t.pesOwnersTitle}</h3>
            <p className="text-caption text-fg-muted">{t.pesOwnersHint}</p>
            <ul className="divide-y divide-border rounded-ui-lg border border-border text-body">
              {owners.map(([key, userId]) => {
                const isRemoved = removed.has(key)
                const label = plan.names[key] ?? key
                return (
                  <li key={key} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                    <span className="min-w-0 [overflow-wrap:anywhere]">
                      <span className="font-medium text-fg">{label}</span>
                      <span className="ml-2 text-fg-muted">{!userId ? t.pesOwnerNone : isRemoved ? t.pesOwnerWillBeRemoved : (names.get(userId) ?? t.pesOwnerNone)}</span>
                    </span>
                    {userId && (
                      <Button
                        size="sm"
                        variant="ghost"
                        aria-label={fillTemplate(isRemoved ? t.pesOwnerRestoreLabel : t.pesOwnerRemoveLabel, { name: label })}
                        onClick={() =>
                          setRemoved((prev) => {
                            const next = new Set(prev)
                            if (next.has(key)) next.delete(key)
                            else next.add(key)
                            return next
                          })
                        }
                      >
                        {isRemoved ? t.pesOwnerRestore : t.pesOwnerRemove}
                      </Button>
                    )}
                  </li>
                )
              })}
            </ul>
            <dl className="grid gap-2 text-caption text-fg-muted sm:grid-cols-2">
              <div>
                <dt>{t.pesUtilBefore}</dt>
                <dd>
                  <UsageList rows={plan.before} empty={t.pesNone} />
                </dd>
              </div>
              <div>
                <dt>{t.pesUtilAfter}</dt>
                <dd>
                  <UsageList rows={plan.after} empty={t.pesNone} />
                </dd>
              </div>
            </dl>
          </div>
        )
      ) : (
        <p className="text-caption text-fg-muted">{t.pesOwnersNotShown}</p>
      )}

      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" aria-expanded={evidenceOpen} {...(evidenceOpen ? { "aria-controls": "pes-evidence" } : {})} onClick={onToggleEvidence}>
          {t.pesShowEvidence}
        </Button>
        <Button aria-disabled={busy || blocked || undefined} aria-describedby={blocked ? "pes-card-status" : undefined} onClick={() => void load()}>
          {busy ? t.pesLoading : t.pesLoad}
        </Button>
      </div>
    </section>
  )
}
