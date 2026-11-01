import { z } from "zod"
import { baseScheduleSchema } from "@/lib/plan-schedule/base-schedule"
import { templateContentSchema } from "@/lib/plan-templates/schema"

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

export const createIceboxProposalSchema = z.object({
  kind: z.literal("create_icebox"),
  proposalId: id,
  request: z.string().min(1).max(5000),
  background: z.string().max(5000),
  reason: z.string().max(1000),
})

/** Put a PBI into a sprint, or take it out again. */
export const sprintPbiProposalSchema = z.object({
  kind: z.literal("sprint_pbi"),
  proposalId: id,
  action: z.enum(["add", "remove"]),
  pbi: pbiRef,
  sprint: z.object({ id, name: shortText }),
  /** Tasks removed together with the PBI (action "remove"). */
  taskCount: z.number().int().min(0).optional(),
  reason: z.string().max(1000),
})

/** "YYYY-MM-DD"; null = 日程未定. */
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
const planRef = z.object({ id, name: shortText })
const period = z.object({ plannedStart: day.nullable(), plannedEnd: day.nullable() })

export const PLAN_OP_MAX = 20
export const SHIFT_FOLLOWERS = ["none", "dependents", "later"] as const

const planCreateOp = z.object({
  op: z.literal("create"),
  name: z.string().min(1).max(255),
  parent: planRef.nullable(),
  plannedStart: day.nullable(),
  plannedEnd: day.nullable(),
  isMilestone: z.boolean(),
  durationDays: z.number().int().min(1).max(3650).nullable(),
})

const planUpdateOp = z.object({
  op: z.literal("update"),
  target: planRef,
  /** Optimistic-lock version read when the proposal was made. */
  version: z.number().int().min(0),
  changes: z.object({
    name: z.string().min(1).max(255).optional(),
    plannedStart: day.nullable().optional(),
    plannedEnd: day.nullable().optional(),
    status: z.string().max(32).optional(),
  }),
  before: period.extend({ name: shortText, status: z.string().max(32) }),
})

/** Move one item by whole days (the server did the date arithmetic), optionally with the rows after it. */
const planShiftOp = z.object({
  op: z.literal("shift"),
  target: planRef,
  version: z.number().int().min(0),
  days: z.number().int().min(-3650).max(3650),
  before: period,
  after: period,
  followers: z.enum(SHIFT_FOLLOWERS),
})

/** 依存関係で再計算: the server moves every violating successor later (POST /plan/reflow). Stands alone on its card. */
const planReflowOp = z.object({ op: z.literal("reflow") })

export const planOpSchema = z.discriminatedUnion("op", [planCreateOp, planUpdateOp, planShiftOp, planReflowOp])

export const planEditProposalSchema = z.object({
  kind: z.literal("plan_edit"),
  proposalId: id,
  ops: z.array(planOpSchema).min(1).max(PLAN_OP_MAX),
  reason: z.string().max(1000),
})

export const sprintScheduleProposalSchema = z.object({
  kind: z.literal("sprint_schedule"),
  proposalId: id,
  sprint: z.object({ id, name: shortText }),
  version: z.number().int().min(0),
  before: z.object({ startDate: day, endDate: day }),
  after: z.object({ startDate: day, endDate: day }),
  reason: z.string().max(1000),
})

export const createTemplateProposalSchema = z.object({
  kind: z.literal("create_template"),
  proposalId: id,
  name: z.string().min(1).max(255),
  description: z.string().max(2000),
  visibility: z.enum(["public", "private"]),
  content: templateContentSchema,
  stageCount: z.number().int().min(0),
  reason: z.string().max(1000),
})

/**
 * Load a base schedule (W12: phases, milestones, relative durations, dependencies from a spec template's
 * `schedule.yml`) into 全体計画 from a start date. Approving POSTs the schedule to /plan/load; the server
 * recomputes the dates, so `preview` (top-level rows with their dates) is display only.
 */
export const planLoadProposalSchema = z.object({
  kind: z.literal("plan_load"),
  proposalId: id,
  name: z.string().max(255),
  startDate: day,
  itemCount: z.number().int().min(1).max(500),
  dependencyCount: z.number().int().min(0),
  plannedStart: day,
  plannedEnd: day,
  schedule: baseScheduleSchema,
  preview: z.array(z.object({ name: shortText, plannedStart: day, plannedEnd: day, isMilestone: z.boolean(), children: z.number().int().min(0), childNames: z.array(shortText).max(5).optional() })).max(60),
  reason: z.string().max(1000),
})

export const chatProposalSchema = z.discriminatedUnion("kind", [
  createPbiProposalSchema,
  taskSplitProposalSchema,
  statusChangeProposalSchema,
  createIceboxProposalSchema,
  sprintPbiProposalSchema,
  planEditProposalSchema,
  sprintScheduleProposalSchema,
  createTemplateProposalSchema,
  planLoadProposalSchema,
])

export type CreatePbiProposal = z.infer<typeof createPbiProposalSchema>
export type TaskSplitProposal = z.infer<typeof taskSplitProposalSchema>
export type StatusChangeProposal = z.infer<typeof statusChangeProposalSchema>
export type CreateIceboxProposal = z.infer<typeof createIceboxProposalSchema>
export type SprintPbiProposal = z.infer<typeof sprintPbiProposalSchema>
export type PlanOp = z.infer<typeof planOpSchema>
export type PlanEditProposal = z.infer<typeof planEditProposalSchema>
export type SprintScheduleProposal = z.infer<typeof sprintScheduleProposalSchema>
export type CreateTemplateProposal = z.infer<typeof createTemplateProposalSchema>
export type PlanLoadProposal = z.infer<typeof planLoadProposalSchema>
export type ChatProposal = z.infer<typeof chatProposalSchema>
export type ChatProposalKind = ChatProposal["kind"]

/**
 * Out-of-band server event carried in the chat text stream.
 * `status` is the live one-line progress ("reading file …"); empty text clears it.
 * Status frames are transient: the server sends them without recording them.
 */
export type ChatUiEvent = { type: "proposal"; proposal: ChatProposal } | { type: "status"; text: string }

const STATUS_MAX_CHARS = 200

/**
 * Progress hints (`_🔧 tool_name_`) that older versions wrote into the answer
 * text. Stored threads still contain them; removing them keeps them out of the
 * display and — more importantly — out of the history the model imitates.
 */
const LEGACY_TOOL_HINT = /^[ \t]*_🔧[^\n]*_[ \t]*(?:\r?\n|$)/gm

/** Remove legacy tool-hint lines and tidy the blank lines they leave behind. */
export function stripToolHints(text: string): string {
  if (!text.includes("🔧")) return text
  const stripped = text.replace(LEGACY_TOOL_HINT, "")
  return stripped === text ? text : stripped.replace(/\n{3,}/g, "\n\n").trim()
}

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
  const v = value as { type?: unknown; proposal?: unknown; text?: unknown }
  if (v.type === "status") {
    return typeof v.text === "string" ? { type: "status", text: v.text.slice(0, STATUS_MAX_CHARS) } : null
  }
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
  if (!raw.includes(FRAME_MARK)) return { text: stripToolHints(raw), events: [] }
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
  return { text: stripToolHints(text), events }
}

/** The latest live status of a decoded stream (empty string = cleared / none). */
export function statusOf(events: readonly ChatUiEvent[]): string {
  let status = ""
  for (const e of events) if (e.type === "status") status = e.text
  return status
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
export const PROPOSAL_TOOL_NAMES = [
  "propose_pbi",
  "propose_task_split",
  "propose_status_change",
  "propose_icebox",
  "propose_sprint_pbi",
  "propose_plan_edit",
  "propose_sprint_schedule",
  "propose_template",
] as const

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

// ── Proposal outcome (persisted with the stored thread) ─────────────────────

/**
 * What happened to a proposal, stored next to it in the thread (ChatMessage
 * toolEvents) so a re-opened thread shows the card as applied / rejected
 * instead of approvable again. `applying` is a short-lived reservation taken
 * before the REST calls run (two-phase: reserve → create → confirm; release
 * on failure) — a second approval of the same proposal gets 409 meanwhile.
 */
export const PROPOSAL_OUTCOME_STATUSES = ["applying", "applied", "rejected"] as const
export type ProposalOutcomeStatus = (typeof PROPOSAL_OUTCOME_STATUSES)[number]

export const proposalOutcomeSchema = z.object({
  status: z.enum(PROPOSAL_OUTCOME_STATUSES),
  /** Created PBI / first created task / changed target; null while applying or when rejected. */
  appliedEntityId: id.nullable(),
  /** ISO time of the last transition. */
  at: z.string().max(40),
  /** User id who made the transition. */
  by: id,
})

export type ProposalOutcome = z.infer<typeof proposalOutcomeSchema>

/** Validate an unknown value as an outcome (null when malformed). */
export function parseProposalOutcome(value: unknown): ProposalOutcome | null {
  const parsed = proposalOutcomeSchema.safeParse(value)
  return parsed.success ? parsed.data : null
}
