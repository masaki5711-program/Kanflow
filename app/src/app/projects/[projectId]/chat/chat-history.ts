import { decodeChatStream, parseProposalOutcome, proposalsOf, type ProposalOutcome } from "@/lib/chat-proposals"
import type { ChatMessage } from "./use-chat-stream"

/**
 * Client helpers for the stored chat history (P3). Pure — no React, no fetch.
 * API: GET /api/projects/:id/chat/threads (list) and /chat/threads/:threadId.
 */

/** GET /chat/threads item. */
export interface ChatThreadSummary {
  id: string
  title: string
  createdAt: string
  updatedAt: string
}

export interface ChatThreadPage {
  items: ChatThreadSummary[]
  nextCursor: string | null
}

/** GET /chat/threads/:threadId message. */
export interface StoredChatMessage {
  id: string
  role: "user" | "assistant"
  content: string
  partial: boolean
  createdAt: string
  /** Stored tool calls / proposal events; a proposal event may carry its `outcome` (P-02). */
  toolEvents?: unknown
}

export interface StoredChatThread {
  thread: ChatThreadSummary
  messages: StoredChatMessage[]
}

/** The chat route accepts at most this many messages of at most this many characters. */
export const REQUEST_HISTORY_MAX = 40
export const REQUEST_MESSAGE_MAX_CHARS = 8000

export const THREAD_PARAM = "thread"

export function threadsUrl(projectId: string): string {
  return `/api/projects/${encodeURIComponent(projectId)}/chat/threads`
}

export function threadUrl(projectId: string, threadId: string): string {
  return `${threadsUrl(projectId)}/${encodeURIComponent(threadId)}`
}

/**
 * Outcomes (applied / rejected / applying) stored with the thread's proposal
 * events, by proposalId. Thread-wide: a repeated proposal shares one outcome.
 */
export function storedProposalOutcomes(stored: readonly StoredChatMessage[]): Record<string, ProposalOutcome> {
  const out: Record<string, ProposalOutcome> = {}
  for (const m of stored) {
    if (!Array.isArray(m.toolEvents)) continue
    for (const e of m.toolEvents as unknown[]) {
      if (!e || typeof e !== "object") continue
      const { type, proposal, outcome } = e as { type?: unknown; proposal?: { proposalId?: unknown }; outcome?: unknown }
      const id = type === "proposal" && typeof proposal?.proposalId === "string" ? proposal.proposalId : null
      const parsed = id && !(id in out) ? parseProposalOutcome(outcome) : null
      if (id && parsed) out[id] = parsed
    }
  }
  return out
}

/** Stored messages → chat state (proposal frames decoded; a partial answer shows as stopped). */
export function toChatMessages(stored: readonly StoredChatMessage[]): ChatMessage[] {
  const outcomes = storedProposalOutcomes(stored)
  return stored.map((m) => {
    if (m.role === "user") return { id: m.id, role: "user", content: m.content }
    const { text, events } = decodeChatStream(m.content)
    const proposals = proposalsOf(events)
    const own = Object.fromEntries(proposals.filter((p) => outcomes[p.proposalId]).map((p) => [p.proposalId, outcomes[p.proposalId]]))
    return {
      id: m.id,
      role: "assistant",
      content: text,
      ...(proposals.length > 0 ? { proposals } : {}),
      ...(Object.keys(own).length > 0 ? { proposalOutcomes: own } : {}),
      ...(m.partial ? { stopped: true } : {}),
    }
  })
}

/**
 * The history sent with a question: the newest 40 non-empty messages, each
 * cut to 8000 characters (a resumed long thread would otherwise fail the
 * route's validation).
 */
export function toRequestHistory(messages: readonly Pick<ChatMessage, "role" | "content">[]): { role: "user" | "assistant"; content: string }[] {
  return messages
    .filter((m) => m.content.trim().length > 0)
    .slice(-REQUEST_HISTORY_MAX)
    .map((m) => ({ role: m.role, content: m.content.slice(0, REQUEST_MESSAGE_MAX_CHARS) }))
}

/** Loose parsers for API bodies (never throw). */
export function toThreadPage(raw: unknown): ChatThreadPage {
  const r = raw && typeof raw === "object" ? (raw as Partial<ChatThreadPage>) : {}
  return { items: Array.isArray(r.items) ? r.items : [], nextCursor: typeof r.nextCursor === "string" ? r.nextCursor : null }
}

export function toStoredThread(raw: unknown): StoredChatThread | null {
  const r = raw && typeof raw === "object" ? (raw as Partial<StoredChatThread>) : null
  if (!r?.thread || !Array.isArray(r.messages)) return null
  return { thread: r.thread, messages: r.messages }
}
