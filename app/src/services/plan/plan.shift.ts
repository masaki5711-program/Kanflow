/**
 * 実績からの日程補正: an item's actual period differs from its plan, so the
 * rows after it are moved by the same number of days (preview, then apply).
 * The pure rules live in src/lib/plan-shift.ts.
 */
import { dateFromKey, recalcPlanProgress, toDateKeyOrNull } from "@/lib/plan-progress"
import { planShift, slipDays, type ShiftNode, type SkipReason } from "@/lib/plan-shift"
import type { Actor } from "@/services/_shared/actor"
import { logActivity } from "@/services/_shared/activity"
import { withTransaction } from "@/services/_shared/db"
import { ConflictError } from "@/services/_shared/errors"
import * as repo from "./plan.repository"
import { planItemNotFound } from "./plan.rules"
import type { z } from "zod"
import type { shiftFollowingSchema } from "./plan.schemas"

export type ShiftFollowingInput = z.infer<typeof shiftFollowingSchema>

export interface ShiftPreview {
  /** Days the rows move (+ = later). 0 = no slip to correct. */
  deltaDays: number
  /** The computed slip of the item (null = no actual dates to compare). */
  slipDays: number | null
  applied: boolean
  moved: Array<{ id: string; name: string; plannedStart: string; plannedEnd: string; newStart: string; newEnd: string }>
  skipped: Array<{ id: string; name: string; reason: SkipReason }>
}

/** Preview (apply=false) or apply the shift of everything after `itemId`. */
export async function shiftFollowing(projectId: string, itemId: string, input: ShiftFollowingInput, actor: Actor): Promise<ShiftPreview> {
  return withTransaction(async (tx) => {
    const [rows, deps] = await Promise.all([repo.findPlanItems(tx, projectId), repo.findDependencies(tx, projectId)])
    const nodes: Array<ShiftNode & { name: string }> = rows.map((r) => ({
      id: r.id,
      name: r.name,
      parentId: r.parentId,
      plannedStart: toDateKeyOrNull(r.plannedStart),
      plannedEnd: toDateKeyOrNull(r.plannedEnd),
      actualStart: toDateKeyOrNull(r.actualStart),
      actualEnd: toDateKeyOrNull(r.actualEnd),
      status: r.status,
    }))
    // A dependency whose end is in the trash must not carry the shift through the trashed row.
    const live = new Set(nodes.map((n) => n.id))
    const liveDeps = deps.filter((d) => live.has(d.predecessorId) && live.has(d.successorId))
    const source = nodes.find((n) => n.id === itemId)
    if (!source) throw planItemNotFound()
    const slip = slipDays(source)
    const deltaDays = input.deltaDays ?? slip ?? 0
    const plan = planShift(nodes, liveDeps, itemId, input.scope, deltaDays)
    const nameOf = new Map(nodes.map((n) => [n.id, n.name]))

    if (input.apply && plan.moved.length > 0) {
      const versionOf = new Map(rows.map((r) => [r.id, r.version]))
      for (const m of plan.moved) {
        // Versioned: a row edited since the snapshot (e.g. just started) is not overwritten.
        const written = await repo.updatePlanItemVersioned(tx, projectId, m.id, { plannedStart: dateFromKey(m.newStart), plannedEnd: dateFromKey(m.newEnd) }, versionOf.get(m.id))
        if (!written) throw new ConflictError("計画が更新されました。内容を確認してもう一度お試しください")
      }
      await recalcPlanProgress(projectId, plan.moved.map((m) => m.id), tx)
      await logActivity(tx, {
        projectId,
        entityType: "plan_item",
        entityId: itemId,
        action: "update",
        actor,
        diff: { changes: { planShift: { from: null, to: deltaDays } }, meta: { count: plan.moved.length, scope: input.scope } },
      })
    }
    return {
      deltaDays,
      slipDays: slip,
      applied: input.apply && plan.moved.length > 0,
      moved: plan.moved.map((m) => ({ ...m, name: nameOf.get(m.id) ?? "" })),
      skipped: plan.skipped.map((s) => ({ ...s, name: nameOf.get(s.id) ?? "" })),
    }
  })
}
