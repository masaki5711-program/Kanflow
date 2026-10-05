import type { Translations } from "@/lib/i18n"

/** Localized labels of the 改善成果ボード vocabularies (UI and Excel export). */

export function stageLabel(stage: string, t: Translations): string {
  const labels: Record<string, string> = {
    measuring: t.kzStageMeasuring,
    standardized: t.kzStageStandardized,
    deploying: t.kzStageDeploying,
    sustained: t.kzStageSustained,
    deferred: t.kzStageDeferred,
  }
  return labels[stage] ?? stage
}

export function stageHint(stage: string, t: Translations): string {
  const hints: Record<string, string> = {
    measuring: t.kzStageMeasuringHint,
    standardized: t.kzStageStandardizedHint,
    deploying: t.kzStageDeployingHint,
    sustained: t.kzStageSustainedHint,
    deferred: t.kzStageDeferredHint,
  }
  return hints[stage] ?? ""
}

export function categoryLabel(category: string | null, t: Translations): string {
  const labels: Record<string, string> = {
    time: t.kzCatTime,
    quality: t.kzCatQuality,
    cost: t.kzCatCost,
    safety: t.kzCatSafety,
    other: t.kzCatOther,
  }
  return category ? (labels[category] ?? category) : ""
}

export function directionLabel(direction: string, t: Translations): string {
  return direction === "increase" ? t.kzDirIncrease : t.kzDirDecrease
}

export function rolloutStatusLabel(status: string, t: Translations): string {
  const labels: Record<string, string> = { todo: t.kzRolloutTodo, doing: t.kzRolloutDoing, done: t.kzRolloutDone }
  return labels[status] ?? status
}

export function checkKindLabel(kind: string, t: Translations): string {
  if (kind === "1m") return t.kzCheck1m
  if (kind === "3m") return t.kzCheck3m
  return t.kzCheckCustom
}

export function checkResultLabel(result: string | null, t: Translations): string {
  if (result === "sustained") return t.kzCheckSustained
  if (result === "regressed") return t.kzCheckRegressed
  return t.kzCheckPending
}

/** "12.5" / "1,200" — up to 2 decimals, grouped, in the viewer's locale. */
export function formatMetric(value: number | null, locale: string): string {
  if (value === null || !Number.isFinite(value)) return ""
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(value)
}

/** "85%" from a 0..2 rate. */
export function formatRate(rate: number | null): string {
  return rate === null ? "" : `${Math.round(rate * 100)}%`
}
