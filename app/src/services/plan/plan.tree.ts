/**
 * get_plan (MCP, W12): the master plan (全体計画) as a tree with dates, status and dependencies.
 * Read only. A node's `dependsOn` lists the ids of the items that must finish first (finish to start).
 */
import { toDateKeyOrNull } from "@/lib/plan-progress"
import { defaultDb } from "@/services/_shared/db"
import { LIST_LIMITS } from "@/services/_shared/limits"
import * as repo from "./plan.repository"

export interface PlanTreeNode {
  id: string
  name: string
  status: string
  progressPct: number
  isMilestone: boolean
  /** "YYYY-MM-DD"; null = 日程未定. */
  plannedStart: string | null
  plannedEnd: string | null
  durationDays: number | null
  owner: { id: string; name: string | null } | null
  dependsOn: string[]
  children: PlanTreeNode[]
}

export interface PlanTree {
  data: PlanTreeNode[]
  itemCount: number
  /** The plan has more rows than one answer carries. */
  truncated: boolean
}

interface Row {
  id: string
  parentId: string | null
  name: string
  status: string
  progressPct: number
  isMilestone: boolean
  plannedStart: Date | null
  plannedEnd: Date | null
  durationDays: number | null
  owner?: { id: string; name: string | null } | null
}

/** Pure: flat rows (display order) + dependencies → tree. A row whose parent is missing becomes a root. */
export function buildPlanTree(rows: readonly Row[], dependencies: ReadonlyArray<{ predecessorId: string; successorId: string }>): PlanTreeNode[] {
  const ids = new Set(rows.map((r) => r.id))
  const deps = new Map<string, string[]>()
  for (const d of dependencies) if (ids.has(d.predecessorId) && ids.has(d.successorId)) deps.set(d.successorId, [...(deps.get(d.successorId) ?? []), d.predecessorId])
  const nodes = new Map<string, PlanTreeNode>(
    rows.map((r) => [
      r.id,
      {
        id: r.id,
        name: r.name,
        status: r.status,
        progressPct: r.progressPct,
        isMilestone: r.isMilestone,
        plannedStart: toDateKeyOrNull(r.plannedStart),
        plannedEnd: toDateKeyOrNull(r.plannedEnd),
        durationDays: r.durationDays,
        owner: r.owner ? { id: r.owner.id, name: r.owner.name } : null,
        dependsOn: deps.get(r.id) ?? [],
        children: [],
      },
    ])
  )
  const roots: PlanTreeNode[] = []
  for (const r of rows) {
    const node = nodes.get(r.id) as PlanTreeNode
    const parent = r.parentId ? nodes.get(r.parentId) : undefined
    if (parent) parent.children.push(node)
    else roots.push(node)
  }
  return roots
}

export async function getPlanTree(projectId: string): Promise<PlanTree> {
  const [rows, dependencies] = await Promise.all([repo.findPlanItems(defaultDb, projectId), repo.findDependencies(defaultDb, projectId)])
  return { data: buildPlanTree(rows, dependencies), itemCount: rows.length, truncated: rows.length >= LIST_LIMITS.planItems }
}
