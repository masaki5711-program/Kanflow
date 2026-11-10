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
  /** Set by accepting an AI review proposal (absent from older responses). */
  learningUse?: "excluded" | "waiting" | null
}

export interface ActualsResponse {
  preview: ActualsPreview
  snapshots: SnapshotView[]
  permissions: { finalize: boolean; review?: boolean }
}

/** One AI review proposal (JSON of services/plan-actuals/actuals-review.service). */
export interface ReviewProposalView {
  id: string
  /** The leaf cites a PBI that is confidential now: a placeholder (no id, name, days or reason; decline only). */
  hidden: boolean
  snapshotItemId: string | null
  itemName: string | null
  plannedDays: number | null
  actualDays: number | null
  kind: "exclude_from_learning" | "treat_as_waiting"
  quote: string | null
  quoteSource: "item" | "note" | null
  confidence: "low" | "medium" | "high"
  state: "pending" | "accepted" | "rejected"
  version: number
  decidedAt: string | null
  decidedByName: string | null
}

export interface ReviewListView {
  snapshotId: string | null
  job: "none" | "queued" | "running" | "done" | "failed" | "skipped"
  /** Why a review was skipped (no_items | prompt_budget | superseded | snapshot_gone), else null. */
  jobReason: string | null
  /** Valid proposals not written because too many were pending. */
  capped: number
  proposals: ReviewProposalView[]
}

export interface AttributeView {
  kind: "equipment" | "process" | "tag"
  ref: string
}
