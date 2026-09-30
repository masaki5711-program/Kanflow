"use client"

import { useState } from "react"
import { Button, Select, useConfirm } from "@/components/ui"
import { useApiQuery } from "@/hooks"
import { useLanguage } from "@/lib/language-context"
import { pickText } from "@/lib/translation/pick-text"
import type { SprintTimelineDto } from "@/types/api"
import type { BulkRequest } from "./use-bulk-actions"
import type { BacklogStatus, ProjectMember } from "./types"
import { Trash2, X } from "lucide-react"

type SprintOption = Pick<SprintTimelineDto, "id" | "sprintName" | "status" | "i18n">

const OPEN_SPRINT_STATUSES = new Set(["planning", "active"])

interface Props {
  projectId: string
  count: number
  busy: boolean
  canEdit: boolean
  canDelete: boolean
  members: readonly ProjectMember[]
  onApply: (request: BulkRequest) => void
  onSelectAll: () => void
  onClear: () => void
}

/** Sticky bar of the selection mode: status / sprint / PO / trash for the selected PBIs. */
export function BulkActionBar({ projectId, count, busy, canEdit, canDelete, members, onApply, onSelectAll, onClear }: Props) {
  const { t, pt, language } = useLanguage()
  const confirm = useConfirm()
  const [status, setStatus] = useState<BacklogStatus>("ready")
  const [sprintId, setSprintId] = useState("")
  const [po, setPo] = useState("")
  const sprints = useApiQuery<SprintOption[]>(canEdit ? `/api/projects/${projectId}/sprints` : null, { toastOnError: true })
  const openSprints = (sprints.data ?? []).filter((s) => OPEN_SPRINT_STATUSES.has(s.status))
  const names = [...new Set(members.map((m) => m.user.name).filter((n): n is string => !!n))].sort((a, b) => a.localeCompare(b))
  const disabled = count === 0 || busy

  async function trash() {
    const ok = await confirm({
      message: t.backlogBulkTrashConfirm.replace("{count}", String(count)),
      confirmLabel: t.trashMoveToTrash,
      cancelLabel: t.cancel,
      variant: "danger",
    })
    if (ok) onApply({ action: "trash" })
  }

  return (
    <div
      role="region"
      aria-label={t.backlogBulkActionsLabel}
      className="sticky bottom-4 z-20 mt-4 flex flex-wrap items-center gap-2 rounded-ui-lg border border-border-strong bg-surface p-3 shadow-ui-lg"
    >
      <p className="mr-2 flex flex-wrap items-baseline gap-2">
        <span className="text-body font-semibold text-fg" aria-live="polite">
          {t.backlogSelectedCount.replace("{count}", String(count))}
        </span>
        <span className="text-caption text-fg-muted">{t.backlogSelectHint}</span>
      </p>
      <Button variant="ghost" size="sm" onClick={onSelectAll}>
        {t.backlogSelectAllVisible}
      </Button>
      <Button variant="ghost" size="sm" onClick={onClear} disabled={count === 0} leftIcon={<X className="h-4 w-4" />}>
        {t.backlogClearSelection}
      </Button>
      {canEdit && (
        <>
          <span className="mx-1 hidden h-6 w-px bg-border sm:block" aria-hidden="true" />
          <Select selectSize="sm" aria-label={t.backlogBulkStatus} value={status} onChange={(e) => setStatus(e.target.value as BacklogStatus)} className="w-auto">
            <option value="not_ready">{t.backlogStatusNotReady}</option>
            <option value="ready">{t.backlogStatusReady}</option>
            <option value="completed">{t.backlogStatusCompleted}</option>
          </Select>
          <Button size="sm" variant="secondary" disabled={disabled} onClick={() => onApply({ action: "status", payload: { status } })}>
            {t.backlogBulkStatus}
          </Button>

          <Select selectSize="sm" aria-label={t.backlogBulkChooseSprint} value={sprintId} onChange={(e) => setSprintId(e.target.value)} className="w-auto">
            <option value="">{openSprints.length ? t.backlogBulkChooseSprint : t.backlogBulkNoSprint}</option>
            {openSprints.map((s) => (
              <option key={s.id} value={s.id}>
                {pickText(s.i18n, "sprintName", s.sprintName, language).text}
              </option>
            ))}
          </Select>
          <Button size="sm" variant="secondary" disabled={disabled || !sprintId} onClick={() => onApply({ action: "addToSprint", payload: { sprintId } })}>
            {t.backlogBulkAddToSprint}
          </Button>

          <Select selectSize="sm" aria-label={pt.rolePO} value={po} onChange={(e) => setPo(e.target.value)} className="w-auto">
            <option value="">{t.backlogBulkUnassigned}</option>
            {names.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </Select>
          <Button size="sm" variant="secondary" disabled={disabled} onClick={() => onApply({ action: "assignPo", payload: { assignedPo: po || null } })}>
            {t.backlogBulkAssignPo.replace("{po}", pt.rolePO)}
          </Button>
        </>
      )}
      {canDelete && (
        <Button size="sm" variant="danger" className="ml-auto" disabled={disabled} onClick={() => void trash()} leftIcon={<Trash2 className="h-4 w-4" />}>
          {t.trashMoveToTrash}
        </Button>
      )}
    </div>
  )
}
