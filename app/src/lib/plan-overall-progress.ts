/**
 * "計画進捗" (plan progress) of a whole project: the top-level plan items
 * rolled up exactly like a parent rolls up its children (rollupChildren —
 * duration-weighted, milestones weightless). One definition shared by the
 * portfolio, the project dashboard and the get_plan_progress AI tool, so a
 * manager sees the same number on every screen (A3-13).
 *
 * Pure and client-safe (plan-progress.ts only imports Prisma types).
 */
import { rollupChildren, type ChildState } from "./plan-progress"

export interface OverallPlanRow extends ChildState {
  id: string
  parentId: string | null
}

/** Rounded 0–100, or null without plan items. Rows whose parent is missing count as top level. */
export function planOverallProgress(rows: readonly OverallPlanRow[]): number | null {
  const ids = new Set(rows.map((r) => r.id))
  const roots = rows.filter((r) => !r.parentId || !ids.has(r.parentId))
  if (roots.length === 0) return null
  return rollupChildren(roots.map((r) => ({ ...r, progressPct: Math.min(100, Math.max(0, r.progressPct)) }))).progressPct
}
