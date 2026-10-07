import { defaultDb, withTransaction } from "@/services/_shared/db"
import { NotFoundError } from "@/services/_shared/errors"
import { encodeCursor, type Page } from "@/services/_shared/cursor"
import { logger } from "@/lib/logger"
import {
  decodeChatStream,
  encodeChatEvent,
  parseChatProposal,
  parseProposalOutcome,
  type ChatUiEvent,
  type ProposalOutcome,
} from "@/lib/chat-proposals"
import * as repo from "./chat-threads.repository"
import {
  CHAT_AUTO_TITLE_CHARS,
  CHAT_THREAD_MESSAGES_MAX,
  CHAT_TITLE_MAX,
  type ListThreadsQuery,
} from "./chat-threads.schemas"

/**
 * Persisted project chat (P3). A thread belongs to exactly one user in one
 * project and is visible to that user only — there is no admin override:
 * every lookup is scoped by (projectId, userId) and anything else is 404.
 *
 * The chat route stores the user's message once the model has started
 * answering, and the assistant's answer when the stream ends (also when it is
 * stopped or fails: then `partial = true`). The stored answer is the decoded
 * text; out-of-band stream frames (approval proposals, lib/chat-proposals.ts)
 * and the tools that ran go to `toolEvents`. Opening a thread re-encodes the
 * frames so the client renders a stored answer exactly like a live one.
 */

const log = logger.child({ module: "chat-threads" })

export type ThreadOwner = repo.ThreadOwner

export interface ChatThreadDto {
  id: string
  title: string
  createdAt: string
  updatedAt: string
}

/** A stored proposal event; `outcome` records approve / reject (see chat-proposal-outcomes.service). */
export type StoredProposalEvent = Extract<ChatUiEvent, { type: "proposal" }> & { outcome?: ProposalOutcome }

/** One stored tool call or out-of-band event of an assistant turn. */
export type ChatToolEvent = { type: "tool"; name: string; ms: number } | StoredProposalEvent

export interface ChatMessageDto {
  id: string
  role: "user" | "assistant"
  /** Text as the client renders it (proposal frames re-encoded, see decodeChatStream). */
  content: string
  toolEvents: ChatToolEvent[]
  partial: boolean
  createdAt: string
}

/** Stored answer text cap (MEDIUMTEXT holds far more; this bounds one row). */
export const CHAT_CONTENT_MAX = 200_000
/** toolEvents is TEXT (64 KB): the JSON is kept under this many bytes. */
const TOOL_EVENTS_MAX_BYTES = 60_000
const TOOL_EVENTS_MAX = 50

function toThreadDto(row: repo.ThreadRow): ChatThreadDto {
  return { id: row.id, title: row.title, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString() }
}

/** First line of the first user message, whitespace-collapsed, cut to 60 characters. */
export function deriveThreadTitle(text: string): string {
  const oneLine = text.replace(/\s+/g, " ").trim()
  if (!oneLine) return "Chat"
  const chars = Array.from(oneLine)
  return chars.length > CHAT_AUTO_TITLE_CHARS ? `${chars.slice(0, CHAT_AUTO_TITLE_CHARS).join("")}…` : oneLine
}

// --- tool events (stored JSON) ---------------------------------------------

function isToolEvent(value: unknown): value is { type: "tool"; name: string; ms: number } {
  if (!value || typeof value !== "object") return false
  const v = value as Record<string, unknown>
  return v.type === "tool" && typeof v.name === "string" && typeof v.ms === "number"
}

/** Stored JSON → events; unknown / malformed entries are dropped. Never throws. */
export function parseToolEvents(raw: string | null): ChatToolEvent[] {
  if (!raw) return []
  let value: unknown
  try {
    value = JSON.parse(raw)
  } catch {
    return []
  }
  if (!Array.isArray(value)) return []
  const out: ChatToolEvent[] = []
  for (const item of value) {
    if (isToolEvent(item)) {
      out.push({ type: "tool", name: item.name, ms: item.ms })
      continue
    }
    const isProposal = item && typeof item === "object" && (item as { type?: unknown }).type === "proposal"
    const proposal = isProposal ? parseChatProposal((item as { proposal?: unknown }).proposal) : null
    if (!proposal) continue
    const outcome = parseProposalOutcome((item as { outcome?: unknown }).outcome)
    out.push(outcome ? { type: "proposal", proposal, outcome } : { type: "proposal", proposal })
  }
  return out
}

/** Events → JSON under the column limit (trailing events dropped when too big); null when empty. */
export function serializeToolEvents(events: readonly ChatToolEvent[]): string | null {
  let kept = events.slice(0, TOOL_EVENTS_MAX)
  while (kept.length > 0) {
    const json = JSON.stringify(kept)
    if (Buffer.byteLength(json, "utf8") <= TOOL_EVENTS_MAX_BYTES) return json
    kept = kept.slice(0, -1)
  }
  return null
}

/** Stored message → client text: decoded text + its UI events re-encoded as frames. */
export function toClientContent(content: string, events: readonly ChatToolEvent[]): string {
  const frames = events
    .filter((e): e is StoredProposalEvent => e.type !== "tool")
    .map((e) => encodeChatEvent({ type: e.type, proposal: e.proposal }))
  return frames.length > 0 ? `${content}${frames.join("")}` : content
}

function toMessageDto(row: repo.MessageRow): ChatMessageDto {
  const toolEvents = parseToolEvents(row.toolEvents)
  return {
    id: row.id,
    role: row.role === "user" ? "user" : "assistant",
    content: toClientContent(row.content, toolEvents),
    toolEvents,
    partial: row.partial,
    createdAt: row.createdAt.toISOString(),
  }
}

// --- thread CRUD (owner only) ------------------------------------------------

async function requireOwnedThread(owner: ThreadOwner, threadId: string): Promise<repo.ThreadRow> {
  const thread = await repo.findOwnedThread(defaultDb, owner, threadId)
  if (!thread) throw new NotFoundError("Chat thread not found")
  return thread
}

export async function listThreads(owner: ThreadOwner, query: ListThreadsQuery): Promise<Page<ChatThreadDto>> {
  const rows = await repo.findThreads(defaultDb, owner, query.cursor, query.limit + 1)
  const pageRows = rows.slice(0, query.limit)
  const last = pageRows[pageRows.length - 1]
  return {
    items: pageRows.map(toThreadDto),
    nextCursor: rows.length > query.limit && last ? encodeCursor({ createdAt: last.updatedAt, id: last.id }) : null,
  }
}

export async function getThread(
  owner: ThreadOwner,
  threadId: string
): Promise<{ thread: ChatThreadDto; messages: ChatMessageDto[] }> {
  const thread = await requireOwnedThread(owner, threadId)
  const messages = await repo.findLatestMessages(defaultDb, thread.id, CHAT_THREAD_MESSAGES_MAX)
  return { thread: toThreadDto(thread), messages: messages.map(toMessageDto) }
}

export async function renameThread(owner: ThreadOwner, threadId: string, title: string): Promise<ChatThreadDto> {
  const thread = await requireOwnedThread(owner, threadId)
  return toThreadDto(await repo.updateThreadTitle(defaultDb, thread.id, title.slice(0, CHAT_TITLE_MAX)))
}

/** Soft delete; the worker purges it 30 days later. */
export async function deleteThread(owner: ThreadOwner, threadId: string, now: Date = new Date()): Promise<void> {
  const thread = await requireOwnedThread(owner, threadId)
  await repo.softDeleteThread(defaultDb, thread.id, now)
}

// --- chat turn persistence (used by the chat route) --------------------------

/**
 * Validate a thread id sent with a chat request BEFORE the model is called:
 * 404 for a thread that is not the caller's (or deleted). Undefined = new chat.
 */
export async function resolveChatThread(owner: ThreadOwner, threadId: string | undefined): Promise<string | null> {
  if (!threadId) return null
  return (await requireOwnedThread(owner, threadId)).id
}

/** Store the user's message (creating the thread on the first one). Returns the thread id. */
export async function recordUserMessage(owner: ThreadOwner, threadId: string | null, text: string): Promise<string> {
  const now = new Date()
  return withTransaction(async (tx) => {
    const id = threadId ?? (await repo.createThread(tx, owner, deriveThreadTitle(text))).id
    await repo.insertMessage(tx, { threadId: id, role: "user", content: text.slice(0, CHAT_CONTENT_MAX) })
    if (threadId) await repo.touchThread(tx, id, now)
    return id
  })
}

export interface AssistantTurn {
  /** Everything streamed to the client (text + event frames). */
  raw: string
  tools: ReadonlyArray<{ name: string; ms: number }>
  partial: boolean
}

/** Store the assistant's answer. Best effort: failures are logged, never thrown. */
export async function recordAssistantMessage(threadId: string, turn: AssistantTurn): Promise<boolean> {
  const { text, events } = decodeChatStream(turn.raw)
  // Live status frames are transient progress, never part of the stored thread.
  const stored = events.filter((e): e is StoredProposalEvent => e.type === "proposal")
  const toolEvents: ChatToolEvent[] = [...turn.tools.map((t) => ({ type: "tool" as const, name: t.name, ms: t.ms })), ...stored]
  if (!text.trim() && toolEvents.length === 0) return false
  try {
    await withTransaction(async (tx) => {
      await repo.insertMessage(tx, {
        threadId,
        role: "assistant",
        content: text.slice(0, CHAT_CONTENT_MAX),
        toolEvents: serializeToolEvents(toolEvents),
        partial: turn.partial,
      })
      await repo.touchThread(tx, threadId, new Date())
    })
    return true
  } catch (err) {
    log.warn("assistant message not stored", { threadId, error: err instanceof Error ? err.message : String(err) })
    return false
  }
}

/**
 * Collects one streamed answer for `recordAssistantMessage`. The route calls
 * `append` for every chunk it sends, `tool` per executed tool and `finish`
 * once in its `finally` (idempotent; the first call wins).
 */
export class ChatTurnRecorder {
  private raw = ""
  private readonly tools: { name: string; ms: number }[] = []
  private finished: Promise<boolean> | null = null

  constructor(
    readonly threadId: string,
    private readonly save: (threadId: string, turn: AssistantTurn) => Promise<boolean> = recordAssistantMessage
  ) {}

  append(text: string): void {
    if (this.finished || this.raw.length >= CHAT_CONTENT_MAX) return
    this.raw += text
  }

  tool(name: string, ms: number): void {
    if (!this.finished) this.tools.push({ name, ms })
  }

  finish(opts: { partial: boolean }): Promise<boolean> {
    this.finished ??= this.save(this.threadId, { raw: this.raw, tools: this.tools, partial: opts.partial })
    return this.finished
  }
}

/**
 * Chat route entry, called once the model has started answering: stores the
 * request's final user message (creating the thread on the first one) and
 * returns the recorder for the answer. Null when the request does not end
 * with a user message or storing failed — the chat then still works, only
 * unsaved (logged).
 */
export async function beginChatRecording(
  owner: ThreadOwner,
  threadId: string | null,
  lastMessage: { role: string; content: string } | undefined
): Promise<ChatTurnRecorder | null> {
  if (!lastMessage || lastMessage.role !== "user") return null
  try {
    return new ChatTurnRecorder(await recordUserMessage(owner, threadId, lastMessage.content))
  } catch (err) {
    log.warn("chat message not stored", { projectId: owner.projectId, threadId, error: err instanceof Error ? err.message : String(err) })
    return null
  }
}
