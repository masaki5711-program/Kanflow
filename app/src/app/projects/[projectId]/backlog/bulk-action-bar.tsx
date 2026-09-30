"use client"

import { useState, type ReactNode } from "react"
import { Button, Select, useConfirm } from "@/components/ui"
import { PlanLeafOptionList, usePlanLeafOptions } from "@/components/pbi-form/pbi-plan-field"
import { useApiQuery } from "@/hooks"
import { useLanguage } from "@/lib/language-context"
import { pickText } from "@/lib/translation/pick-text"
import type { SprintTimelineDto } from "@/types/api"
import type { BulkRequest } from "./use-bulk-actions"
import type { BacklogStatus, ProjectMember } from "./types"
import { Trash2, X } from "lucide-react"

type SprintOption = Pick<SprintTimelineDto, "id" | "sprintName" | "status" | "i18n">

const OPEN_SPRINT_STATUSES = new Set(["planning", "active"])

/** Select value meaning "clear the field" (an explicit choice, never the default). */
export const BULK_CLEAR = "__clear"

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

/** Names offered for "assign PO": the project's POs (all members when the project has none). */
export function poCandidates(members: readonly ProjectMember[]): string[] {
  const named = (list: readonly ProjectMember[]) => list.map((m) => m.user.name).filter((n): n is string => !!n)
  const pos = named(members.filter((m) => m.role === "po"))
  return [...new Set(pos.length > 0 ? pos : named(members))].sort((a, b) => a.localeCompare(b))
}

/** A select and its button kept on one line (the bar wraps between groups, not inside one). */
function Group({ children }: { children: ReactNode }) {
  return <span className="inline-flex flex-nowrap items-center gap-2">{children}</span>
}

/** Sticky bar of the selection mode: status / sprint / PO / master plan / trash for the selected PBIs. */
export function BulkActionBar({ projectId, count, busy, canEdit, canDelete, members, onApply, onSelectAll, onClear }: Props) {
  const { t } = useLanguage()
  const confirm = useConfirm()
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

  /** Clearing a field on many PBIs asks first. */
  function confirmClear(message: string): Promise<boolean> {
    return confirm({ message, confirmLabel: t.backlogBulkClearConfirmLabel, cancelLabel: t.cancel, variant: "warning" })
  }

  const controls = { projectId, count, disabled, onApply, confirmClear }
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
          <StatusControl {...controls} />
          <SprintControl {...controls} />
          <PoControl {...controls} members={members} />
          <PlanControl {...controls} />
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

interface ControlProps {
  projectId: string
  count: number
  disabled: boolean
  onApply: (request: BulkRequest) => void
  confirmClear: (message: string) => Promise<boolean>
}

function StatusControl({ disabled, onApply }: ControlProps) {
  const { t } = useLanguage()
  const [status, setStatus] = useState<BacklogStatus>("ready")
  return (
    <Group>
      <Select selectSize="sm" aria-label={t.backlogBulkStatus} value={status} onChange={(e) => setStatus(e.target.value as BacklogStatus)} className="w-auto">
        <option value="not_ready">{t.backlogStatusNotReady}</option>
        <option value="ready">{t.backlogStatusReady}</option>
        <option value="completed">{t.backlogStatusCompleted}</option>
      </Select>
      <Button size="sm" variant="secondary" disabled={disabled} onClick={() => onApply({ action: "status", payload: { status } })}>
        {t.backlogBulkStatus}
      </Button>
    </Group>
  )
}

function SprintControl({ projectId, disabled, onApply }: ControlProps) {
  const { t, language } = useLanguage()
  const [sprintId, setSprintId] = useState("")
  const sprints = useApiQuery<SprintOption[]>(`/api/projects/${projectId}/sprints`, { toastOnError: true })
  const openSprints = (sprints.data ?? []).filter((s) => OPEN_SPRINT_STATUSES.has(s.status))
  return (
    <Group>
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
    </Group>
  )
}

/** PO: an explicit choice is required; "clear" is its own option and asks first. */
function PoControl({ count, disabled, onApply, confirmClear, members }: ControlProps & { members: readonly ProjectMember[] }) {
  const { t, pt } = useLanguage()
  const [po, setPo] = useState("")
  const names = poCandidates(members)
  const fill = (s: string) => s.replace("{po}", pt.rolePO).replace("{count}", String(count))

  async function apply() {
    if (po === BULK_CLEAR && !(await confirmClear(fill(t.backlogBulkClearPoConfirm)))) return
    onApply({ action: "assignPo", payload: { assignedPo: po === BULK_CLEAR ? null : po } })
  }

  return (
    <Group>
      <Select selectSize="sm" aria-label={pt.rolePO} value={po} onChange={(e) => setPo(e.target.value)} className="w-auto">
        <option value="">{fill(t.backlogBulkChoosePo)}</option>
        {names.map((name) => (
          <option key={name} value={name}>
            {name}
          </option>
        ))}
        <option value={BULK_CLEAR}>{fill(t.backlogBulkClearPo)}</option>
      </Select>
      <Button size="sm" variant="secondary" disabled={disabled || !po} onClick={() => void apply()}>
        {fill(t.backlogBulkAssignPo)}
      </Button>
    </Group>
  )
}

/** Link the selected PBIs to a master-plan leaf item (or unlink them, after a confirm). */
function PlanControl({ projectId, count, disabled, onApply, confirmClear }: ControlProps) {
  const { t } = useLanguage()
  const [planItemId, setPlanItemId] = useState("")
  const plan = usePlanLeafOptions(projectId)

  async function apply() {
    if (planItemId === BULK_CLEAR && !(await confirmClear(t.backlogBulkUnlinkPlanConfirm.replace("{count}", String(count))))) return
    onApply({ action: "linkPlan", payload: { planItemId: planItemId === BULK_CLEAR ? null : planItemId } })
  }

  return (
    <Group>
      <Select
        selectSize="sm"
        aria-label={t.backlogBulkChoosePlan}
        value={planItemId}
        onChange={(e) => setPlanItemId(e.target.value)}
        aria-busy={plan.isLoading}
        className="w-auto max-w-56"
      >
        <option value="">{t.backlogBulkChoosePlan}</option>
        <PlanLeafOptionList options={plan.options} />
        <option value={BULK_CLEAR}>{t.backlogBulkUnlinkPlan}</option>
      </Select>
      <Button size="sm" variant="secondary" disabled={disabled || !planItemId} onClick={() => void apply()}>
        {t.backlogBulkLinkPlan}
      </Button>
    </Group>
  )
}
