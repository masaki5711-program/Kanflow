import { apiFetch, withVersion } from "@/hooks"
import type { ProjectAction } from "@/lib/authz/policy"
import type { ChatProposal, PlanOp } from "@/lib/chat-proposals"

/**
 * Applying an approved AI proposal = calling the normal REST APIs from the
 * browser with the user's own session. The server re-checks every permission
 * (backlog.write / task.write) and the optimistic-lock version, so a proposal
 * can never do more than the user could do by hand.
 */

/** The permission the approving user needs (mirrors the API route gates). */
export function requiredAction(proposal: ChatProposal): ProjectAction {
  switch (proposal.kind) {
    case "create_pbi":
      return "backlog.write"
    case "task_split":
      return "task.write"
    case "status_change":
      return proposal.entity === "pbi" ? "backlog.write" : "task.write"
    case "create_icebox":
      return "icebox.write"
    case "sprint_pbi":
    case "sprint_schedule":
      return "sprint.manage"
    case "plan_edit":
    case "plan_load":
      return "plan.write"
    case "create_template":
      return "project.view" // any signed-in user may create a template (POST /api/plan-templates)
  }
}

export interface ProposalRequest {
  url: string
  method: "POST" | "PATCH" | "DELETE"
  json: Record<string, unknown>
}

const nonEmpty = (s: string | null | undefined) => (s && s.trim() ? s : undefined)

/** Pure: the API calls that apply `proposal` (task splits: one POST per task, in order). */
export function proposalRequests(projectId: string, proposal: ChatProposal): ProposalRequest[] {
  const base = `/api/projects/${encodeURIComponent(projectId)}`
  switch (proposal.kind) {
    case "create_pbi":
      return [{
        url: `${base}/backlog`,
        method: "POST",
        json: Object.fromEntries(Object.entries({
          initiative: proposal.title,
          userStory: nonEmpty(proposal.userStory),
          acceptanceCriteria: nonEmpty(proposal.acceptanceCriteria),
          workloadScore: proposal.storyPoints ?? undefined,
          epic: nonEmpty(proposal.epic),
        }).filter(([, v]) => v !== undefined)),
      }]
    case "task_split":
      return proposal.tasks.map((task) => ({
        url: `${base}/sprints/${encodeURIComponent(proposal.sprint.id)}/tasks`,
        method: "POST",
        json: { pbItemId: proposal.pbi.id, taskName: task.name, estimatedHours: task.estimate },
      }))
    case "status_change": {
      const url = proposal.entity === "pbi"
        ? `${base}/backlog/${encodeURIComponent(proposal.target.id)}`
        : `${base}/sprints/${encodeURIComponent(proposal.target.sprintId ?? "")}/tasks/${encodeURIComponent(proposal.target.id)}`
      return [{ url, method: "PATCH", json: withVersion({ status: proposal.toStatus }, proposal.version) }]
    }
    case "create_icebox":
      return [{
        url: `${base}/icebox`,
        method: "POST",
        json: { request: proposal.request, ...(nonEmpty(proposal.background) && { background: proposal.background }) },
      }]
    case "sprint_pbi": {
      const url = `${base}/sprints/${encodeURIComponent(proposal.sprint.id)}/pbis`
      return [proposal.action === "add"
        ? { url, method: "POST", json: { pbIds: [proposal.pbi.id] } }
        : { url, method: "DELETE", json: { pbItemId: proposal.pbi.id } }]
    }
    case "plan_edit":
      return proposal.ops.flatMap((op) => planOpRequests(base, op))
    case "plan_load":
      return [{ url: `${base}/plan/load`, method: "POST", json: { startDate: proposal.startDate, schedule: proposal.schedule } }]
    case "sprint_schedule":
      return [{
        url: `${base}/sprints/${encodeURIComponent(proposal.sprint.id)}`,
        method: "PATCH",
        json: withVersion({ startDate: proposal.after.startDate, endDate: proposal.after.endDate }, proposal.version),
      }]
    case "create_template":
      return [{
        url: "/api/plan-templates",
        method: "POST",
        json: { name: proposal.name, description: nonEmpty(proposal.description) ?? null, visibility: proposal.visibility, content: proposal.content },
      }]
  }
}

/** Pure: the calls of one plan operation (a shift moves the item, then the rows after it). */
function planOpRequests(base: string, op: PlanOp): ProposalRequest[] {
  if (op.op === "create") {
    return [{
      url: `${base}/plan`,
      method: "POST",
      json: {
        name: op.name,
        parentId: op.parent?.id ?? null,
        plannedStart: op.plannedStart,
        plannedEnd: op.plannedEnd,
        isMilestone: op.isMilestone,
        ...(op.durationDays !== null && { durationDays: op.durationDays }),
      },
    }]
  }
  if (op.op === "reflow") return [{ url: `${base}/plan/reflow`, method: "POST", json: { apply: true } }]
  const url = `${base}/plan/${encodeURIComponent(op.target.id)}`
  if (op.op === "update") return [{ url, method: "PATCH", json: withVersion(op.changes, op.version) }]
  const move: ProposalRequest = {
    url,
    method: "PATCH",
    json: withVersion({ plannedStart: op.after.plannedStart, plannedEnd: op.after.plannedEnd }, op.version),
  }
  if (op.followers === "none") return [move]
  // Followers first: "later" cuts at the item's CURRENT end, which the move below would change.
  return [{ url: `${url}/shift-following`, method: "POST", json: { scope: op.followers, apply: true, deltaDays: op.days } }, move]
}

/** Pure: where the applied result lives (PBI deep link / task deep link). */
export function proposalResultHref(projectId: string, proposal: ChatProposal, createdIds: readonly string[]): string {
  const base = `/projects/${encodeURIComponent(projectId)}`
  switch (proposal.kind) {
    case "create_pbi":
      return `${base}/backlog?pbi=${encodeURIComponent(createdIds[0] ?? "")}`
    case "task_split":
      return `${base}/sprints?task=${encodeURIComponent(createdIds[0] ?? "")}`
    case "status_change":
      return proposal.entity === "pbi"
        ? `${base}/backlog?pbi=${encodeURIComponent(proposal.target.id)}`
        : `${base}/sprints?task=${encodeURIComponent(proposal.target.id)}`
    case "create_icebox":
      return `${base}/icebox`
    case "sprint_pbi":
    case "sprint_schedule":
      return `${base}/sprints`
    case "plan_edit":
    case "plan_load":
      return `${base}/plan`
    case "create_template":
      return "/templates"
  }
}

export interface ApplyResult {
  href: string
  /** Rows created (PBI / tasks); the target id for a status change. */
  ids: string[]
}

/** Thrown when a proposal fails part-way: `done` of `total` calls were applied before `reason`. */
export class PartialApplyError extends Error {
  constructor(readonly done: number, readonly total: number, readonly ids: string[], readonly reason: unknown) {
    super(reason instanceof Error ? reason.message : "partial failure")
    this.name = "PartialApplyError"
  }
}

/** Run the requests sequentially (task order matters for the board; a plan shift must precede its followers). */
export async function applyProposal(projectId: string, proposal: ChatProposal): Promise<ApplyResult> {
  const requests = proposalRequests(projectId, proposal)
  const ids: string[] = []
  let done = 0
  for (const req of requests) {
    try {
      const row = await apiFetch<{ id?: string }>(req.url, { method: req.method, json: req.json })
      done += 1
      if (row && typeof row.id === "string") ids.push(row.id)
    } catch (err) {
      if (done > 0) throw new PartialApplyError(done, requests.length, ids, err)
      throw err
    }
  }
  const resultIds = proposal.kind === "status_change" ? [proposal.target.id] : ids
  return { href: proposalResultHref(projectId, proposal, resultIds), ids: resultIds }
}
