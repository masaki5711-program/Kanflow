"use client"

import { useState } from "react"
import { useLanguage } from "@/lib/language-context"
import { apiFetch, useApiQuery } from "@/hooks"
import { Button, useToast } from "@/components/ui"
import { GitMerge, TriangleAlert } from "lucide-react"
import { messageOf } from "../lib/errors"

interface Hint {
  kind: "start" | "complete" | "pipeline_failed" | "review_stale"
  action: "start" | "complete" | null
  pbItemId: string
  displayId: number
  title: string
  mr?: { ref: string; title: string; url: string; days?: number }
}

interface Insights {
  enabled: boolean
  hints: Hint[]
}

interface Props {
  projectId: string
  sprintId: string
  /** sprint.manage / task.write: without it the suggestions are read-only. */
  canAct: boolean
  /** Called after tasks were moved, so the sprint reloads. */
  onApplied: () => void
}

/**
 * What Git says about the running sprint: tasks to start or finish (one click)
 * and merge requests that need attention (failed pipeline, waiting too long).
 * Renders nothing when Git is off or there is nothing to suggest.
 */
export default function GitInsightsPanel({ projectId, sprintId, canAct, onApplied }: Props) {
  const { t } = useLanguage()
  const toast = useToast()
  const url = `/api/projects/${projectId}/sprints/${sprintId}/git`
  const { data, refetch } = useApiQuery<Insights>(url)
  const [busy, setBusy] = useState<string | null>(null)
  if (!data?.enabled || data.hints.length === 0) return null

  const text = (h: Hint): string => {
    const vars = { "{n}": String(h.displayId), "{title}": h.title, "{mr}": h.mr?.ref ?? "", "{days}": String(h.mr?.days ?? "") }
    const template = { start: t.sprintUxGitStart, complete: t.sprintUxGitComplete, pipeline_failed: t.sprintUxGitFailed, review_stale: t.sprintUxGitStale }[h.kind]
    return Object.entries(vars).reduce((s, [k, v]) => s.replaceAll(k, v), template)
  }

  async function apply(h: Hint) {
    if (!h.action) return
    const key = `${h.pbItemId}:${h.action}`
    setBusy(key)
    try {
      const out = await apiFetch<{ updated: number }>(url, { method: "POST", json: { pbItemId: h.pbItemId, action: h.action } })
      toast.success(t.sprintUxGitApplied.replace("{n}", String(out.updated)))
      onApplied()
      refetch()
    } catch (err) {
      toast.error(messageOf(err, t.error))
    } finally {
      setBusy(null)
    }
  }

  return (
    <section aria-label={t.sprintUxGitTitle} className="border-t border-border bg-info-soft/40 px-6 py-3">
      <h3 className="mb-2 flex items-center gap-1.5 text-caption font-semibold text-fg-muted">
        <GitMerge aria-hidden className="h-4 w-4" />
        {t.sprintUxGitTitle}
      </h3>
      <ul className="space-y-1.5">
        {data.hints.map((h) => (
          <li key={`${h.pbItemId}:${h.kind}:${h.mr?.ref ?? ""}`} className="flex flex-wrap items-center gap-x-3 gap-y-1 text-body text-fg">
            {h.action === null && <TriangleAlert aria-hidden className="h-4 w-4 shrink-0 text-warning" />}
            <span className="min-w-0 flex-1">
              {text(h)}
              {h.mr?.url && (
                <a href={h.mr.url} target="_blank" rel="noopener noreferrer" className="ml-2 text-primary underline">!{h.mr.ref}</a>
              )}
            </span>
            {h.action && canAct && (
              <Button size="sm" variant="secondary" loading={busy === `${h.pbItemId}:${h.action}`} onClick={() => void apply(h)}>
                {h.action === "start" ? t.sprintUxGitStartAction : t.sprintUxGitCompleteAction}
              </Button>
            )}
          </li>
        ))}
      </ul>
    </section>
  )
}
