import { allMergeRequestsMerged } from "./git-links"

/**
 * What the Git activity of a PBI says about its sprint tasks (pure).
 *  - start:           a branch / open MR exists but every task is still "todo"
 *  - complete:        every MR is merged but tasks are still open
 *  - pipeline_failed: an open MR whose pipeline failed
 *  - review_stale:    an open MR nobody touched for STALE_REVIEW_DAYS
 */
export const STALE_REVIEW_DAYS = 3
const DAY_MS = 86_400_000

export type GitHintKind = "start" | "complete" | "pipeline_failed" | "review_stale"

export interface InsightLink {
  kind: string
  ref: string
  title: string
  url: string
  state: string | null
  pipeline: string | null
  occurredAt: Date
}

export interface InsightHint {
  kind: GitHintKind
  /** Offered one-click action ("start" / "complete"); the warnings have none. */
  action: "start" | "complete" | null
  mr?: { ref: string; title: string; url: string; days?: number }
}

const isOpen = (state: string | null) => state === "opened" || state === "locked"

export function deriveGitHints(taskStatuses: readonly string[], links: readonly InsightLink[], now: Date): InsightHint[] {
  const hints: InsightHint[] = []
  const mrs = links.filter((l) => l.kind === "mr")
  const openMrs = mrs.filter((l) => isOpen(l.state))
  const hasTasks = taskStatuses.length > 0
  const allTodo = hasTasks && taskStatuses.every((s) => s === "todo")
  const hasOpenTask = taskStatuses.some((s) => s !== "done")

  if (hasTasks && allTodo && (openMrs.length > 0 || links.some((l) => l.kind === "branch"))) hints.push({ kind: "start", action: "start" })
  if (hasOpenTask && allMergeRequestsMerged(mrs.map((m) => m.state))) hints.push({ kind: "complete", action: "complete" })
  for (const mr of openMrs) {
    const ref = { ref: mr.ref, title: mr.title, url: mr.url }
    if (mr.pipeline === "failed") hints.push({ kind: "pipeline_failed", action: null, mr: ref })
    const days = Math.floor((now.getTime() - mr.occurredAt.getTime()) / DAY_MS)
    if (days >= STALE_REVIEW_DAYS) hints.push({ kind: "review_stale", action: null, mr: { ...ref, days } })
  }
  return hints
}
