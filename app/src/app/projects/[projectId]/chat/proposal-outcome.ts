import { apiFetch, isApiError } from "@/hooks"
import { parseProposalOutcome, type ChatProposal, type ProposalOutcome } from "@/lib/chat-proposals"
import { proposalResultHref } from "./proposal-actions"
import type { ProposalState } from "./proposal-context"

/**
 * Client side of the persisted proposal outcome (P-02). Approving is
 * two-phase against POST …/chat/threads/:threadId/proposals/:proposalId:
 * reserve (409 = already applied / being applied → nothing is created) →
 * REST calls → confirm, or release when they failed. Rejecting is recorded
 * too, so a re-opened thread shows every card in its final state.
 */

export function proposalOutcomeUrl(projectId: string, threadId: string, proposalId: string): string {
  return `/api/projects/${encodeURIComponent(projectId)}/chat/threads/${encodeURIComponent(threadId)}/proposals/${encodeURIComponent(proposalId)}`
}

/** Card state for a stored outcome (`applying` shows as in progress). */
export function stateFromOutcome(projectId: string, proposal: ChatProposal, outcome: ProposalOutcome): ProposalState {
  switch (outcome.status) {
    case "applied":
      return {
        status: "applied",
        href: proposalResultHref(projectId, proposal, outcome.appliedEntityId ? [outcome.appliedEntityId] : []),
      }
    case "rejected":
      return { status: "rejected" }
    case "applying":
      return { status: "applying" }
  }
}

export type ReserveResult =
  | { kind: "reserved" }
  /** The proposal is not stored in a thread (unsaved chat): apply without a record. */
  | { kind: "untracked" }
  /** Already applied / rejected / being applied: do NOT create anything. */
  | { kind: "taken"; outcome: ProposalOutcome | null }

type Action = { action: "reserve" | "release" | "reject" } | { action: "confirm"; appliedEntityId: string | null }

function post(projectId: string, threadId: string, proposalId: string, body: Action) {
  return apiFetch<{ outcome: unknown }>(proposalOutcomeUrl(projectId, threadId, proposalId), { method: "POST", json: body })
}

function conflictOutcome(err: unknown): ProposalOutcome | null {
  const body = isApiError(err) ? err.body : null
  return body && typeof body === "object" ? parseProposalOutcome((body as { outcome?: unknown }).outcome) : null
}

/** Phase 1. Other failures (network, 5xx) are thrown: the caller does not apply. */
export async function reserveProposal(projectId: string, threadId: string | null, proposalId: string): Promise<ReserveResult> {
  if (!threadId) return { kind: "untracked" }
  try {
    await post(projectId, threadId, proposalId, { action: "reserve" })
    return { kind: "reserved" }
  } catch (err) {
    if (isApiError(err) && err.status === 409) return { kind: "taken", outcome: conflictOutcome(err) }
    if (isApiError(err) && err.status === 404) return { kind: "untracked" }
    throw err
  }
}

/** Phase 3 (success). Retried once: a lost confirm would leave only the short-lived reservation. */
export async function confirmProposal(
  projectId: string,
  threadId: string,
  proposalId: string,
  appliedEntityId: string | null
): Promise<void> {
  const body: Action = { action: "confirm", appliedEntityId }
  await post(projectId, threadId, proposalId, body).catch(() => post(projectId, threadId, proposalId, body))
}

/** Phase 3 (failure): free the reservation so the user can retry. Best effort. */
export async function releaseProposal(projectId: string, threadId: string, proposalId: string): Promise<void> {
  await post(projectId, threadId, proposalId, { action: "release" }).catch(() => undefined)
}

/** Record a rejection. Returns the stored outcome when the proposal was handled elsewhere first. */
export async function rejectProposal(
  projectId: string,
  threadId: string | null,
  proposalId: string
): Promise<{ taken: ProposalOutcome | null } | null> {
  if (!threadId) return null
  try {
    await post(projectId, threadId, proposalId, { action: "reject" })
    return null
  } catch (err) {
    if (isApiError(err) && err.status === 409) return { taken: conflictOutcome(err) }
    return null
  }
}
