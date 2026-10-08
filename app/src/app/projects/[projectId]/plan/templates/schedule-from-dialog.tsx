"use client"

import { useState } from "react"
import { Button, Field, Input, Modal, useToast } from "@/components/ui"
import { apiFetch } from "@/hooks"
import { fillTemplate } from "@/lib/fill-template"
import { useLanguage } from "@/lib/language-context"
import { isYmd } from "../lib/date"
import { WeekendOption } from "./weekend-option"

interface Props {
  projectId: string
  /** Subtrees to place (a load's createdRootIds); null = the whole plan. */
  rootIds: readonly string[] | null
  defaultStart: string
  onClose: () => void
  onDone: () => void
}

/** 「開始日を入れて日程を仮置き」: one date input → POST /plan/schedule-from. */
export function ScheduleFromDialog({ projectId, rootIds, defaultStart, onClose, onDone }: Props) {
  const { t } = useLanguage()
  const toast = useToast()
  const [start, setStart] = useState(defaultStart)
  const [skipWeekends, setSkipWeekends] = useState(false)
  const [busy, setBusy] = useState(false)
  const valid = isYmd(start)

  async function submit() {
    if (!valid) return
    setBusy(true)
    try {
      const res = await apiFetch<{ updated: number }>(`/api/projects/${projectId}/plan/schedule-from`, {
        method: "POST",
        json: { startDate: start, skipWeekends, ...(rootIds && { rootIds }) },
      })
      toast.success(fillTemplate(t.tplScheduled, { n: res.updated }))
      onDone()
    } catch (err) {
      toast.error(err instanceof Error && err.message ? err.message : t.tplScheduleFailed, { title: t.tplScheduleFailed })
      setBusy(false)
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      size="sm"
      title={t.tplScheduleTitle}
      description={t.tplScheduleDesc}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>{t.tplScheduleSkip}</Button>
          <Button onClick={() => void submit()} disabled={!valid} loading={busy} data-testid="tpl-schedule-submit">
            {t.tplScheduleSubmit}
          </Button>
        </>
      }
    >
      <Field label={t.tplScheduleStart} required error={valid ? undefined : t.planDateRequired}>
        <Input type="date" value={start} onChange={(e) => setStart(e.target.value)} data-autofocus />
      </Field>
      <div className="mt-3">
        <WeekendOption checked={skipWeekends} onChange={setSkipWeekends} />
      </div>
    </Modal>
  )
}
