/**
 * マイルストーン・検収ボード (general projects): fixed vocabularies, limits
 * and URLs shared by the API services and the UI (no server-only imports).
 */

/** チェック項目 results. 条件付き合格 counts as accepted (its conditions go to 残課題). */
export const CHECK_RESULTS = ["passed", "conditional", "failed"] as const
export type CheckResult = (typeof CHECK_RESULTS)[number]

export const PUNCH_STATUSES = ["open", "in_progress", "done"] as const
export type PunchStatus = (typeof PUNCH_STATUSES)[number]

export const DOCUMENT_STATUSES = ["pending", "received"] as const
export type DocumentStatus = (typeof DOCUMENT_STATUSES)[number]

export const METRIC_DIRECTIONS = ["decrease", "increase"] as const
export type MetricDirection = (typeof METRIC_DIRECTIONS)[number]

/** Rows per board part (the services enforce them). */
export const MS_MAX_CHECKS = 100
export const MS_MAX_PUNCH_ITEMS = 500
export const MS_MAX_DOCUMENTS = 100
export const MS_MAX_BUDGET_LINES = 100
export const MS_MAX_METRICS = 10
/** Monthly points per metric (10 years). */
export const MS_MAX_METRIC_POINTS = 120
export const MS_MAX_PUNCH_PHOTOS = 10
export const MS_MAX_DOCUMENT_FILES = 20

export const MS_NAME_MAX = 255
export const MS_TEXT_MAX = 5000
export const MS_CHECK_LABEL_MAX = 40
export const MS_METRIC_UNIT_MAX = 20
export const MS_METRIC_NAME_MAX = 200
/** Largest yen / metric value accepted (well inside DOUBLE; whole yen stay exact). */
export const MS_NUMBER_MAX = 1e13

export const MS_PHOTO_ACCEPT = "image/*"
/** Same picker filter as the PBI 参考資料 (the server still checks type and content). */
export const MS_DOCUMENT_ACCEPT = "image/*,application/pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.zip,.dwg,.dxf"

/** "YYYY-MM" month key. */
export const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/

export function milestonesUrl(projectId: string): string {
  return `/api/projects/${projectId}/milestones`
}

export function punchPhotoUrl(projectId: string, punchId: string, photoId: string): string {
  return `${milestonesUrl(projectId)}/punch/${punchId}/photos/${photoId}`
}

export function documentFileUrl(projectId: string, documentId: string, fileId: string): string {
  return `${milestonesUrl(projectId)}/documents/${documentId}/files/${fileId}`
}
