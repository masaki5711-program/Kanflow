"use client"

import { useRouter } from "next/navigation"
import { useToast } from "@/components/ui"
import { versionConflictOf } from "@/hooks"
import { useLanguage } from "@/lib/language-context"
import type { ChatProposal, ProposalOutcome } from "@/lib/chat-proposals"
import { PartialApplyError, applyProposal, proposalResultHref } from "./proposal-actions"
import { useProposalContext, type ProposalState } from "./proposal-context"
import { confirmProposal, rejectProposal, releaseProposal, reserveProposal, stateFromOutcome } from "./proposal-outcome"

type T = ReturnType<typeof useLanguage>["t"]

function successMessage(t: T, proposal: ChatProposal, count: number): string {
  switch (proposal.kind) {
    case "create_pbi":
      return t.chatProposalPbiCreated
    case "task_split":
      return t.chatProposalTasksCreated.replace("{count}", String(count))
    case "status_change":
      return t.chatProposalStatusChanged
    case "create_icebox":
      return t.chatProposalIceboxCreated
    case "sprint_pbi":
      return proposal.action === "add" ? t.chatProposalSprintPbiAdded : t.chatProposalSprintPbiRemoved
    case "plan_edit":
      return t.chatProposalPlanEdited.replace("{count}", String(proposal.ops.length))
    case "sprint_schedule":
      return t.chatProposalSprintScheduled
    case "create_template":
      return t.chatProposalTemplateCreated
  }
}

interface Options {
  projectId: string
  /** Stored thread of the proposal (null: unsaved chat — nothing is recorded). */
  threadId: string | null
  proposal: ChatProposal
  /** Outcome stored with the thread (a re-opened thread). */
  storedOutcome?: ProposalOutcome
}

/**
 * Card state + approve / reject of one proposal. The in-memory state wins
 * once the user acted on this page; before that the stored outcome decides.
 */
export function useProposalApproval({ projectId, threadId, proposal, storedOutcome }: Options): {
  state: ProposalState
  approve: () => Promise<void>
  reject: () => Promise<void>
} {
  const { t } = useLanguage()
  const toast = useToast()
  const router = useRouter()
  const { stateOf, setState } = useProposalContext()
  const id = proposal.proposalId
  const local = stateOf(id)
  const state = local.status === "idle" && storedOutcome ? stateFromOutcome(projectId, proposal, storedOutcome) : local

  function showTaken(outcome: ProposalOutcome | null) {
    setState(id, outcome ? stateFromOutcome(projectId, proposal, outcome) : { status: "idle" })
    toast.info(t.chatProposalAlreadyHandled)
  }

  async function approve() {
    setState(id, { status: "applying" })
    let reservation: Awaited<ReturnType<typeof reserveProposal>>
    try {
      reservation = await reserveProposal(projectId, threadId, id)
    } catch {
      setState(id, { status: "idle" })
      toast.error(t.chatProposalFailed)
      return
    }
    if (reservation.kind === "taken") return showTaken(reservation.outcome)
    const tracked = reservation.kind === "reserved" && threadId ? threadId : null

    try {
      const result = await applyProposal(projectId, proposal)
      if (tracked) await confirmProposal(projectId, tracked, id, result.ids[0] ?? null).catch(() => undefined)
      setState(id, { status: "applied", href: result.href })
      toast.success(successMessage(t, proposal, result.ids.length), {
        action: { label: t.chatProposalOpen, onClick: () => router.push(result.href) },
      })
    } catch (err) {
      if (err instanceof PartialApplyError) {
        // Some rows exist: record as applied so a retry cannot duplicate them.
        if (tracked) await confirmProposal(projectId, tracked, id, err.ids[0] ?? null).catch(() => undefined)
        const href = proposalResultHref(projectId, proposal, err.ids)
        setState(id, { status: "applied", href })
        const partial = proposal.kind === "task_split" ? t.chatProposalTasksPartial : t.chatProposalPartial
        toast.error(partial.replace("{done}", String(err.done)).replace("{total}", String(err.total)), {
          title: t.chatProposalFailed,
        })
        return
      }
      if (tracked) await releaseProposal(projectId, tracked, id)
      setState(id, { status: "idle" })
      const message = versionConflictOf(err)
        ? t.apiErrVersionConflict
        : err instanceof Error && err.message ? err.message : t.chatProposalFailed
      toast.error(message, { title: t.chatProposalFailed })
    }
  }

  async function reject() {
    setState(id, { status: "rejected" })
    const result = await rejectProposal(projectId, threadId, id)
    if (result) showTaken(result.taken)
  }

  return { state, approve, reject }
}
