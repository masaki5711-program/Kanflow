"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import Link from "next/link"
import { Diamond, ExternalLink, ListTodo, Workflow } from "lucide-react"
import { Badge, Modal } from "@/components/ui"
import { formatDateRange, formatShortDate } from "@/lib/format-date"
import { useLanguage } from "@/lib/language-context"
import { SectionFrame, type Announce } from "../improvement/section-frame"
import { stageStatusLabel, type MilestoneBoard, type Stage } from "./milestone-types"
import { PunchSection } from "./punch-section"
import type { PunchRowContext } from "./punch-row"
import { StageConditions } from "./stage-conditions"
import { StageSchedule } from "./stage-schedule"
import type { BoardWriter, PlanPatcher } from "./use-milestone-board"

interface Props {
  projectId: string
  board: MilestoneBoard
  stage: Stage | null
  nameOf: (s: { name: string; i18n: unknown }) => string
  punchCtx: Omit<PunchRowContext, "announce">
  write: BoardWriter
  patchPlanItem: PlanPatcher
  onClose: () => void
}

/** Keyed per stage so the schedule form starts from the stage's saved values. */
export function StagePanel(props: Props) {
  if (!props.stage) return null
  return <PanelBody key={props.stage.id} {...props} stage={props.stage} />
}

interface Status {
  message: string
  tone: "success" | "error"
}

const SUCCESS_VISIBLE_MS = 4000

/**
 * A stage's dialog: 完了条件 (ticks), 日程と状態 (writes the plan item), its
 * steps from 全体計画 and its 残課題. Every outcome is announced in one
 * aria-live region.
 */
function PanelBody({ projectId, board, stage, nameOf, punchCtx, write, patchPlanItem, onClose }: Props & { stage: Stage }) {
  const { t, language } = useLanguage()
  const [status, setStatus] = useState<Status | null>(null)
  const [dirty, setDirty] = useState(false)
  const startRef = useRef<HTMLDivElement>(null)
  const announce: Announce = useCallback((message, tone = "success") => setStatus({ message, tone }), [])
  useEffect(() => {
    if (status?.tone !== "success") return
    const timer = setTimeout(() => setStatus(null), SUCCESS_VISIBLE_MS)
    return () => clearTimeout(timer)
  }, [status])
  const { canEdit, canTrack } = board.permissions
  const ids = new Set([stage.id, ...stage.steps.map((s) => s.id)])
  const punch = board.punchItems.filter((p) => p.planItemId !== null && ids.has(p.planItemId))
  const late = stage.scheduleState === "delayed"

  return (
    <Modal
      open
      // Start on the content, not the first input (on a phone that would pop up the keyboard).
      initialFocusRef={startRef}
      size="xl"
      onClose={onClose}
      isDirty={dirty}
      title={
        <span className="inline-flex items-center gap-2">
          {stage.isMilestone && <Diamond aria-label={t.msMilestone} className="h-4 w-4 fill-primary text-primary" />}
          {nameOf(stage)}
        </span>
      }
      description={
        <span className="inline-flex flex-wrap items-center gap-2">
          <Badge tone={stage.status === "done" ? "success" : "neutral"}>{stageStatusLabel(stage.status, t)}</Badge>
          {late && <Badge tone="danger">{t.msLate}</Badge>}
          <span>{t.msPlanned}: {stage.plannedEnd ? formatDateRange(stage.plannedStart ?? stage.plannedEnd, stage.plannedEnd, language, { utc: true }) : t.msUndated}</span>
        </span>
      }
      bodyClassName="space-y-3 bg-surface-muted"
    >
      {!canTrack && <p className="rounded-ui-md bg-info-soft px-3 py-2 text-caption text-info">{t.msReadOnly}</p>}
      <div ref={startRef} tabIndex={-1} className="outline-none">
        <StageConditions stage={stage} canEdit={canEdit} canTrack={canTrack} write={write} patchPlanItem={patchPlanItem} announce={announce} />
      </div>
      <StageSchedule stage={stage} canEdit={canEdit} patchPlanItem={patchPlanItem} announce={announce} onDirty={setDirty} />
      {stage.steps.length > 0 && (
        <SectionFrame title={t.msPanelSteps} icon={<Workflow aria-hidden="true" className="h-5 w-5 text-primary" />} aside={<PlanLink projectId={projectId} />}>
          <ul className="space-y-1">
            {stage.steps.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center gap-2 text-body" style={{ paddingLeft: `${(s.depth - 1) * 1}rem` }}>
                {s.isMilestone && <Diamond aria-label={t.msMilestone} className="h-3.5 w-3.5 fill-primary text-primary" />}
                <span className="min-w-0 flex-1 text-fg">{nameOf(s)}</span>
                <Badge tone={s.status === "done" ? "success" : s.scheduleState === "delayed" ? "danger" : "neutral"}>
                  {s.scheduleState === "delayed" ? t.msLate : stageStatusLabel(s.status, t)}
                </Badge>
                <span className="text-caption text-fg-muted">{s.plannedEnd ? formatShortDate(s.plannedEnd, language, { utc: true }) : t.msUndated}</span>
              </li>
            ))}
          </ul>
        </SectionFrame>
      )}
      <SectionFrame title={t.msPanelPunch} icon={<ListTodo aria-hidden="true" className="h-5 w-5 text-primary" />}>
        <PunchSection items={punch} ctx={{ ...punchCtx, announce }} viewerId={board.viewerId} planItemId={stage.id} filters={false} />
      </SectionFrame>
      <p
        aria-live="polite"
        aria-atomic="true"
        className={status ? `sticky bottom-0 rounded-ui-md px-3 py-2 text-body font-medium shadow-ui-md ${status.tone === "error" ? "bg-danger-soft text-danger-strong" : "bg-success-soft text-success-strong"}` : "sr-only"}
      >
        {status?.message ?? ""}
      </p>
    </Modal>
  )
}

function PlanLink({ projectId }: { projectId: string }) {
  const { t } = useLanguage()
  return (
    <Link href={`/projects/${projectId}/plan`} className="inline-flex items-center gap-1 text-caption text-primary-strong hover:underline">
      {t.msEditInPlan}
      <ExternalLink aria-hidden="true" className="h-3.5 w-3.5" />
    </Link>
  )
}
