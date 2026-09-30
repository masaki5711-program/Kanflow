/**
 * Plan item ↔ PBI links. A PBI belongs to at most one plan item
 * (ProductBacklogItem.planItemId); only leaf items (no live children) that
 * are not milestones take links. Every change recalculates the affected plan chains.
 */
import { recalcPlanProgress } from "@/lib/plan-progress"
import { parseDisplayId } from "@/lib/tool-helpers"
import type { Actor } from "@/services/_shared/actor"
import { labelOf, logActivity } from "@/services/_shared/activity"
import { defaultDb, withTransaction, type Db } from "@/services/_shared/db"
import { ValidationError } from "@/services/_shared/errors"
import * as repo from "./plan.repository"
import { milestoneLinkError, planItemNotFound } from "./plan.rules"

export interface PlanLinkedPbiDto {
  id: string
  displayId: number
  title: string
  status: string
  points: number
  sprint: { id: string; name: string } | null
}

export interface LinkablePbiDto {
  id: string
  displayId: number
  title: string
  status: string
  points: number
  planItem: { id: string; name: string } | null
}

const titleOf = (p: { initiative: string | null; userStory: string | null }) => (p.initiative?.trim() ? p.initiative : p.userStory ?? "")

const SPRINT_RANK: Readonly<Record<string, number>> = { active: 0, planning: 1 }

interface SprintRow {
  sprint: { id: string; sprintName: string; startDate: Date; status: string }
}

/** Pure: the sprint a PBI is "in": active first, then planning, then the most recent. */
export function currentSprintOf(rows: readonly SprintRow[]): { id: string; name: string } | null {
  const best = rows
    .map((r) => r.sprint)
    .toSorted((a, b) => (SPRINT_RANK[a.status] ?? 2) - (SPRINT_RANK[b.status] ?? 2) || b.startDate.getTime() - a.startDate.getTime())[0]
  return best ? { id: best.id, name: best.sprintName } : null
}

/**
 * The plan item a PBI may be linked to: live, same project (404
 * PLAN_ITEM_NOT_FOUND otherwise), not a milestone (400 PLAN_LINK_MILESTONE)
 * and a leaf (400 PLAN_LINK_REQUIRES_LEAF). Shared by PUT links, PBI PATCH
 * planItemId and the bulk linkPlan action.
 */
export async function assertLinkablePlanItem(db: Db, projectId: string, planItemId: string): Promise<void> {
  const item = await repo.findPlanItem(db, projectId, planItemId)
  if (!item) throw planItemNotFound()
  if (item.isMilestone) throw milestoneLinkError()
  if ((await repo.countPlanChildren(db, planItemId)) > 0) {
    throw new ValidationError("PBI は子項目を持たない項目にのみ紐付けられます", {}, "PLAN_LINK_REQUIRES_LEAF")
  }
}

/** GET /plan/:itemId/links. 404 for a missing / trashed item. */
export async function getPlanLinks(projectId: string, itemId: string, db: Db = defaultDb): Promise<{ pbis: PlanLinkedPbiDto[] }> {
  if (!(await repo.findPlanItem(db, projectId, itemId))) throw planItemNotFound()
  const rows = await repo.findLinkedPbisOfItem(db, projectId, itemId)
  return {
    pbis: rows.map((p) => ({
      id: p.id,
      displayId: p.displayId,
      title: titleOf(p),
      status: p.status,
      points: p.workloadScore ?? 0,
      sprint: currentSprintOf(p.sprintItems),
    })),
  }
}

async function logLinkChanges(
  tx: Db,
  projectId: string,
  changed: ReadonlyArray<{ id: string; displayId: number; userStory: string | null; from: string | null; to: string | null }>,
  actor: Actor
): Promise<void> {
  for (const c of changed) {
    await logActivity(tx, {
      projectId,
      entityType: "pbi",
      entityId: c.id,
      action: "update",
      actor,
      diff: { changes: { planItemId: { from: c.from, to: c.to } }, label: labelOf("pbi", c), meta: { displayId: c.displayId, planLink: true } },
    })
  }
}

/**
 * PUT /plan/:itemId/links: replace the item's PBI set. PBIs must be live PBIs
 * of the project (400 PLAN_LINK_INVALID_PBI); PBIs linked elsewhere are moved
 * here (their old plan items are recalculated too).
 */
export async function setPlanLinks(projectId: string, itemId: string, pbiIds: readonly string[], actor: Actor): Promise<{ pbis: PlanLinkedPbiDto[] }> {
  const wanted = [...new Set(pbiIds)]
  await withTransaction(async (tx) => {
    await assertLinkablePlanItem(tx, projectId, itemId)
    const target = await repo.findLivePbisByIds(tx, projectId, wanted)
    if (target.length !== wanted.length) {
      throw new ValidationError("紐付けできない PBI が含まれています", {}, "PLAN_LINK_INVALID_PBI")
    }
    const current = await repo.findLinkedPbisOfItem(tx, projectId, itemId)
    const keep = new Set(wanted)
    const toUnlink = current.filter((p) => !keep.has(p.id))
    const toLink = target.filter((p) => p.planItemId !== itemId)
    await repo.setPbiPlanItem(tx, projectId, toUnlink.map((p) => p.id), null)
    await repo.setPbiPlanItem(tx, projectId, toLink.map((p) => p.id), itemId)
    const oldPlans = toLink.map((p) => p.planItemId)
    await recalcPlanProgress(projectId, [itemId, ...oldPlans], tx)
    await logLinkChanges(
      tx,
      projectId,
      [
        ...toUnlink.map((p) => ({ ...p, from: itemId, to: null })),
        ...toLink.map((p) => ({ ...p, from: p.planItemId, to: itemId })),
      ],
      actor
    )
    if (toUnlink.length + toLink.length > 0) {
      await logActivity(tx, {
        projectId,
        entityType: "plan_item",
        entityId: itemId,
        action: "update",
        actor,
        diff: { meta: { linkedPbis: { added: toLink.length, removed: toUnlink.length, total: wanted.length } } },
      })
    }
  })
  return getPlanLinks(projectId, itemId)
}

/** GET /plan/linkable-pbis?q=: live PBIs (≤ 200) with the plan item they are linked to (trashed items read as none). */
export async function listLinkablePbis(projectId: string, q: string | undefined): Promise<{ pbis: LinkablePbiDto[] }> {
  const text = q?.trim().slice(0, 200) || undefined
  const rows = await repo.findLinkablePbis(defaultDb, projectId, text, text ? parseDisplayId(text) : null)
  return {
    pbis: rows.map((p) => ({
      id: p.id,
      displayId: p.displayId,
      title: titleOf(p),
      status: p.status,
      points: p.workloadScore ?? 0,
      planItem: p.planItem && p.planItem.deletedAt === null ? { id: p.planItem.id, name: p.planItem.name } : null,
    })),
  }
}
