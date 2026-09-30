/**
 * Client-side types of the master-plan API (/api/projects/:id/plan).
 * Mirrors the contract agreed with the backend; dates are "YYYY-MM-DD".
 */
import type { EntityI18n } from "@/lib/translation/types"

export type Ymd = string

export type PlanStatus = "not_started" | "in_progress" | "done" | "on_hold"
export const PLAN_STATUSES: readonly PlanStatus[] = ["not_started", "in_progress", "done", "on_hold"]

/** "on_hold" = the item is paused (status on_hold); it is never reported delayed / at_risk. */
export type ScheduleState = "done" | "delayed" | "at_risk" | "not_started" | "on_track" | "on_hold"
export const SCHEDULE_STATES: readonly ScheduleState[] = ["on_track", "at_risk", "delayed", "not_started", "done", "on_hold"]

export type ProgressMode = "manual" | "linked"

export interface PlanSprintRef {
  id: string
  name: string
  startDate: Ymd
  endDate: Ymd
  status: string
}

export interface PlanLinkedSummary {
  pbiCount: number
  pbiDone: number
  pointsTotal: number
  pointsDone: number
  sprints: PlanSprintRef[]
}

export interface PlanItem {
  id: string
  projectId: string
  parentId: string | null
  name: string
  description: string | null
  notes: string | null
  plannedStart: Ymd
  plannedEnd: Ymd
  actualStart: Ymd | null
  actualEnd: Ymd | null
  baselineStart: Ymd | null
  baselineEnd: Ymd | null
  baselineVarianceDays: number | null
  progressPct: number
  progressMode: ProgressMode
  status: PlanStatus
  scheduleState: ScheduleState
  isMilestone: boolean
  color: string | null
  sortOrder: number
  version?: number
  owner: { id: string; name: string } | null
  hasChildren: boolean
  linked: PlanLinkedSummary | null
  i18n?: EntityI18n
}

export interface PlanDependency {
  id: string
  predecessorId: string
  successorId: string
}

export interface PlanData {
  items: PlanItem[]
  dependencies: PlanDependency[]
  today: Ymd
}

export interface ReorderUpdate {
  id: string
  parentId: string | null
  sortOrder: number
}

export interface LinkedPbi {
  id: string
  displayId: number
  title: string
  status: string
  points: number | null
  sprint: { id: string; name: string } | null
  /** `{ title }` translation (GET /plan/:id/links). */
  i18n?: EntityI18n
}

export interface LinkablePbi {
  id: string
  displayId: number
  title: string
  status: string
  points: number | null
  planItem: { id: string; name: string; i18n?: EntityI18n } | null
  /** `{ title }` translation (GET /plan/linkable-pbis). */
  i18n?: EntityI18n
}

/** Body of POST /plan (and the editable subset of PATCH /plan/:id). */
export interface PlanItemInput {
  name: string
  parentId?: string | null
  plannedStart: Ymd
  plannedEnd: Ymd
  actualStart?: Ymd | null
  actualEnd?: Ymd | null
  isMilestone?: boolean
  status?: PlanStatus
  description?: string | null
  notes?: string | null
  ownerId?: string | null
  progressMode?: ProgressMode
  color?: string | null
}

export type PlanItemPatch = Partial<PlanItemInput>

/** A new item that exists only in the editor until "Save" (no POST before). */
export interface PlanDraft {
  parentId: string | null
  isMilestone: boolean
  plannedStart: Ymd
  plannedEnd: Ymd
}
