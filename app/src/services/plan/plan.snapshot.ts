/**
 * Shared helpers of the scheduling-assist services (reflow / bulk / import):
 * the live plan as pure ShiftNodes (dependencies whose end is in the trash
 * are dropped) and the owner membership guard.
 */
import { toDateKeyOrNull } from "@/lib/plan-progress"
import type { ShiftNode } from "@/lib/plan-shift"
import type { Db } from "@/services/_shared/db"
import { ValidationError } from "@/services/_shared/errors"
import * as repo from "./plan.repository"

export interface PlanSnapshot {
  rows: Awaited<ReturnType<typeof repo.findPlanItems>>
  nodes: Array<ShiftNode & { name: string }>
  deps: Array<{ id: string; predecessorId: string; successorId: string }>
}

/** The live rows, their ShiftNodes and the live-to-live dependencies of a project. */
export async function loadPlanSnapshot(tx: Db, projectId: string): Promise<PlanSnapshot> {
  const [rows, allDeps] = await Promise.all([repo.findPlanItems(tx, projectId), repo.findDependencies(tx, projectId)])
  const nodes = rows.map((r) => ({
    id: r.id,
    name: r.name,
    parentId: r.parentId,
    plannedStart: toDateKeyOrNull(r.plannedStart),
    plannedEnd: toDateKeyOrNull(r.plannedEnd),
    actualStart: toDateKeyOrNull(r.actualStart),
    actualEnd: toDateKeyOrNull(r.actualEnd),
    status: r.status,
  }))
  const live = new Set(nodes.map((n) => n.id))
  return { rows, nodes, deps: allDeps.filter((d) => live.has(d.predecessorId) && live.has(d.successorId)) }
}

/** 400 PLAN_OWNER_NOT_MEMBER unless the owner is a member of the project (same rule as plan.service). */
export async function assertOwnerMember(tx: Db, projectId: string, ownerId: string | null | undefined): Promise<void> {
  if (!ownerId) return
  if (!(await repo.isProjectMember(tx, projectId, ownerId))) {
    throw new ValidationError("担当者はプロジェクトメンバーから選択してください", {}, "PLAN_OWNER_NOT_MEMBER")
  }
}
