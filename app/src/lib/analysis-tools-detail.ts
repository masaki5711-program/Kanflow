import { prisma } from "@/lib/prisma"
import { assigneeNamesOf } from "@/lib/assignees"
import type { ToolDefinition, ToolHandler, ToolHandlerArgs } from "@/lib/chat-tools-types"
import { NOT_DELETED } from "@/services/_shared/soft-delete"

/**
 * Chat tool `get_work_item_details`: everything written on ONE PBI, IceBox
 * request or sprint task (user story, acceptance criteria, reference material,
 * PO notes, tasks, dependencies, attachments, Git activity). `search_work_items`
 * only returns titles — without this the model had nothing to answer
 * "what exactly does PBI #25 do?" with and started guessing.
 */

/** Long free text is cut so one item cannot flood the context. */
const TEXT_MAX = 4000
const TASKS_MAX = 50
const LINKS_MAX = 15

function text(s: string | null | undefined): string | null {
  const t = s?.trim()
  if (!t) return null
  return t.length <= TEXT_MAX ? t : `${t.slice(0, TEXT_MAX)}…(truncated)`
}

export const DETAIL_TOOL_DEFS: ToolDefinition[] = [
  {
    type: "function",
    function: {
      name: "get_work_item_details",
      description:
        "Full content of ONE work item of this project: a PBI (user story, acceptance criteria, reference material, PO comment, not-ready reason, epic, goal, plan item, dependencies, its sprint tasks, attached reference files, linked GitLab merge requests), an IceBox request (request, background, policy/planning docs, PO memos), or a sprint task (name, status, assignees, hours, completion comment, its PBI). Call this whenever the user asks what an item is about / what it does / its details. Find the number with `search_work_items` first if needed.",
      parameters: {
        type: "object",
        properties: {
          kind: { type: "string", enum: ["pbi", "icebox", "task"], description: "Item type." },
          id: { type: "string", description: "PBI / IceBox number (e.g. \"25\" or \"#25\"), or the task_id returned by search_work_items." },
        },
        required: ["kind", "id"],
      },
    },
  },
]

function displayNumber(raw: unknown): number | null {
  const n = Number(String(raw ?? "").replace(/^#/, "").trim())
  return Number.isInteger(n) && n > 0 ? n : null
}

async function pbiDetails(projectId: string, displayId: number) {
  const pbi = await prisma.productBacklogItem.findFirst({
    where: { projectId, displayId, ...NOT_DELETED },
    include: {
      productGoal: { select: { title: true } },
      planItem: { select: { name: true } },
      iceboxItem: { select: { displayId: true, request: true } },
      attachments: { select: { id: true, originalName: true, mimeType: true } },
      predecessorDeps: { select: { predecessor: { select: { displayId: true, initiative: true, status: true } } } },
      successorDeps: { select: { successor: { select: { displayId: true, initiative: true, status: true } } } },
      sprintItems: {
        take: TASKS_MAX,
        orderBy: { createdAt: "asc" },
        select: { id: true, taskName: true, status: true, assignee: true, assignees: { select: { user: { select: { name: true } } } }, sprint: { select: { sprintName: true, status: true } } },
      },
      gitLinks: {
        where: { kind: "mr" },
        take: LINKS_MAX,
        orderBy: { occurredAt: "desc" },
        select: { title: true, state: true, pipeline: true, author: true, repository: { select: { name: true } } },
      },
    },
  })
  if (!pbi) return { error: `PBI #${displayId} not found in this project` }
  return {
    type: "pbi",
    id: `#${pbi.displayId}`,
    status: pbi.status,
    story_points: pbi.workloadScore,
    initiative: pbi.initiative,
    epic: pbi.epic,
    user_story: text(pbi.userStory),
    acceptance_criteria: text(pbi.acceptanceCriteria),
    reference_material: text(pbi.referenceDoc),
    reference_files: pbi.attachments.map((a) => ({ attachment_id: a.id, name: a.originalName, mime: a.mimeType })),
    po: pbi.assignedPo,
    po_comment: text(pbi.poNote),
    not_ready_reason: text(pbi.notReadyReason),
    product_goal: pbi.productGoal?.title ?? null,
    plan_item: pbi.planItem?.name ?? null,
    from_icebox: pbi.iceboxItem ? { id: `#${pbi.iceboxItem.displayId}`, request: text(pbi.iceboxItem.request) } : null,
    blocked_by: pbi.predecessorDeps.map((d) => ({ id: `#${d.predecessor.displayId}`, title: d.predecessor.initiative, status: d.predecessor.status })),
    blocks: pbi.successorDeps.map((d) => ({ id: `#${d.successor.displayId}`, title: d.successor.initiative, status: d.successor.status })),
    tasks: pbi.sprintItems.map((t) => ({
      task_id: t.id,
      name: t.taskName,
      status: t.status,
      assignees: assigneeNamesOf(t).join(", ") || null,
      sprint: `${t.sprint.sprintName} (${t.sprint.status})`,
    })),
    merge_requests: pbi.gitLinks.map((l) => ({ title: l.title, state: l.state, pipeline: l.pipeline, author: l.author, repository: l.repository.name })),
  }
}

async function iceboxDetails(projectId: string, displayId: number) {
  const item = await prisma.iceboxItem.findFirst({
    where: { projectId, displayId, ...NOT_DELETED },
    include: { attachments: { select: { originalName: true } }, backlogItems: { where: NOT_DELETED, select: { displayId: true, initiative: true, status: true } } },
  })
  if (!item) return { error: `IceBox #${displayId} not found in this project` }
  return {
    type: "icebox",
    id: `#${item.displayId}`,
    status: item.status,
    author: item.author,
    request: text(item.request),
    background: text(item.background),
    policy_doc: text(item.policyDoc),
    planning_doc: text(item.planningDoc),
    po: item.assignedPo,
    po_hearing_memo: text(item.poHearingMemo),
    po_review_memo: text(item.poReviewMemo),
    rejection_reason: text(item.rejectionReason),
    freeze_reason: text(item.freezeReason),
    epic: item.pbEpic,
    attachments: item.attachments.map((a) => a.originalName),
    became_pbis: item.backlogItems.map((b) => ({ id: `#${b.displayId}`, title: b.initiative, status: b.status })),
  }
}

async function taskDetails(projectId: string, taskId: string) {
  const task = await prisma.sprintBacklogItem.findFirst({
    where: { id: taskId, sprint: { projectId }, pbItem: NOT_DELETED },
    include: {
      assignees: { select: { user: { select: { name: true } } } },
      sprint: { select: { sprintName: true, status: true, startDate: true, endDate: true } },
      pbItem: { select: { displayId: true, initiative: true, userStory: true } },
    },
  })
  if (!task) return { error: `task ${taskId} not found in this project` }
  return {
    type: "task",
    task_id: task.id,
    name: task.taskName,
    status: task.status,
    assignees: assigneeNamesOf(task).join(", ") || null,
    estimated_hours: task.estimatedHours,
    actual_hours: task.actualHours,
    completion_comment: text(task.completionComment),
    sprint: { name: task.sprint.sprintName, status: task.sprint.status, start: task.sprint.startDate.toISOString().slice(0, 10), end: task.sprint.endDate.toISOString().slice(0, 10) },
    pbi: { id: `#${task.pbItem.displayId}`, title: task.pbItem.initiative, user_story: text(task.pbItem.userStory) },
  }
}

export const detailHandlers: Record<string, ToolHandler> = {
  async get_work_item_details({ projectId, args }: ToolHandlerArgs) {
    const kind = args.kind
    if (kind === "task") {
      const id = typeof args.id === "string" ? args.id.trim() : ""
      if (!id) return JSON.stringify({ error: "id (task_id) is required" })
      return JSON.stringify(await taskDetails(projectId, id))
    }
    const n = displayNumber(args.id)
    if (n === null) return JSON.stringify({ error: "id must be a number like 25 or #25" })
    if (kind === "pbi") return JSON.stringify(await pbiDetails(projectId, n))
    if (kind === "icebox") return JSON.stringify(await iceboxDetails(projectId, n))
    return JSON.stringify({ error: "kind must be pbi, icebox or task" })
  },
}
