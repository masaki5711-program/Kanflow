"use client"

import { useState } from "react"
import { Button, Field, Input, Modal, Select, useToast } from "@/components/ui"
import { apiFetch } from "@/hooks"
import { useLanguage } from "@/lib/language-context"
import { useBusinessDays } from "../hooks/use-business-days"
import { useSchedulePreview } from "../hooks/use-schedule-preview"
import { isYmd } from "../lib/date"
import { PLAN_STATUSES, type PlanStatus, type Ymd } from "../lib/plan-types"
import type { BulkOp, BulkTarget, ScheduleResult } from "../lib/schedule-api"
import { statusLabel } from "../lib/status"
import { fillTemplate } from "../lib/template"
import { PlanDateField } from "./plan-date-field"
import { PlanMovePreview } from "./plan-move-preview"

export type BulkMode = "shift" | "shiftFrom" | "owner" | "status"

interface Props {
  /** `/api/projects/:id/plan` */
  apiBase: string
  mode: BulkMode
  /** The checked rows (ignored by "shiftFrom"). */
  ids: readonly string[]
  today: Ymd
  members: readonly { id: string; name: string }[]
  onClose: () => void
  onApplied: () => void
}

const DEFAULT_SHIFT_DAYS = 7

function titleOf(t: ReturnType<typeof useLanguage>["t"], mode: BulkMode): string {
  switch (mode) {
    case "shift": return t.pscBulkShift
    case "shiftFrom": return t.pscShiftFromTitle
    case "owner": return t.pscBulkOwner
    default: return t.pscBulkStatus
  }
}

/** Bulk edit of the checked rows (shift / owner / status) or of everything from a date (shiftFrom). */
export function PlanBulkDialog({ apiBase, mode, ids, today, members, onClose, onApplied }: Props) {
  const { t } = useLanguage()
  const toast = useToast()
  const [business, setBusiness] = useBusinessDays()
  const [days, setDays] = useState(String(DEFAULT_SHIFT_DAYS))
  const [fromDate, setFromDate] = useState<string>(today)
  const [ownerId, setOwnerId] = useState("")
  const [status, setStatus] = useState<PlanStatus>("in_progress")
  const [busy, setBusy] = useState(false)
  const url = `${apiBase}/bulk`

  const dayCount = Number(days)
  const shifting = mode === "shift" || mode === "shiftFrom"
  const validShift = shifting && Number.isInteger(dayCount) && dayCount !== 0 && Math.abs(dayCount) <= 3650 && (mode === "shift" || isYmd(fromDate))
  const target: BulkTarget = mode === "shiftFrom" ? { fromDate } : { ids: [...ids] }
  const op: BulkOp =
    shifting ? { type: "shift", days: dayCount, businessDays: business }
      : mode === "owner" ? { type: "owner", ownerId: ownerId || null }
        : { type: "status", status }

  const preview = useSchedulePreview<ScheduleResult>(url, { target, op, apply: false }, validShift)
  const movable = shifting ? (preview.data?.moved.length ?? 0) : ids.length
  // Never apply against a preview that belongs to older inputs.
  const canApply = shifting ? validShift && movable > 0 && !preview.loading && !preview.failed : ids.length > 0

  async function apply() {
    setBusy(true)
    try {
      const res = await apiFetch<ScheduleResult>(url, { method: "POST", json: { target, op, apply: true } })
      toast.success(fillTemplate(t.pscBulkDone, { n: res.updated ?? res.moved.length }))
      onApplied()
    } catch (err) {
      toast.error(err instanceof Error && err.message ? err.message : t.pscBulkFailed, { title: t.pscBulkFailed })
      setBusy(false)
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      size="md"
      title={titleOf(t, mode)}
      description={mode === "shiftFrom" ? t.pscShiftFromDesc : fillTemplate(t.pscSelectedCount, { n: ids.length })}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>{t.cancel}</Button>
          <Button onClick={() => void apply()} disabled={!canApply} loading={busy} data-testid="plan-bulk-apply">
            {t.pscBulkApply}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {mode === "shiftFrom" && (
          <Field label={t.pscShiftFromDate}>
            <PlanDateField value={fromDate} onChange={setFromDate} today={today} />
          </Field>
        )}
        {shifting && (
          <>
            <Field label={t.pscBulkDays}>
              <Input type="number" className="w-28" step={1} min={-3650} max={3650} value={days} onChange={(e) => setDays(e.target.value)} data-autofocus />
            </Field>
            <label className="inline-flex min-h-8 items-center gap-2 text-body text-fg">
              <input type="checkbox" className="h-4 w-4" checked={business} onChange={(e) => setBusiness(e.target.checked)} />
              {t.pscBulkBusiness}
            </label>
            {validShift && (
              <PlanMovePreview
                result={preview.data}
                failed={preview.failed}
                loading={preview.loading}
                summary={(n) => fillTemplate(t.pscBulkPreview, { n })}
                emptyText={t.pscBulkNone}
              />
            )}
          </>
        )}
        {mode === "owner" && (
          <Field label={t.pscBulkSetOwner}>
            <Select value={ownerId} onChange={(e) => setOwnerId(e.target.value)}>
              <option value="">{t.planOwnerNone}</option>
              {members.map((m) => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </Select>
          </Field>
        )}
        {mode === "status" && (
          <Field label={t.pscBulkSetStatus}>
            <Select value={status} onChange={(e) => setStatus(e.target.value as PlanStatus)}>
              {PLAN_STATUSES.map((s) => (
                <option key={s} value={s}>{statusLabel(t, s)}</option>
              ))}
            </Select>
          </Field>
        )}
      </div>
    </Modal>
  )
}
