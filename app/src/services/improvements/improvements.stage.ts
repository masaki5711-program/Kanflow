import type { KaizenStage, MetricDirection } from "@/lib/improvement/constants"
import { targetContradictsDirection } from "@/lib/improvement/metrics"
import { ValidationError } from "@/services/_shared/errors"

/**
 * Stage guards of the 改善成果ボード. Moving forward needs evidence; going
 * back (or to 延期) is always allowed:
 * - 標準化済み needs a 標準書リンク (manualLink)
 * - 定着確認済み needs at least one 定着確認 recorded as "sustained"
 * 横展開中 has no guard: released items migrated from the old screen without a
 * link land there (see the migration's backfill mapping).
 */

export interface StageContext {
  manualLink: string | null
  sustainedChecks: number
}

export function assertStageAllowed(target: KaizenStage, ctx: StageContext): void {
  if (target === "standardized" && !ctx.manualLink?.trim()) {
    throw new ValidationError("標準化済みにするには標準書リンクが必要です", {}, "IMPROVEMENT_NEEDS_STANDARD")
  }
  if (target === "sustained" && ctx.sustainedChecks < 1) {
    throw new ValidationError("定着確認済みにするには「維持できている」の記録が必要です", {}, "IMPROVEMENT_NEEDS_SUSTAINED_CHECK")
  }
}

/** The target value must be an improvement over the baseline in the chosen direction. */
export function assertTargetDirection(direction: MetricDirection | string, baseline: number | null, target: number | null): void {
  if (targetContradictsDirection(direction, baseline, target)) {
    throw new ValidationError("目標値が改善前より良くなっていません", {}, "IMPROVEMENT_TARGET_DIRECTION")
  }
}
