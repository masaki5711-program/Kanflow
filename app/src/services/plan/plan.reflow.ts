/**
 * 依存関係で再計算: every dependency becomes a strict finish-to-start (the
 * successor starts after the predecessor ends); violating leaves move later
 * (preview, then apply). The pure rules live in src/lib/plan-reflow.ts.
 */
import { dateFromKey, recalcPlanProgress } from "@/lib/plan-progress"
import { planReflow } from "@/lib/plan-reflow"
import type { SkipReason } from "@/lib/plan-shift"
import type { Actor } from "@/services/_shared/actor"
import { logActivity } from "@/services/_shared/activity"
import { withTransaction } from "@/services/_shared/db"
import { ConflictError } from "@/services/_shared/errors"
import * as repo from "./plan.repository"
import { loadPlanSnapshot } from "./plan.snapshot"
import type { ReflowInput } from "./plan.assist.schemas"

export interface ReflowPreview {
  applied: boolean
  moved: Array<{ id: string; name: string; plannedStart: string; plannedEnd: string; newStart: string; newEnd: string }>
  skipped: Array<{ id: string; name: string; reason: SkipReason }>
}

/** Preview (apply=false) or apply the dependency reflow of the whole plan. */
export async function reflowPlan(projectId: string, input: ReflowInput, actor: Actor): Promise<ReflowPreview> {
  return withTransaction(async (tx) => {
    const { rows, nodes, deps } = await loadPlanSnapshot(tx, projectId)
    const plan = planReflow(nodes, deps, { businessDays: input.businessDays === true })
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
        entityType: "project",
        entityId: projectId,
        action: "update",
        actor,
        diff: { changes: { planReflow: { from: null, to: plan.moved.length } }, meta: { count: plan.moved.length, businessDays: input.businessDays === true } },
      })
    }
    return {
      applied: input.apply && plan.moved.length > 0,
      moved: plan.moved.map((m) => ({ ...m, name: nameOf.get(m.id) ?? "" })),
      skipped: plan.skipped.map((s) => ({ ...s, name: nameOf.get(s.id) ?? "" })),
    }
  })
}
