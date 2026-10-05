/**
 * 改善成果ボード (improvement results board of process_improvement projects):
 * fixed vocabularies, limits and URLs shared by the API services and the UI
 * (no server-only imports here).
 */

/** 指標カテゴリ: fixed list (the metric name itself is free text). */
export const METRIC_CATEGORIES = ["time", "quality", "cost", "safety", "other"] as const
export type MetricCategory = (typeof METRIC_CATEGORIES)[number]

/** Which way of the metric is better. */
export const METRIC_DIRECTIONS = ["decrease", "increase"] as const
export type MetricDirection = (typeof METRIC_DIRECTIONS)[number]

/**
 * Stages in board order: 効果確認中 → 標準化済み → 横展開中 → 定着確認済み,
 * plus 延期 (shown collapsed at the end).
 */
export const KAIZEN_STAGES = ["measuring", "standardized", "deploying", "sustained", "deferred"] as const
export type KaizenStage = (typeof KAIZEN_STAGES)[number]

/** The board columns (延期 is a separate, collapsed group). */
export const BOARD_STAGES = ["measuring", "standardized", "deploying", "sustained"] as const satisfies readonly KaizenStage[]

export const ROLLOUT_STATUSES = ["todo", "doing", "done"] as const
export type RolloutStatus = (typeof ROLLOUT_STATUSES)[number]

export const CHECK_KINDS = ["1m", "3m", "custom"] as const
export type CheckKind = (typeof CHECK_KINDS)[number]

/** Months after 展開日 of the automatically created checks. */
export const AUTO_CHECK_MONTHS: Readonly<Record<Exclude<CheckKind, "custom">, number>> = { "1m": 1, "3m": 3 }

export const CHECK_RESULTS = ["sustained", "regressed"] as const
export type CheckResult = (typeof CHECK_RESULTS)[number]

export const PHOTO_PHASES = ["before", "after"] as const
export type PhotoPhase = (typeof PHOTO_PHASES)[number]

/** Photos per phase of one improvement (the service enforces it; the UI shows it). */
export const IMPROVEMENT_MAX_PHOTOS_PER_PHASE = 10

/** Picker filter; the server still checks the content and rejects non-images. */
export const IMPROVEMENT_PHOTO_ACCEPT = "image/*"

/** 横展開先 per improvement. */
export const IMPROVEMENT_MAX_ROLLOUTS = 50

/** 定着確認 rows per improvement (auto + custom). */
export const IMPROVEMENT_MAX_CHECKS = 20

export const METRIC_UNIT_MAX = 20
export const METRIC_NAME_MAX = 200
export const ROLLOUT_NAME_MAX = 200
export const CHECK_NOTE_MAX = 2000

export function improvementsUrl(projectId: string): string {
  return `/api/projects/${projectId}/improvements`
}

export function improvementUrl(projectId: string, itemId: string): string {
  return `${improvementsUrl(projectId)}/${itemId}`
}

export function improvementPhotosUrl(projectId: string, itemId: string): string {
  return `${improvementUrl(projectId, itemId)}/photos`
}

export function improvementPhotoUrl(projectId: string, itemId: string, photoId: string): string {
  return `${improvementPhotosUrl(projectId, itemId)}/${photoId}`
}
