"use client"

import { useId, useState } from "react"
import { useLanguage } from "@/lib/language-context"
import { Badge, DisclosureChevron, Field, Input, Select, Textarea } from "@/components/ui"
import type { PbiDetailState } from "../hooks/use-pbi-detail"
interface Props {
  pbi: PbiDetailState
  canEdit: boolean
}

/**
 * Collapsible full-PBI panel inside the task modal. PO/SM/admin can edit the
 * PBI inline; edits are saved together with the task.
 */
export default function TaskPbiDetailPanel({ pbi, canEdit }: Props) {
  const { t, pt } = useLanguage()
  const [expanded, setExpanded] = useState(false)
  const bodyId = useId()
  const { detail, update, isDirty, isSaving } = pbi
  if (!detail) return null
  const readOnly = !canEdit

  return (
    <div className="rounded-ui-sm border border-primary/30 bg-primary-soft/30">
      <button type="button" onClick={() => setExpanded((v) => !v)} aria-expanded={expanded} aria-controls={bodyId}
        className="w-full min-h-9 px-3 py-2 flex items-center justify-between gap-2 text-caption font-semibold text-primary-active hover:bg-primary-soft/60">
        <span className="inline-flex items-center gap-1.5">
          <DisclosureChevron open={expanded} className="w-3.5 h-3.5" />
          {t.sprintTaskPbiDetail} ({canEdit ? t.sprintTaskPbiEditable : t.sprintTaskPbiReadOnly})
        </span>
        {isDirty && <Badge tone="warning" dot>{t.sprintTaskPbiUnsaved}</Badge>}
      </button>
      {expanded && (
        <div id={bodyId} className="px-3 py-3 space-y-3 bg-surface border-t border-primary/20">
          <Field label={pt.backlogInitiative}>
            <Input inputSize="sm" value={detail.initiative ?? ""} readOnly={readOnly}
              onChange={(e) => update({ initiative: e.target.value })} />
          </Field>
          <Field label={pt.backlogEpic}>
            <Input inputSize="sm" value={detail.epic ?? ""} readOnly={readOnly} onChange={(e) => update({ epic: e.target.value })} />
          </Field>
          <Field label={pt.backlogUserStory}>
            <Textarea rows={4} value={detail.userStory ?? ""} readOnly={readOnly}
              onChange={(e) => update({ userStory: e.target.value })} />
          </Field>
          <Field label={pt.backlogAcceptanceCriteria}>
            <Textarea rows={6} className="min-h-[120px]" value={detail.acceptanceCriteria ?? ""} readOnly={readOnly}
              onChange={(e) => update({ acceptanceCriteria: e.target.value })} />
          </Field>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <Field label={pt.backlogWorkloadScore}>
              <Input inputSize="sm" type="number" min={0} step={1} value={String(detail.workloadScore)} readOnly={readOnly}
                onChange={(e) => update({ workloadScore: parseInt(e.target.value || "0", 10) })} />
            </Field>
            <Field label={pt.rolePO}>
              <Input inputSize="sm" value={detail.assignedPo ?? ""} readOnly={readOnly}
                onChange={(e) => update({ assignedPo: e.target.value })} />
            </Field>
            <Field label={t.sprintStatus}>
              <Select selectSize="sm" value={detail.status} disabled={readOnly} onChange={(e) => update({ status: e.target.value })}>
                <option value="not_ready">{t.backlogStatusNotReady}</option>
                <option value="ready">{t.backlogStatusReady}</option>
                <option value="completed">{t.backlogStatusCompleted}</option>
              </Select>
            </Field>
          </div>
          {isSaving && <p className="text-caption text-primary" role="status">{t.saving}</p>}
        </div>
      )}
    </div>
  )
}
