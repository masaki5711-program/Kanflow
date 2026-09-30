/**
 * Baseline snapshots and finish-to-start dependencies of the master plan.
 * Dependencies are informational (drawn on the Gantt); nothing is rescheduled.
 */
import type { Actor } from "@/services/_shared/actor"
import { logActivity } from "@/services/_shared/activity"
import { withTransaction, type Db } from "@/services/_shared/db"
import { ConflictError, NotFoundError, ValidationError } from "@/services/_shared/errors"
import type { TreeNode } from "@/services/_shared/tree"
import type { PlanDependencyDto } from "./plan.dto"
import * as repo from "./plan.repository"
import { planItemNotFound } from "./plan.rules"

// ── baseline ────────────────────────────────────────────────────────────────

/** POST /plan/baseline: copy planned dates into the baseline (whole project, or `itemIds`). */
export async function setBaseline(projectId: string, itemIds: readonly string[] | undefined, actor: Actor): Promise<{ updated: number }> {
  return withTransaction(async (tx) => {
    const updated = await repo.copyBaseline(tx, projectId, itemIds)
    await logActivity(tx, {
      projectId,
      entityType: "project",
      entityId: projectId,
      action: "update",
      actor,
      diff: { changes: { planBaseline: { changed: true } }, meta: { count: updated, scope: itemIds ? "items" : "project" } },
    })
    return { updated }
  })
}

/** DELETE /plan/baseline: clear every baseline of the project. */
export async function clearBaseline(projectId: string, actor: Actor): Promise<{ updated: number }> {
  return withTransaction(async (tx) => {
    const updated = await repo.clearBaseline(tx, projectId)
    await logActivity(tx, {
      projectId,
      entityType: "project",
      entityId: projectId,
      action: "update",
      actor,
      diff: { changes: { planBaseline: { from: "set", to: null } }, meta: { count: updated } },
    })
    return { updated }
  })
}

// ── dependencies ────────────────────────────────────────────────────────────

type Edge = Pick<PlanDependencyDto, "predecessorId" | "successorId">

/** Pure: true when `from` reaches `to` over the edges (cycle-safe BFS). */
export function reaches(edges: readonly Edge[], from: string, to: string): boolean {
  const next = new Map<string, string[]>()
  for (const e of edges) next.set(e.predecessorId, [...(next.get(e.predecessorId) ?? []), e.successorId])
  const seen = new Set<string>()
  const queue = [from]
  while (queue.length > 0) {
    const cur = queue.shift() as string
    if (cur === to) return true
    if (seen.has(cur)) continue
    seen.add(cur)
    queue.push(...(next.get(cur) ?? []))
  }
  return false
}

/** Pure: true when one item is an ancestor of the other in the plan tree. */
export function isAncestorPair(tree: readonly TreeNode[], a: string, b: string): boolean {
  const parentOf = new Map(tree.map((n) => [n.id, n.parentId]))
  const hasAncestor = (child: string, ancestor: string) => {
    const seen = new Set<string>()
    let cursor = parentOf.get(child) ?? null
    while (cursor && !seen.has(cursor)) {
      if (cursor === ancestor) return true
      seen.add(cursor)
      cursor = parentOf.get(cursor) ?? null
    }
    return false
  }
  return hasAncestor(a, b) || hasAncestor(b, a)
}

/**
 * Pure guard for a new dependency: both items live in the project (404),
 * not the same item / not parent-child (400 PLAN_DEPENDENCY_INVALID), no
 * duplicate (409 PLAN_DEPENDENCY_EXISTS) and no cycle over ALL existing
 * dependencies, trashed ends included (400 PLAN_DEPENDENCY_CYCLE).
 */
export function assertValidDependency(tree: readonly TreeNode[], edges: readonly Edge[], dep: Edge): void {
  const ids = new Set(tree.map((n) => n.id))
  if (!ids.has(dep.predecessorId) || !ids.has(dep.successorId)) throw planItemNotFound()
  if (dep.predecessorId === dep.successorId || isAncestorPair(tree, dep.predecessorId, dep.successorId)) {
    throw new ValidationError("この 2 項目の間には依存関係を設定できません", {}, "PLAN_DEPENDENCY_INVALID")
  }
  if (edges.some((e) => e.predecessorId === dep.predecessorId && e.successorId === dep.successorId)) {
    throw new ConflictError("この依存関係は既に存在します", {}, "PLAN_DEPENDENCY_EXISTS")
  }
  if (reaches(edges, dep.successorId, dep.predecessorId)) {
    throw new ValidationError("依存関係が循環します", {}, "PLAN_DEPENDENCY_CYCLE")
  }
}

async function logDependency(tx: Db, projectId: string, dep: PlanDependencyDto, change: "added" | "removed", actor: Actor) {
  await logActivity(tx, {
    projectId,
    entityType: "plan_item",
    entityId: dep.successorId,
    action: "update",
    actor,
    diff: { meta: { dependency: { [change]: dep.predecessorId } } },
  })
}

/** POST /plan/dependencies. */
export async function createDependency(projectId: string, dep: Edge, actor: Actor): Promise<PlanDependencyDto> {
  return withTransaction(async (tx) => {
    const [tree, edges] = await Promise.all([repo.findPlanTree(tx, projectId), repo.findDependencies(tx, projectId)])
    assertValidDependency(tree, edges, dep)
    const row = await repo.insertDependency(tx, { projectId, ...dep })
    await logDependency(tx, projectId, row, "added", actor)
    return row
  })
}

/** DELETE /plan/dependencies/:id (404 when it is not a dependency of the project). */
export async function deleteDependency(projectId: string, id: string, actor: Actor): Promise<void> {
  await withTransaction(async (tx) => {
    const row = await repo.findDependency(tx, projectId, id)
    if (!row) throw new NotFoundError()
    await repo.deleteDependency(tx, id)
    await logDependency(tx, projectId, row, "removed", actor)
  })
}
