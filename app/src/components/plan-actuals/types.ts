/** Shapes the actuals routes return (JSON of src/services/plan-actuals). */
export type PreviewIssue =
  | { kind: "missing_actual" | "start_after_end" | "actual_over_baseline" | "empty_span" | "missing_baseline" | "history_unreadable"; planItemId: string; name?: string }
  /** repositoryRef is "" for viewers who may not finalize (they see that a repository could not be read). */
  | { kind: "repository_unreadable"; repositoryRef: string }
  | { kind: "no_schedule_load" | "schedule_unreadable" }

export interface ActualsPreview {
  leafCount: number
  completeCount: number
  repoCount: number
  issues: PreviewIssue[]
}

export interface SnapshotView {
  id: string
  lineage: string
  closedAt: string
  firstFinalizedAt: string
  finalizedAt: string
  repoCount: number
  issueCount: number
  includeInLearning: boolean
  current: boolean
  version: number
  leafCount: number
  completeCount: number
}

export interface SnapshotItemView {
  id: string
  name: string
  role: string | null
  isMilestone: boolean
  plannedDays: number | null
  actualDays: number | null
  complete: boolean
  endSlipDays: number | null
  waitGapDays: number | null
  onHoldDays: number | null
}

export interface ActualsResponse {
  preview: ActualsPreview
  snapshots: SnapshotView[]
  permissions: { finalize: boolean }
}

export interface AttributeView {
  kind: "equipment" | "process" | "tag"
  ref: string
}
