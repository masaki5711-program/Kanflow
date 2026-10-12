"use client"

import { useState } from "react"
import { Button, Modal, useToast } from "@/components/ui"
import { apiFetch } from "@/hooks"
import { useLanguage } from "@/lib/language-context"
import { useBusinessDays } from "../hooks/use-business-days"
import { useSchedulePreview } from "../hooks/use-schedule-preview"
import type { ScheduleResult } from "../lib/schedule-api"
import { fillTemplate } from "../lib/template"
import { PlanMovePreview } from "./plan-move-preview"

interface Props {
  /** `/api/projects/:id/plan` */
  apiBase: string
  onClose: () => void
  onApplied: () => void
}

/** 依存関係に合わせて再計算: push every follower that starts too early, preview first. */
export function PlanReflowDialog({ apiBase, onClose, onApplied }: Props) {
  const { t } = useLanguage()
  const toast = useToast()
  const [business, setBusiness] = useBusinessDays()
  const [busy, setBusy] = useState(false)
  const url = `${apiBase}/reflow`
  const preview = useSchedulePreview<ScheduleResult>(url, { apply: false, businessDays: business })
  const count = preview.data?.moved.length ?? 0

  async function apply() {
    setBusy(true)
    try {
      const res = await apiFetch<ScheduleResult>(url, { method: "POST", json: { apply: true, businessDays: business } })
      toast.success(fillTemplate(t.pscReflowDone, { n: res.moved.length }))
      onApplied()
    } catch (err) {
      toast.error(err instanceof Error && err.message ? err.message : t.pscReflowFailed, { title: t.pscReflowFailed })
      setBusy(false)
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      size="md"
      title={t.pscReflowTitle}
      description={t.pscReflowDesc}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>{t.cancel}</Button>
          <Button onClick={() => void apply()} disabled={count === 0 || preview.loading || preview.failed} loading={busy} data-testid="plan-reflow-apply">
            {t.pscReflowApply}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <label className="inline-flex min-h-8 items-center gap-2 text-body text-fg">
          <input type="checkbox" className="h-4 w-4" checked={business} onChange={(e) => setBusiness(e.target.checked)} />
          {t.pscReflowBusiness}
        </label>
        <PlanMovePreview
          result={preview.data}
          failed={preview.failed}
          loading={preview.loading}
          summary={(n) => fillTemplate(t.pscReflowPreview, { n })}
          emptyText={t.pscReflowNone}
        />
      </div>
    </Modal>
  )
}
