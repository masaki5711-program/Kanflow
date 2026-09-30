import { createHash } from "node:crypto"
import { prisma } from "@/lib/prisma"
import { LIVE_PBI, NOT_DELETED } from "@/services/_shared/soft-delete"
import { PBI_STATUSES } from "@/services/backlog/backlog.schemas"
import { TASK_STATUSES } from "@/services/sprint-backlog/sprint-backlog.schemas"
import type { ToolDefinition, ToolHandler } from "@/lib/chat-tools-types"
import {
  PBI_POINT_SCALE,
  parseChatProposal,
  type ChatProposal,
  type CreatePbiProposal,
  type StatusChangeProposal,
  type TaskSplitProposal,
} from "@/lib/chat-proposals"
import { mostSimilar, parseDisplayId, strArg, trunc } from "@/lib/tool-helpers"

/**
 * Proposal pack (P3): approval-based writes. These tools NEVER write. They
 * validate the model's arguments against the project, then return
 * `{ proposal, note }`; the chat route forwards the proposal to the client
 * as an approval card (lib/chat-proposals.ts). Approving calls the normal
 * REST APIs with the user's own session, so permissions are enforced there.
 * Not offered to the autonomous agent (no human to approve).
 */

export const PROPOSAL_TOOL_DEFS: ToolDefinition[] = [
  {
    type: "function",
    function: {
      name: "propose_pbi",
      description:
        "Propose a NEW product backlog item for the user to approve. Does not create anything; the user sees an approval card. Use when the user asks to add/create/draft a PBI. Check list_backlog_items for duplicates first.",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string", description: "Short PBI title (initiative), max 200 chars." },
          user_story: { type: "string", description: "User story: As a …, I want …, so that …" },
          acceptance_criteria: { type: "string", description: "Acceptance criteria, one per line." },
          story_points: { type: "number", description: "Estimate on the scale 0,1,2,3,5,8,13,21 (optional)." },
          epic: { type: "string", description: "Optional epic name (reuse an existing one)." },
          reason: { type: "string", description: "Why this PBI is proposed (one sentence)." },
        },
        required: ["title"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "propose_task_split",
      description:
        "Propose splitting a PBI that is in an open sprint into sprint tasks with estimates. Does not create anything; the user approves on a card.",
      parameters: {
        type: "object",
        properties: {
          pbi_id: { type: "string", description: "PBI #number, e.g. #12." },
          tasks: {
            type: "array",
            description: "1-12 tasks: [{\"name\": \"...\", \"estimate\": 2}]",
            items: {
              type: "object",
              properties: { name: { type: "string" }, estimate: { type: "number" } },
              required: ["name"],
            },
          },
          reason: { type: "string", description: "Why this split (one sentence)." },
        },
        required: ["pbi_id", "tasks"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "propose_status_change",
      description:
        "Propose changing the status of a PBI (ready | not_ready | completed) or a sprint task (todo | in_progress | review | done). Does not change anything; the user approves on a card.",
      parameters: {
        type: "object",
        properties: {
          entity: { type: "string", description: "pbi | task" },
          id: { type: "string", description: "PBI #number, or the task id." },
          task_name: { type: "string", description: "For entity=task when the id is unknown (substring, open sprints only)." },
          new_status: { type: "string", description: "Target status." },
          reason: { type: "string", description: "Why (one sentence)." },
        },
        required: ["entity", "new_status"],
      },
    },
  },
]

const NOTE =
  "Shown to the user as an approval card. NOTHING has been written yet. Briefly summarize the proposal and ask the user to press Approve (承認) or Reject (却下) on the card. Do not claim it was created or changed."

const MAX_TASKS = 12
const OPEN_SPRINTS = ["planning", "active", "review"]

/** Stable id: same kind + payload → same id (a repeated proposal maps to one card state). */
export function proposalIdOf(kind: string, payload: unknown): string {
  return `prop_${createHash("sha256").update(`${kind}:${JSON.stringify(payload)}`).digest("hex").slice(0, 16)}`
}

function reply(proposal: ChatProposal): string {
  // Validate our own output against the shared schema (defense in depth: the
  // client drops anything that does not parse).
  const checked = parseChatProposal(proposal)
  if (!checked) return JSON.stringify({ error: "proposal failed validation; shorten the fields and try again" })
  return JSON.stringify({ proposal: checked, note: NOTE })
}

const err = (message: string) => JSON.stringify({ error: message })

// ── propose_pbi ─────────────────────────────────────────────────────────────

async function proposePbi(projectId: string, args: Record<string, unknown>): Promise<string> {
  const title = strArg(args.title, 200)
  if (!title) return err("title is required")
  let storyPoints: number | null = null
  if (args.story_points !== undefined && args.story_points !== null && args.story_points !== "") {
    const n = Number(args.story_points)
    if (!(PBI_POINT_SCALE as readonly number[]).includes(n)) return err(`story_points must be one of ${PBI_POINT_SCALE.join(", ")}`)
    storyPoints = n
  }
  const existing = await prisma.productBacklogItem.findMany({
    where: { projectId, ...NOT_DELETED },
    orderBy: { createdAt: "desc" },
    take: 300,
    select: { displayId: true, initiative: true, userStory: true },
  })
  const dupes = mostSimilar(
    title,
    existing.map((b) => ({ key: String(b.displayId), title: trunc(b.initiative || b.userStory, 120), displayId: b.displayId })),
    0.6,
    3,
  )
  const payload = {
    title,
    userStory: strArg(args.user_story, 2000) ?? "",
    acceptanceCriteria: strArg(args.acceptance_criteria, 5000) ?? "",
    storyPoints,
    epic: strArg(args.epic, 200) ?? null,
  }
  const proposal: CreatePbiProposal = {
    kind: "create_pbi",
    proposalId: proposalIdOf("create_pbi", payload),
    ...payload,
    reason: strArg(args.reason, 1000) ?? "",
    possibleDuplicates: dupes.map((d) => ({ displayId: d.displayId, title: d.title, similarity: d.similarity })),
  }
  return reply(proposal)
}

// ── propose_task_split ──────────────────────────────────────────────────────

type ParsedTask = { name: string; estimate: number | null }

/** Pure: validate the model's task list. */
export function parseTaskList(value: unknown): ParsedTask[] | { error: string } {
  if (!Array.isArray(value) || value.length === 0) return { error: "tasks must be a non-empty array" }
  if (value.length > MAX_TASKS) return { error: `at most ${MAX_TASKS} tasks` }
  const out: ParsedTask[] = []
  for (const raw of value) {
    const t = (typeof raw === "string" ? { name: raw } : raw) as { name?: unknown; estimate?: unknown }
    const name = strArg(t?.name, 200)
    if (!name) return { error: "every task needs a name" }
    let estimate: number | null = null
    if (t.estimate !== undefined && t.estimate !== null && t.estimate !== "") {
      const n = Number(t.estimate)
      if (!Number.isFinite(n) || n < 0 || n > 1000) return { error: `invalid estimate for "${name}"` }
      estimate = n
    }
    out.push({ name, estimate })
  }
  return out
}

async function findPbi(projectId: string, ref: unknown) {
  const displayId = parseDisplayId(ref)
  if (displayId === null) return null
  return prisma.productBacklogItem.findFirst({
    where: { projectId, displayId, ...NOT_DELETED },
    select: { id: true, displayId: true, initiative: true, userStory: true, status: true, version: true },
  })
}

async function proposeTaskSplit(projectId: string, args: Record<string, unknown>): Promise<string> {
  const tasks = parseTaskList(args.tasks)
  if ("error" in tasks) return err(tasks.error)
  const pbi = await findPbi(projectId, args.pbi_id)
  if (!pbi) return err("PBI not found in this project (use its #number)")
  const inSprint = await prisma.sprintBacklogItem.findMany({
    where: { pbItemId: pbi.id, sprint: { projectId, status: { in: OPEN_SPRINTS } } },
    select: { taskName: true, sprint: { select: { id: true, sprintName: true, startDate: true } } },
  })
  if (inSprint.length === 0) {
    return err(`PBI #${pbi.displayId} is not in an open sprint; tasks can only be created in a sprint. Tell the user to add it to a sprint first.`)
  }
  const sprint = [...inSprint].sort((a, b) => b.sprint.startDate.getTime() - a.sprint.startDate.getTime())[0].sprint
  const existing = new Set(
    inSprint.filter((t) => t.sprint.id === sprint.id && t.taskName).map((t) => (t.taskName ?? "").trim().toLowerCase())
  )
  const fresh = tasks.filter((t) => !existing.has(t.name.toLowerCase()))
  const skipped = tasks.filter((t) => existing.has(t.name.toLowerCase())).map((t) => t.name)
  if (fresh.length === 0) return err("all proposed tasks already exist on this PBI")
  const pbiRef = { id: pbi.id, displayId: pbi.displayId, title: trunc(pbi.initiative || pbi.userStory, 120) || "(untitled)" }
  const payload = { pbiId: pbi.id, sprintId: sprint.id, tasks: fresh }
  const proposal: TaskSplitProposal = {
    kind: "task_split",
    proposalId: proposalIdOf("task_split", payload),
    pbi: pbiRef,
    sprint: { id: sprint.id, name: trunc(sprint.sprintName, 120) },
    tasks: fresh,
    skippedExisting: skipped,
    reason: strArg(args.reason, 1000) ?? "",
  }
  return reply(proposal)
}

// ── propose_status_change ───────────────────────────────────────────────────

async function findTask(projectId: string, args: Record<string, unknown>) {
  const taskId = strArg(args.id, 64)
  const name = strArg(args.task_name, 100)
  if (!taskId && !name) return { error: "task needs id or task_name" }
  const rows = await prisma.sprintBacklogItem.findMany({
    where: {
      sprint: { projectId, ...(taskId ? {} : { status: { in: OPEN_SPRINTS } }) },
      ...LIVE_PBI,
      ...(taskId ? { id: taskId } : { taskName: { contains: name } }),
    },
    select: { id: true, taskName: true, status: true, version: true, sprintId: true },
    take: 5,
  })
  const real = rows.filter((r) => (r.taskName ?? "").trim())
  if (real.length === 0) return { error: "task not found" }
  if (real.length > 1) {
    return { error: `ambiguous task name; ask the user which one: ${real.map((r) => `${r.id} "${trunc(r.taskName, 40)}"`).join(", ")}` }
  }
  return { task: real[0] }
}

async function proposeStatusChange(projectId: string, args: Record<string, unknown>): Promise<string> {
  const entity = strArg(args.entity, 10)
  const toStatus = strArg(args.new_status, 32)
  const reason = strArg(args.reason, 1000) ?? ""
  if (entity === "pbi") {
    if (!toStatus || !(PBI_STATUSES as readonly string[]).includes(toStatus)) return err(`new_status for a PBI must be one of ${PBI_STATUSES.join(", ")}`)
    const pbi = await findPbi(projectId, args.id)
    if (!pbi) return err("PBI not found in this project (use its #number)")
    if (pbi.status === toStatus) return err(`PBI #${pbi.displayId} is already ${toStatus}`)
    const target = { id: pbi.id, title: trunc(pbi.initiative || pbi.userStory, 120) || "(untitled)", displayId: pbi.displayId, sprintId: null }
    const proposal: StatusChangeProposal = {
      kind: "status_change",
      proposalId: proposalIdOf("status_change", { entity, id: pbi.id, toStatus, version: pbi.version }),
      entity: "pbi", target, fromStatus: pbi.status, toStatus, version: pbi.version, reason,
    }
    return reply(proposal)
  }
  if (entity === "task") {
    if (!toStatus || !(TASK_STATUSES as readonly string[]).includes(toStatus)) return err(`new_status for a task must be one of ${TASK_STATUSES.join(", ")}`)
    const found = await findTask(projectId, args)
    if ("error" in found) return err(found.error ?? "task not found")
    const task = found.task
    if (task.status === toStatus) return err(`the task is already ${toStatus}`)
    const target = { id: task.id, title: trunc(task.taskName, 120), displayId: null, sprintId: task.sprintId }
    const proposal: StatusChangeProposal = {
      kind: "status_change",
      proposalId: proposalIdOf("status_change", { entity, id: task.id, toStatus, version: task.version }),
      entity: "task", target, fromStatus: task.status, toStatus, version: task.version, reason,
    }
    return reply(proposal)
  }
  return err("entity must be pbi | task")
}

export const proposalHandlers: Record<string, ToolHandler> = {
  propose_pbi: ({ projectId, args }) => proposePbi(projectId, args),
  propose_task_split: ({ projectId, args }) => proposeTaskSplit(projectId, args),
  propose_status_change: ({ projectId, args }) => proposeStatusChange(projectId, args),
}
