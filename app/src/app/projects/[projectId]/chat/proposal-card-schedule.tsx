"use client"

import type { ReactNode } from "react"
import { TriangleAlert } from "lucide-react"
import { Badge } from "@/components/ui"
import { fillTemplate } from "@/lib/fill-template"
import type { useLanguage } from "@/lib/language-context"
import type {
  CreateIceboxProposal,
  CreateTemplateProposal,
  PlanEditProposal,
  PlanOp,
  SprintPbiProposal,
  SprintScheduleProposal,
} from "@/lib/chat-proposals"
import type { PlanTemplateContent, TemplateNode } from "@/lib/plan-templates/schema"

type T = ReturnType<typeof useLanguage>["t"]

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <p>
      <span className="font-medium text-fg-muted">{label}: </span>
      {children}
    </p>
  )
}

const code = (text: string) => <code className="whitespace-nowrap rounded bg-surface-sunken px-1">{text}</code>

export function IceboxBody({ p, t }: { p: CreateIceboxProposal; t: T }) {
  return (
    <>
      <Row label={t.chatProposalRequest}><span className="whitespace-pre-wrap">{p.request}</span></Row>
      {p.background && <Row label={t.chatProposalBackground}><span className="whitespace-pre-wrap">{p.background}</span></Row>}
    </>
  )
}

export function SprintPbiBody({ p, t }: { p: SprintPbiProposal; t: T }) {
  return (
    <>
      <p className="font-semibold">#{p.pbi.displayId} {p.pbi.title}</p>
      <Row label={t.chatProposalSprint}>{p.sprint.name}</Row>
      <p className="font-medium">{p.action === "add" ? t.chatProposalActionAdd : t.chatProposalActionRemove}</p>
      {p.action === "remove" && (p.taskCount ?? 0) > 0 && (
        <div role="note" className="flex items-start gap-1.5 rounded border border-warning/30 bg-warning-soft px-2 py-1.5 text-body font-medium">
          <TriangleAlert className="mt-0.5 h-4 w-4 flex-shrink-0" aria-hidden />
          {fillTemplate(t.chatProposalRemoveWarning, { count: p.taskCount ?? 0 })}
        </div>
      )}
    </>
  )
}

/** "2026-11-01 – 2026-11-13", or the undated label. */
function periodText(start: string | null, end: string | null, t: T): string {
  return start && end ? `${start} – ${end}` : t.chatProposalUndated
}

export function SprintScheduleBody({ p, t }: { p: SprintScheduleProposal; t: T }) {
  return (
    <>
      <p className="font-semibold">{p.sprint.name}</p>
      <p>
        <span className="font-medium text-fg-muted">{t.chatProposalPeriod}: </span>
        {code(periodText(p.before.startDate, p.before.endDate, t))}
        {" → "}
        {code(periodText(p.after.startDate, p.after.endDate, t))}
      </p>
    </>
  )
}

function followersLabel(op: Extract<PlanOp, { op: "shift" }>, t: T): string {
  if (op.followers === "dependents") return t.chatProposalFollowersDependents
  return op.followers === "later" ? t.chatProposalFollowersLater : t.chatProposalFollowersNone
}

function PlanOpLine({ op, t }: { op: PlanOp; t: T }) {
  if (op.op === "create") {
    return (
      <li className="space-y-0.5">
        <Badge tone="success">{t.chatProposalOpCreate}</Badge> <span className="font-medium">{op.name}</span>
        {op.isMilestone && <span className="text-fg-muted"> ({t.chatProposalMilestone})</span>}
        <div className="text-caption text-fg-muted">
          {op.parent && <span>{t.chatProposalParent}: {op.parent.name} / </span>}
          {periodText(op.plannedStart, op.plannedEnd, t)}
        </div>
      </li>
    )
  }
  if (op.op === "update") {
    const { changes, before } = op
    const dates = changes.plannedStart !== undefined || changes.plannedEnd !== undefined
    return (
      <li className="space-y-0.5">
        <Badge tone="neutral">{t.chatProposalOpUpdate}</Badge> <span className="font-medium">{op.target.name}</span>
        {changes.name && <div className="text-caption">{t.chatProposalRenameTo}: {code(changes.name)}</div>}
        {dates && (
          <div className="text-caption">
            {code(periodText(before.plannedStart, before.plannedEnd, t))}
            {" → "}
            {code(periodText(
              changes.plannedStart !== undefined ? changes.plannedStart : before.plannedStart,
              changes.plannedEnd !== undefined ? changes.plannedEnd : before.plannedEnd,
              t,
            ))}
          </div>
        )}
        {changes.status && (
          <div className="text-caption">
            {t.chatProposalTemplateStatus}: {code(before.status)}{" → "}{code(changes.status)}
          </div>
        )}
      </li>
    )
  }
  if (op.op === "reflow") {
    return (
      <li className="space-y-0.5">
        <Badge tone="neutral">{t.pscReflowTitle}</Badge>
        <div className="text-caption text-fg-muted">{t.pscReflowDesc}</div>
      </li>
    )
  }
  return (
    <li className="space-y-0.5">
      <Badge tone="neutral">{fillTemplate(op.days > 0 ? t.chatProposalOpShiftLater : t.chatProposalOpShiftEarlier, { days: Math.abs(op.days) })}</Badge>{" "}
      <span className="font-medium">{op.target.name}</span>
      <div className="text-caption">
        {code(periodText(op.before.plannedStart, op.before.plannedEnd, t))}
        {" → "}
        {code(periodText(op.after.plannedStart, op.after.plannedEnd, t))}
      </div>
      <div className="text-caption text-fg-muted">{followersLabel(op, t)}</div>
    </li>
  )
}

export function PlanEditBody({ p, t }: { p: PlanEditProposal; t: T }) {
  return (
    <ol className="list-decimal space-y-2 pl-5">
      {p.ops.map((op, i) => <PlanOpLine key={`${i}-${op.op}`} op={op} t={t} />)}
    </ol>
  )
}

function StageTree({ nodes, t }: { nodes: readonly TemplateNode[]; t: T }) {
  return (
    <ul className="list-disc space-y-0.5 pl-5">
      {nodes.map((n, i) => (
        <li key={`${i}-${n.name}`}>
          {n.name}
          {n.isMilestone && <span className="text-fg-muted"> ({t.chatProposalMilestone})</span>}
          {n.durationDays !== undefined && <span className="text-fg-muted"> · {fillTemplate(t.chatProposalDurationDays, { days: n.durationDays })}</span>}
          {n.children && n.children.length > 0 && <StageTree nodes={n.children} t={t} />}
        </li>
      ))}
    </ul>
  )
}

export function TemplateBody({ p, t }: { p: CreateTemplateProposal; t: T }) {
  const content: PlanTemplateContent = p.content
  return (
    <>
      <p className="font-semibold">{p.name}</p>
      {p.description && <p className="text-caption text-fg-muted">{p.description}</p>}
      <p className="text-caption text-fg-muted">
        {fillTemplate(t.chatProposalStages, { count: p.stageCount })} · {p.visibility === "private" ? t.chatProposalVisibilityPrivate : t.chatProposalVisibilityPublic}
      </p>
      <StageTree nodes={content.stages} t={t} />
    </>
  )
}
