/** Home-page PO numbers (client-safe: no database import). See po-home-summary.ts. */
export interface PoHomeSummary {
  /** The only PO project (tiles link into it), or null with several. */
  singleProjectId: string | null
  /** Not-ready PBIs (refinement backlog). */
  notReady: number
  /** Sprints in the "review" state. */
  inReview: number
  /** Running (active) sprints. */
  activeSprints: number
  /** Real tasks (with a name) of the running sprints, and how many are done. */
  totalTasks: number
  doneTasks: number
}

/** Completion of the running sprints in % (null when they have no tasks). */
export function sprintCompletionPct(s: Pick<PoHomeSummary, "totalTasks" | "doneTasks">): number | null {
  if (s.totalTasks <= 0) return null
  return Math.round((s.doneTasks / s.totalTasks) * 100)
}
