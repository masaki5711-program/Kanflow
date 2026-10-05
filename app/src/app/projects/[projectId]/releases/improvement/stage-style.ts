import type { BadgeTone } from "@/components/ui"
import type { KaizenStage } from "@/lib/improvement/constants"

/**
 * Colour of each 改善成果ボード stage, used semantically: grey = still
 * measuring, blue = standardized, amber = spreading, green = sustained.
 * Chips use the *-soft background with the matching *-strong text (contrast ≥ 4.5:1).
 */
export const STAGE_STYLE: Readonly<Record<KaizenStage, { chip: string; dot: string; bar: string; tone: BadgeTone }>> = {
  measuring: { chip: "bg-surface-sunken text-fg", dot: "bg-fg-subtle", bar: "border-t-fg-subtle", tone: "neutral" },
  standardized: { chip: "bg-primary-soft text-primary-strong", dot: "bg-primary", bar: "border-t-primary", tone: "primary" },
  deploying: { chip: "bg-warning-soft text-warning-strong", dot: "bg-warning", bar: "border-t-warning", tone: "warning" },
  sustained: { chip: "bg-success-soft text-success-strong", dot: "bg-success", bar: "border-t-success", tone: "success" },
  deferred: { chip: "bg-surface-sunken text-fg-muted", dot: "bg-border-strong", bar: "border-t-border-strong", tone: "neutral" },
}

export function stageStyle(stage: string) {
  return STAGE_STYLE[stage as KaizenStage] ?? STAGE_STYLE.measuring
}
