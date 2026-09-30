"use client"

import { useId, useState } from "react"
import Link from "next/link"
import { Button, useToast } from "@/components/ui"
import { apiFetch } from "@/hooks"
import { useLanguage } from "@/lib/language-context"

interface ProgressEditorProps {
  projectId: string
  initialProgress: number
  canEdit: boolean
  /** "計画進捗": master-plan rollup (planOverallProgress), null without a plan; undefined hides the row. */
  planProgressPct?: number | null
}

const clampPct = (n: number) => Math.min(100, Math.max(0, n))

/**
 * Manual project progress (0–100 %) maintained by the PO, with the computed
 * plan progress beside it — each clearly labelled so a reader never mistakes
 * one for the other (A3-13).
 */
export function ProgressEditor({ projectId, initialProgress, canEdit, planProgressPct }: ProgressEditorProps) {
  const { t } = useLanguage()
  const toast = useToast()
  const labelId = useId()
  const [progress, setProgress] = useState(initialProgress)
  const [draft, setDraft] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const editing = draft !== null && canEdit
  const shown = clampPct(editing ? Number(draft) || 0 : progress)

  async function save() {
    if (draft === null) return
    const parsed = clampPct(Math.round(Number(draft)))
    if (Number.isNaN(parsed)) { setDraft(null); return }
    setSaving(true)
    try {
      await apiFetch(`/api/projects/${projectId}`, { method: "PATCH", json: { progressPct: parsed } })
      setProgress(parsed)
      // Inline edit: the new value replaces the editor in place, so no success toast.
      setDraft(null)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t.errorUpdateFailed, { title: t.errorUpdateFailed })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="mb-5 bg-success-soft/60 border border-success/20 rounded-ui-md p-4">
      <div className="flex flex-wrap items-center justify-between mb-2 gap-3">
        <div className="flex items-center gap-2 flex-1">
          <span id={labelId} className="text-body font-semibold text-success">{t.projectProgress}</span>
          <span className="text-caption text-success-strong">{t.dashboardProgressSetByPo}</span>
        </div>
        {editing ? (
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="range"
              min={0}
              max={100}
              step={1}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              aria-labelledby={labelId}
              className="w-40 accent-green-700"
            />
            <input
              type="number"
              min={0}
              max={100}
              step={1}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              aria-label={t.dashboardProgressPercent}
              className="w-16 min-h-8 px-2 py-1 text-body border border-border-strong rounded-ui-sm text-success font-semibold text-right bg-surface"
            />
            <span aria-hidden="true" className="text-body text-success font-semibold">%</span>
            <Button size="sm" loading={saving} onClick={save}>{t.save}</Button>
            <Button size="sm" variant="ghost" onClick={() => setDraft(null)}>{t.cancel}</Button>
          </div>
        ) : canEdit ? (
          <button
            type="button"
            onClick={() => setDraft(String(progress))}
            className="text-2xl font-bold text-success-strong hover:bg-success-soft px-2 py-0.5 rounded-ui-sm"
            title={t.dashboardProgressEditHint}
            aria-label={`${t.projectProgress}: ${clampPct(progress)}% — ${t.dashboardProgressEditHint}`}
          >
            {clampPct(progress)}<span className="text-body">%</span>
          </button>
        ) : (
          <span className="text-2xl font-bold text-success px-2 py-0.5">
            {clampPct(progress)}<span className="text-body">%</span>
          </span>
        )}
      </div>
      <div
        role="progressbar"
        aria-labelledby={labelId}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={shown}
        className="w-full bg-surface/70 rounded-full h-2.5 overflow-hidden ring-1 ring-success/20"
      >
        <div className="h-full bg-green-600 rounded-full transition-[width] duration-700" style={{ width: `${shown}%` }} />
      </div>
      {planProgressPct !== undefined && <PlanProgressLine projectId={projectId} pct={planProgressPct} />}
    </div>
  )
}

/** The master plan's own progress (same number as the portfolio's 計画進捗 column). */
function PlanProgressLine({ projectId, pct }: { projectId: string; pct: number | null }) {
  const { t } = useLanguage()
  return (
    <p data-testid="dashboard-plan-progress" className="mt-3 flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-body">
      <Link href={`/projects/${projectId}/plan`} className="font-semibold text-fg hover:text-primary hover:underline">
        {t.dashboardPlanProgress}
      </Link>
      <span className="font-semibold tabular-nums text-fg">{pct === null ? t.dashboardPlanProgressNone : `${pct}%`}</span>
      <span className="text-caption text-fg-muted">{t.dashboardPlanProgressHint}</span>
    </p>
  )
}
