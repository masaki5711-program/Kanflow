"use client"

import { useEffect, useRef, useState } from "react"
import { Button, EmptyState, Select, SkeletonTable, useToast } from "@/components/ui"
import { apiFetch, useApiQuery } from "@/hooks"
import { localizeApiError } from "@/hooks/api-client"
import { fillTemplate } from "@/lib/fill-template"
import { useLanguage } from "@/lib/language-context"
import { bandText, daysText, FEEDBACK_KINDS, feedbackText, ratioText, type EvidenceLeaf, type EvidencePage, type FeedbackKind } from "./types"

const PAGE = 50

interface Props {
  projectId: string
  runId: string
}

/** Choose a kind, then send: a change of the select never submits by itself (keyboard arrows change it). */
function FeedbackCell({ projectId, runId, leaf }: { projectId: string; runId: string; leaf: EvidenceLeaf }) {
  const { t } = useLanguage()
  const toast = useToast()
  const [kind, setKind] = useState<FeedbackKind | "">("")
  const [given, setGiven] = useState<FeedbackKind | null>(null)
  const [busy, setBusy] = useState(false)

  async function send() {
    if (busy || !kind) return
    setBusy(true)
    try {
      await apiFetch(`/api/projects/${projectId}/plan/estimate-runs/${runId}/feedback`, { method: "POST", json: { key: leaf.key, kind } })
      setGiven(kind)
      toast.success(fillTemplate(t.pesFeedbackSentFor, { name: leaf.name, kind: feedbackText(t, kind) }))
    } catch (err) {
      toast.error(localizeApiError(err, t))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <Select selectSize="sm" aria-label={fillTemplate(t.pesFeedbackLabel, { name: leaf.name })} value={kind} onChange={(ev) => setKind(ev.target.value as FeedbackKind | "")}>
        <option value="">{t.pesFeedbackChoose}</option>
        {FEEDBACK_KINDS.map((k) => (
          <option key={k} value={k}>
            {feedbackText(t, k)}
          </option>
        ))}
      </Select>
      <Button size="sm" variant="secondary" aria-label={fillTemplate(t.pesFeedbackSendLabel, { name: leaf.name })} aria-disabled={busy || !kind || undefined} onClick={() => void send()}>
        {t.pesFeedbackSend}
      </Button>
      {given && <span className="w-full text-caption text-fg-muted">{fillTemplate(t.pesFeedbackGiven, { kind: feedbackText(t, given) })}</span>}
    </div>
  )
}

/**
 * 根拠 (plan 12 §3.2 / §3.6): per item the template's days, the revised days, the actual ratio (not shown when other
 * projects' actuals took effect and few sources are shown), the sources by name, other projects as a band, and
 * feedback. The server filters every page for this reader.
 */
export function EstimateEvidence({ projectId, runId }: Props) {
  const { t, language } = useLanguage()
  const [offset, setOffset] = useState(0)
  const page = useApiQuery<EvidencePage>(`/api/projects/${projectId}/plan/estimate-runs/${runId}/evidence?offset=${offset}`)
  // The previous page stays on screen while the next loads: the paging buttons never unmount under the user's focus.
  const [shown, setShown] = useState<EvidencePage | null>(null)
  // Adjust the shown page when new data arrives (state derived during render, not in an effect).
  if (page.data && page.data !== shown) setShown(page.data)
  const regionRef = useRef<HTMLDivElement>(null)
  const moved = useRef(false)
  useEffect(() => {
    if (shown && moved.current) {
      moved.current = false
      regionRef.current?.focus()
    }
  }, [shown])
  // A failed page load must not steal focus on a later, unrelated reload.
  useEffect(() => {
    if (page.error) moved.current = false
  }, [page.error])

  const go = (next: number) => {
    moved.current = true
    setOffset(next)
  }

  if (!shown) {
    if (page.error) return <EmptyState compact headingLevel={3} title={t.pesEvidenceFailed} action={<Button size="sm" onClick={() => void page.refetch()}>{t.errorRetry}</Button>} />
    return <SkeletonTable label={t.loading} />
  }
  if (shown.total === 0) return <p className="text-body text-fg-muted">{t.pesEvidenceEmpty}</p>
  const from = shown.offset + 1
  const to = shown.offset + shown.leaves.length
  const caption = fillTemplate(t.pesEvidenceCaption, { from, to, total: shown.total })

  return (
    <div className="space-y-3">
      {shown.stale && <p className="rounded-ui-md border border-warning bg-warning-soft px-3 py-2 text-body text-fg">{t.pesStale}</p>}
      {page.error && (
        <p role="alert" className="text-body text-danger">
          {t.pesEvidenceFailed}
        </p>
      )}
      <p className="sr-only" aria-live="polite">
        {caption}
      </p>
      <div ref={regionRef} className="overflow-x-auto rounded-ui-lg border border-border" role="region" aria-labelledby="pes-evidence-caption" tabIndex={0} aria-busy={page.isFetching || undefined}>
        <table className="w-full min-w-[48rem] text-body tabular-nums">
          <caption id="pes-evidence-caption" className="px-3 py-2 text-left text-caption text-fg-muted">
            {caption}
          </caption>
          <thead className="bg-surface-sunken text-left text-caption text-fg-muted">
            <tr>
              <th scope="col" className="px-3 py-2 font-medium">{t.pesColItem}</th>
              <th scope="col" className="px-3 py-2 font-medium">{t.pesColRole}</th>
              <th scope="col" className="px-3 py-2 text-right font-medium">{t.pesColTemplate}</th>
              <th scope="col" className="px-3 py-2 text-right font-medium">{t.pesColD50}</th>
              <th scope="col" className="px-3 py-2 text-right font-medium">{t.pesColD80}</th>
              <th scope="col" className="px-3 py-2 font-medium">{t.pesColRatio}</th>
              <th scope="col" className="px-3 py-2 font-medium">{t.pesColSources}</th>
              <th scope="col" className="px-3 py-2 font-medium">{t.pesColFeedback}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {shown.leaves.map((l) => {
              const e = l.estimate
              const note = l.reduced ? t.pesReduced : l.limited ? t.pesLimited : !e ? t.pesNoEstimate : null
              return (
                <tr key={l.key} className="align-top">
                  <th scope="row" className="px-3 py-2 text-left font-medium text-fg [overflow-wrap:anywhere]">
                    {l.name}
                    {l.addedByRule && <span className="mt-0.5 block text-caption font-normal text-fg-muted">{t.pesAddedByRule}</span>}
                  </th>
                  <td className="px-3 py-2 text-fg-muted">{l.role ?? t.pesNone}</td>
                  <td className="px-3 py-2 text-right">{l.templateDays === null ? <span className="text-caption text-fg-muted">{t.pesNotInTemplate}</span> : daysText(t, l.templateDays)}</td>
                  {note !== null || !e ? (
                    <td colSpan={4} className="px-3 py-2 text-fg-muted">
                      {note}
                    </td>
                  ) : (
                    <>
                      <td className="px-3 py-2 text-right font-semibold text-fg">{daysText(t, e.d50)}</td>
                      <td className="px-3 py-2 text-right">{daysText(t, e.d80)}</td>
                      <td className="px-3 py-2">{e.r50 === null ? <span className="text-caption text-fg-muted">{t.pesRatioHidden}</span> : ratioText(t, language, e.r50)}</td>
                      <td className="px-3 py-2 text-caption">
                        <ul className="space-y-0.5">
                          {e.sources.map((s, i) => (
                            <li key={`${s.projectName}-${i}`} className="[overflow-wrap:anywhere]">
                              {s.projectName}: {ratioText(t, language, s.ratio)}
                            </li>
                          ))}
                          {e.otherProjects && <li className="text-fg-muted">{fillTemplate(t.pesOtherProjects, { band: bandText(t, e.otherProjects) })}</li>}
                        </ul>
                      </td>
                    </>
                  )}
                  <td className="px-3 py-2">
                    <FeedbackCell projectId={projectId} runId={runId} leaf={l} />
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      {shown.total > PAGE && (
        <div className="flex gap-2">
          <Button size="sm" variant="secondary" aria-disabled={offset === 0 || undefined} onClick={() => offset > 0 && go(Math.max(0, offset - PAGE))}>
            {t.pesPrev}
          </Button>
          <Button size="sm" variant="secondary" aria-disabled={to >= shown.total || undefined} onClick={() => to < shown.total && go(offset + PAGE)}>
            {t.pesNext}
          </Button>
        </div>
      )}
    </div>
  )
}
