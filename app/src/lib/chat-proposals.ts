import { z } from "zod"

/**
 * Approval-based write proposals of the AI chat (P3) — shared by the server
 * (proposal tools, chat route) and the client (chat page). Pure, no I/O.
 *
 * A proposal tool NEVER writes. It returns a structured proposal; the chat
 * route forwards it to the client as an out-of-band stream frame; the chat
 * page renders an approval card; approving calls the normal REST APIs under
 * the user's own permissions (no privilege escalation).
 *
 * ## Stream protocol (backward compatible)
 * The chat response stays `text/plain`. A server event is framed with the
 * ASCII record separator (U+001E) on both sides:
 *
 *     <text…>\u001e{"type":"proposal","proposal":{…}}\u001e<text…>
 *
 * The route strips U+001E from model output, so only the server can open a
 * frame — the model (or a prompt-injected attachment) cannot forge a card.
 * A client that does not know the protocol just shows the JSON; a stream
 * without frames decodes to exactly its text (old behavior).
 */

export const FRAME_MARK = "\u001e"

export const PBI_POINT_SCALE = [0, 1, 2, 3, 5, 8, 13, 21] as const

const id = z.string().min(1).max(64)
const shortText = z.string().max(500)

const pbiRef = z.object({ id, displayId: z.number().int(), title: shortText })

export const createPbiProposalSchema = z.object({
  kind: z.literal("create_pbi"),
  proposalId: id,
  title: z.string().min(1).max(200),
  userStory: z.string().max(2000),
  acceptanceCriteria: z.string().max(5000),
  storyPoints: z.number().int().min(0).max(100).nullable(),
  epic: z.string().max(200).nullable(),
  reason: z.string().max(1000),
  possibleDuplicates: z.array(z.object({ displayId: z.number().int(), title: shortText, similarity: z.number() })).max(5),
})

export const taskSplitProposalSchema = z.object({
  kind: z.literal("task_split"),
  proposalId: id,
  pbi: pbiRef,
  sprint: z.object({ id, name: shortText }),
  tasks: z.array(z.object({ name: z.string().min(1).max(200), estimate: z.number().min(0).max(1000).nullable() })).min(1).max(12),
  skippedExisting: z.array(shortText).max(12),
  reason: z.string().max(1000),
})

export const statusChangeProposalSchema = z.object({
  kind: z.literal("status_change"),
  proposalId: id,
  entity: z.enum(["pbi", "task"]),
  target: z.object({
    id,
    title: shortText,
    displayId: z.number().int().nullable(),
    /** Sprint of a task (needed for the task PATCH URL); null for a PBI. */
    sprintId: id.nullable(),
  }),
  fromStatus: z.string().max(32),
  toStatus: z.string().max(32),
  /** Optimistic-lock version read when the proposal was made (stale → 409 on approve). */
  version: z.number().int().min(0),
  reason: z.string().max(1000),
})

export const chatProposalSchema = z.discriminatedUnion("kind", [
  createPbiProposalSchema,
  taskSplitProposalSchema,
  statusChangeProposalSchema,
])

export type CreatePbiProposal = z.infer<typeof createPbiProposalSchema>
export type TaskSplitProposal = z.infer<typeof taskSplitProposalSchema>
export type StatusChangeProposal = z.infer<typeof statusChangeProposalSchema>
export type ChatProposal = z.infer<typeof chatProposalSchema>
export type ChatProposalKind = ChatProposal["kind"]

/** Out-of-band server event carried in the chat text stream. */
export type ChatUiEvent = { type: "proposal"; proposal: ChatProposal }

/** Validate an unknown value as a proposal (null when malformed). */
export function parseChatProposal(value: unknown): ChatProposal | null {
  const parsed = chatProposalSchema.safeParse(value)
  return parsed.success ? parsed.data : null
}

/** Serialize one event as a stream frame. */
export function encodeChatEvent(event: ChatUiEvent): string {
  return `${FRAME_MARK}${JSON.stringify(event)}${FRAME_MARK}`
}

/** Remove the frame mark from model output so the model cannot open a frame. */
export function sanitizeModelText(text: string): string {
  return text.includes(FRAME_MARK) ? text.split(FRAME_MARK).join("") : text
}

function parseEvent(raw: string): ChatUiEvent | null {
  let value: unknown
  try {
    value = JSON.parse(raw)
  } catch {
    return null
  }
  if (typeof value !== "object" || value === null) return null
  const v = value as { type?: unknown; proposal?: unknown }
  if (v.type !== "proposal") return null
  const proposal = parseChatProposal(v.proposal)
  return proposal ? { type: "proposal", proposal } : null
}

export interface DecodedChatStream {
  /** The visible text (frames removed). */
  text: string
  /** Complete, valid events in stream order (unknown / malformed frames are dropped). */
  events: ChatUiEvent[]
}

/**
 * Split the accumulated stream into text and events. An unterminated trailing
 * frame (still arriving) is hidden until its closing mark comes in.
 */
export function decodeChatStream(raw: string): DecodedChatStream {
  if (!raw.includes(FRAME_MARK)) return { text: raw, events: [] }
  const parts = raw.split(FRAME_MARK)
  // Even indexes are text, odd indexes are frame bodies. With an odd number
  // of marks the last part is an incomplete frame → dropped.
  const complete = parts.length % 2 === 1 ? parts : parts.slice(0, -1)
  let text = ""
  const events: ChatUiEvent[] = []
  complete.forEach((part, i) => {
    if (i % 2 === 0) {
      text += part
      return
    }
    const event = parseEvent(part)
    if (event) events.push(event)
  })
  return { text, events }
}

/** Unique proposals of a decoded stream (first occurrence of a proposalId wins). */
export function proposalsOf(events: readonly ChatUiEvent[]): ChatProposal[] {
  const seen = new Set<string>()
  const out: ChatProposal[] = []
  for (const e of events) {
    if (e.type !== "proposal" || seen.has(e.proposal.proposalId)) continue
    seen.add(e.proposal.proposalId)
    out.push(e.proposal)
  }
  return out
}

/** Names of the tools that return a proposal (see lib/proposal-tools.ts). */
export const PROPOSAL_TOOL_NAMES = ["propose_pbi", "propose_task_split", "propose_status_change"] as const

/**
 * The proposal inside a proposal tool's JSON result (`{ proposal: {...} }`),
 * or null (other tools, errors, malformed output).
 */
export function proposalFromToolResult(toolName: string, result: string): ChatProposal | null {
  if (!(PROPOSAL_TOOL_NAMES as readonly string[]).includes(toolName)) return null
  try {
    const value = JSON.parse(result) as { proposal?: unknown }
    return parseChatProposal(value?.proposal)
  } catch {
    return null
  }
}
