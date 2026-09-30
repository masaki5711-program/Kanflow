/**
 * Backlog workbook columns and their localized headers. Dependency-light
 * (translations only) so client components (the import dialog) can name a
 * column exactly as the workbook does.
 */
import type { Translations } from "@/lib/i18n"
import type { ProjectTypeLabels } from "@/lib/project-type-labels"

export const BACKLOG_FIELDS = [
  "displayId",
  "initiative",
  "epic",
  "userStory",
  "acceptanceCriteria",
  "status",
  "workloadScore",
  "goal",
  "assignedPo",
  "poNote",
  "notReadyReason",
  "referenceDoc",
  "planItem",
  "sprint",
  "createdAt",
  "updatedAt",
] as const
export type BacklogField = (typeof BACKLOG_FIELDS)[number]

/** Columns the import reads; the rest (sprint, dates, plan item) are export-only. */
export const IMPORT_FIELDS = [
  "displayId",
  "initiative",
  "epic",
  "userStory",
  "acceptanceCriteria",
  "status",
  "workloadScore",
  "goal",
  "assignedPo",
  "poNote",
  "notReadyReason",
  "referenceDoc",
] as const satisfies readonly BacklogField[]
export type ImportField = (typeof IMPORT_FIELDS)[number]

/** Translated text fields that get extra JA / ID columns in a bilingual export. */
export const BILINGUAL_FIELDS = ["initiative", "epic", "userStory", "acceptanceCriteria"] as const
export type BilingualField = (typeof BILINGUAL_FIELDS)[number]

export function backlogHeader(field: BacklogField, t: Translations, pt: ProjectTypeLabels): string {
  switch (field) {
    case "displayId": return t.excelColId
    case "initiative": return pt.backlogInitiative
    case "epic": return pt.backlogEpic
    case "userStory": return pt.backlogUserStory
    case "acceptanceCriteria": return pt.backlogAcceptanceCriteria
    case "status": return t.excelColStatus
    case "workloadScore": return pt.backlogWorkloadScore
    case "goal": return t.excelColGoal
    case "assignedPo": return pt.rolePO
    case "poNote": return t.excelColPoNote
    case "notReadyReason": return t.excelColNotReadyReason
    case "referenceDoc": return t.excelColReferenceDoc
    case "planItem": return t.excelColPlanItem
    case "sprint": return t.excelColSprint
    case "createdAt": return t.excelColCreatedAt
    case "updatedAt": return t.excelColUpdatedAt
  }
}

export function statusLabel(status: string, t: Translations): string {
  if (status === "ready") return t.backlogStatusReady
  if (status === "not_ready") return t.backlogStatusNotReady
  if (status === "completed") return t.backlogStatusCompleted
  return status
}

