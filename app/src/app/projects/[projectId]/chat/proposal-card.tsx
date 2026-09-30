"use client"

import type { ReactNode } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Check, ListChecks, PlusSquare, RefreshCw, X } from "lucide-react"
import { Badge, Button, useToast } from "@/components/ui"
import { versionConflictOf } from "@/hooks"
import { useLanguage } from "@/lib/language-context"
import type { ChatProposal, CreatePbiProposal, StatusChangeProposal, TaskSplitProposal } from "@/lib/chat-proposals"
import { PartialApplyError, applyProposal, requiredAction } from "./proposal-actions"
import { useProposalContext } from "./proposal-context"

type T = ReturnType<typeof useLanguage>["t"]

interface ProposalListProps {
  projectId: string
  proposals: readonly ChatProposal[]
  /** The assistant message is still streaming. */
  pending?: boolean
}

export function ProposalList({ projectId, proposals, pending }: ProposalListProps) {
  return (
    <div className="mt-3 space-y-2">
      {proposals.map((p) => (
        <ProposalCard key={p.proposalId} projectId={projectId} proposal={p} pending={pending} />
      ))}
    </div>
  )
}

const TITLE_KEY = {
  create_pbi: "chatProposalCreatePbiTitle",
  task_split: "chatProposalTaskSplitTitle",
  status_change: "chatProposalStatusChangeTitle",
} as const

const ICON = { create_pbi: PlusSquare, task_split: ListChecks, status_change: RefreshCw } as const

function ProposalCard({ projectId, proposal, pending }: { projectId: string; proposal: ChatProposal; pending?: boolean }) {
  const { t } = useLanguage()
  const toast = useToast()
  const router = useRouter()
  const { stateOf, setState, permissions } = useProposalContext()
  const state = stateOf(proposal.proposalId)
  const allowed = permissions ? permissions(requiredAction(proposal)) : false
  const idle = state.status === "idle"
  const headingId = `proposal-${proposal.proposalId}`
  const Icon = ICON[proposal.kind]

  async function approve() {
    setState(proposal.proposalId, { status: "applying" })
    try {
      const result = await applyProposal(projectId, proposal)
      setState(proposal.proposalId, { status: "applied", href: result.href })
      toast.success(successMessage(t, proposal, result.ids.length), {
        action: { label: t.chatProposalOpen, onClick: () => router.push(result.href) },
      })
    } catch (err) {
      if (err instanceof PartialApplyError) {
        const href = `/projects/${encodeURIComponent(projectId)}/sprints?task=${encodeURIComponent(err.ids[0])}`
        setState(proposal.proposalId, { status: "applied", href })
        toast.error(t.chatProposalTasksPartial.replace("{done}", String(err.done)).replace("{total}", String(err.total)), {
          title: t.chatProposalFailed,
        })
        return
      }
      setState(proposal.proposalId, { status: "idle" })
      const message = versionConflictOf(err)
        ? t.apiErrVersionConflict
        : err instanceof Error && err.message ? err.message : t.chatProposalFailed
      toast.error(message, { title: t.chatProposalFailed })
    }
  }

  return (
    <section
      aria-labelledby={headingId}
      className="rounded-lg border border-primary/30 bg-surface-muted p-3 text-sm"
    >
      <header className="flex items-center gap-2">
        <Icon className="h-4 w-4 text-primary" aria-hidden />
        <h4 id={headingId} className="font-semibold">{t[TITLE_KEY[proposal.kind]]}</h4>
        {state.status === "applied" && <Badge tone="success">{t.chatProposalApplied}</Badge>}
        {state.status === "rejected" && <Badge tone="neutral">{t.chatProposalRejected}</Badge>}
      </header>
      <p className="mt-1 text-caption text-fg-muted">{t.chatProposalNotice}</p>

      <div className="mt-2 space-y-1">
        {proposal.kind === "create_pbi" && <CreatePbiBody p={proposal} t={t} />}
        {proposal.kind === "task_split" && <TaskSplitBody p={proposal} t={t} />}
        {proposal.kind === "status_change" && <StatusChangeBody p={proposal} t={t} />}
        {proposal.reason && (
          <p className="text-caption text-fg-muted">
            <span className="font-medium">{t.chatProposalReason}: </span>
            {proposal.reason}
          </p>
        )}
      </div>

      {state.status === "applied" ? (
        <Link href={state.href} className="mt-2 inline-block text-caption text-primary hover:underline">
          {t.chatProposalOpen}
        </Link>
      ) : (
        state.status !== "rejected" && (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              leftIcon={<Check className="h-3.5 w-3.5" />}
              loading={state.status === "applying"}
              disabled={!idle || !allowed || pending}
              onClick={() => void approve()}
            >
              {state.status === "applying"
                ? t.chatProposalApplying
                : proposal.kind === "status_change" ? t.chatProposalApproveApply : t.chatProposalApproveCreate}
            </Button>
            <Button
              size="sm"
              variant="secondary"
              leftIcon={<X className="h-3.5 w-3.5" />}
              disabled={!idle || pending}
              onClick={() => setState(proposal.proposalId, { status: "rejected" })}
            >
              {t.chatProposalReject}
            </Button>
            {permissions === null ? (
              <span className="text-caption text-fg-muted">{t.chatProposalCheckingPermission}</span>
            ) : (
              !allowed && <span className="text-caption text-danger">{t.chatProposalNoPermission}</span>
            )}
          </div>
        )
      )}
    </section>
  )
}

function successMessage(t: T, proposal: ChatProposal, count: number): string {
  switch (proposal.kind) {
    case "create_pbi":
      return t.chatProposalPbiCreated
    case "task_split":
      return t.chatProposalTasksCreated.replace("{count}", String(count))
    case "status_change":
      return t.chatProposalStatusChanged
  }
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <p>
      <span className="font-medium text-fg-muted">{label}: </span>
      {children}
    </p>
  )
}

function CreatePbiBody({ p, t }: { p: CreatePbiProposal; t: T }) {
  return (
    <>
      <p className="font-semibold">{p.title}</p>
      {p.storyPoints !== null && <Row label={t.chatProposalStoryPoints}>{p.storyPoints}</Row>}
      {p.epic && <Row label={t.chatProposalEpic}>{p.epic}</Row>}
      {p.userStory && <Row label={t.chatProposalUserStory}><span className="whitespace-pre-wrap">{p.userStory}</span></Row>}
      {p.acceptanceCriteria && (
        <div>
          <span className="font-medium text-fg-muted">{t.chatProposalAcceptance}:</span>
          <p className="whitespace-pre-wrap">{p.acceptanceCriteria}</p>
        </div>
      )}
      {p.possibleDuplicates.length > 0 && (
        <div role="note" className="rounded border border-warning/30 bg-warning-soft px-2 py-1 text-caption">
          <span className="font-medium">{t.chatProposalDuplicates}: </span>
          {p.possibleDuplicates.map((d) => `#${d.displayId} ${d.title}`).join(" / ")}
        </div>
      )}
    </>
  )
}

function TaskSplitBody({ p, t }: { p: TaskSplitProposal; t: T }) {
  return (
    <>
      <p className="font-semibold">#{p.pbi.displayId} {p.pbi.title}</p>
      <Row label={t.chatProposalSprint}>{p.sprint.name}</Row>
      <ol className="list-decimal pl-5">
        {p.tasks.map((task, i) => (
          <li key={`${i}-${task.name}`}>
            {task.name}
            {task.estimate !== null && <span className="text-fg-muted"> ({t.chatProposalEstimate}: {task.estimate})</span>}
          </li>
        ))}
      </ol>
      {p.skippedExisting.length > 0 && (
        <p className="text-caption text-fg-muted">{t.chatProposalSkipped}: {p.skippedExisting.join(", ")}</p>
      )}
    </>
  )
}

function StatusChangeBody({ p, t }: { p: StatusChangeProposal; t: T }) {
  const label = p.entity === "pbi" ? t.chatProposalTargetPbi : t.chatProposalTargetTask
  return (
    <>
      <p className="font-semibold">
        {label} {p.target.displayId !== null ? `#${p.target.displayId} ` : ""}{p.target.title}
      </p>
      <p>
        <code className="rounded bg-surface-sunken px-1">{p.fromStatus}</code>
        {" → "}
        <code className="rounded bg-surface-sunken px-1">{p.toStatus}</code>
      </p>
    </>
  )
}
