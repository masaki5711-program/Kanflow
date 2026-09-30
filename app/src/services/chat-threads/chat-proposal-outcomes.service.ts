import { defaultDb } from "@/services/_shared/db"
import { ConflictError, NotFoundError } from "@/services/_shared/errors"
import type { ProposalOutcome } from "@/lib/chat-proposals"
import * as repo from "./chat-threads.repository"
import type { ProposalOutcomeAction } from "./chat-threads.schemas"
import { parseToolEvents, serializeToolEvents, type ChatToolEvent, type ThreadOwner } from "./chat-threads.service"

/**
 * Persisted outcome of an AI chat proposal (P-02). The outcome lives on the
 * stored proposal event (ChatMessage.toolEvents) of the oldest message of the
 * thread that carries the proposalId, so re-opening the thread shows the card
 * as applied / rejected.
 *
 * Approving is duplicate-proof in two phases: the client `reserve`s the
 * proposal (409 when it is already applied, rejected or being applied), runs
 * the normal REST calls, then `confirm`s with the created id — or `release`s
 * the reservation when they failed. Every transition is one compare-and-set
 * UPDATE, so two concurrent approvals cannot both win.
 */

/** A reservation older than this is treated as abandoned (tab closed mid-apply). */
export const PROPOSAL_RESERVATION_TTL_MS = 2 * 60_000
const CAS_ATTEMPTS = 3

type Transition = { next: ProposalOutcome | undefined } | { conflict: ProposalOutcome }

function isLiveReservation(outcome: ProposalOutcome | undefined, now: Date): boolean {
  if (outcome?.status !== "applying") return false
  const at = Date.parse(outcome.at)
  return Number.isFinite(at) && now.getTime() - at < PROPOSAL_RESERVATION_TTL_MS
}

/** Pure state machine of one proposal's outcome. */
export function nextProposalOutcome(
  current: ProposalOutcome | undefined,
  input: ProposalOutcomeAction,
  by: string,
  now: Date
): Transition {
  const at = now.toISOString()
  const live = isLiveReservation(current, now)
  switch (input.action) {
    case "reserve":
      if (current && (current.status !== "applying" || live)) return { conflict: current }
      return { next: { status: "applying", appliedEntityId: null, at, by } }
    case "confirm":
      if (current?.status === "applied") return { next: current }
      if (current?.status === "rejected") return { conflict: current }
      if (live && current?.by !== by) return { conflict: current as ProposalOutcome }
      return { next: { status: "applied", appliedEntityId: input.appliedEntityId, at, by } }
    case "release":
      // Only a reservation can be released; an applied / rejected proposal is
      // final and answers 409 like reserve / reject do (C3-03).
      if (current?.status === "applied" || current?.status === "rejected") return { conflict: current }
      return { next: undefined }
    case "reject":
      if (current?.status === "applied" || live) return { conflict: current as ProposalOutcome }
      if (current?.status === "rejected") return { next: current }
      return { next: { status: "rejected", appliedEntityId: null, at, by } }
  }
}

interface Located {
  messageId: string
  raw: string | null
  events: ChatToolEvent[]
  index: number
  current: ProposalOutcome | undefined
}

function isProposalEvent(e: ChatToolEvent, proposalId: string): e is Extract<ChatToolEvent, { type: "proposal" }> {
  return e.type === "proposal" && e.proposal.proposalId === proposalId
}

/** The oldest stored event of the proposal (where its outcome is kept). */
async function locate(threadId: string, proposalId: string): Promise<Located | null> {
  const rows = await repo.findProposalMessages(defaultDb, threadId, proposalId)
  for (const row of rows) {
    const events = parseToolEvents(row.toolEvents)
    const index = events.findIndex((e) => isProposalEvent(e, proposalId))
    if (index === -1) continue
    const event = events[index]
    const current = event.type === "proposal" ? event.outcome : undefined
    return { messageId: row.id, raw: row.toolEvents, events, index, current }
  }
  return null
}

function withOutcome(events: readonly ChatToolEvent[], index: number, outcome: ProposalOutcome | undefined): ChatToolEvent[] {
  return events.map((e, i) => {
    if (i !== index || e.type !== "proposal") return e
    return outcome ? { type: "proposal", proposal: e.proposal, outcome } : { type: "proposal", proposal: e.proposal }
  })
}

/**
 * Apply one transition to the proposal's stored outcome. 404: thread not the
 * caller's / proposal not stored in it. 409 (body `outcome`): already
 * applied, rejected or being applied. Returns the outcome afterwards (null
 * after a release).
 */
export async function updateProposalOutcome(
  owner: ThreadOwner,
  threadId: string,
  proposalId: string,
  input: ProposalOutcomeAction,
  now: Date = new Date()
): Promise<ProposalOutcome | null> {
  const thread = await repo.findOwnedThread(defaultDb, owner, threadId)
  if (!thread) throw new NotFoundError("Chat thread not found")
  for (let attempt = 0; attempt < CAS_ATTEMPTS; attempt++) {
    const found = await locate(thread.id, proposalId)
    if (!found) throw new NotFoundError("Proposal not found in this thread")
    const result = nextProposalOutcome(found.current, input, owner.userId, now)
    if ("conflict" in result) throw new ConflictError("Proposal already handled", { outcome: result.conflict })
    if (result.next === found.current) return result.next ?? null
    const next = serializeToolEvents(withOutcome(found.events, found.index, result.next))
    if (await repo.swapToolEvents(defaultDb, found.messageId, found.raw, next)) return result.next ?? null
  }
  throw new ConflictError("Proposal is being updated concurrently")
}
