import { apiFetch, withVersion } from "@/hooks"
import type { ProjectAction } from "@/lib/authz/policy"
import type { ChatProposal } from "@/lib/chat-proposals"

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
  }
}

export interface ProposalRequest {
  url: string
  method: "POST" | "PATCH"
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
  }
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
  }
}

export interface ApplyResult {
  href: string
  /** Rows created (PBI / tasks); the target id for a status change. */
  ids: string[]
}

/** Thrown when a task split fails part-way: `done` tasks were created before `reason`. */
export class PartialApplyError extends Error {
  constructor(readonly done: number, readonly total: number, readonly ids: string[], readonly reason: unknown) {
    super(reason instanceof Error ? reason.message : "partial failure")
    this.name = "PartialApplyError"
  }
}

/** Run the requests sequentially (task order matters for the board). */
export async function applyProposal(projectId: string, proposal: ChatProposal): Promise<ApplyResult> {
  const requests = proposalRequests(projectId, proposal)
  const ids: string[] = []
  for (const req of requests) {
    try {
      const row = await apiFetch<{ id?: string }>(req.url, { method: req.method, json: req.json })
      if (row && typeof row.id === "string") ids.push(row.id)
    } catch (err) {
      if (ids.length > 0) throw new PartialApplyError(ids.length, requests.length, ids, err)
      throw err
    }
  }
  const resultIds = proposal.kind === "status_change" ? [proposal.target.id] : ids
  return { href: proposalResultHref(projectId, proposal, resultIds), ids: resultIds }
}
