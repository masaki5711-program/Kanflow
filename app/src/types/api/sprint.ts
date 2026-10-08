import type { EntityI18n } from "@/lib/translation/types"
import type { PbiDependencyRefDto, PbiSummaryDto } from "./backlog"

/** PBI embedded in a sprint task (GET /api/projects/:id/sprints). */
export interface SprintPbItemDto extends PbiSummaryDto {
  acceptanceCriteria?: string | null
  /** PBIs that must be completed before this one (the sprint list orders and flags by them). */
  blockedBy?: PbiDependencyRefDto[]
  /** PBIs waiting for this one. */
  blocking?: PbiDependencyRefDto[]
}

/** A normalized task assignee (TaskAssignee → user). */
export interface TaskAssigneeDto {
  id: string
  name: string
}

/** Sprint backlog item (task) with its PBI. */
export interface SprintTaskDto {
  id: string
  taskName: string | null
  /** Legacy display-name string (dual-written; prefer `assignees`). */
  assignee: string | null
  /** Normalized assignees; may be empty for old rows until the backfill has run (then fall back to `assignee`). */
  assignees?: TaskAssigneeDto[]
  estimatedHours: number | null
  actualHours: number | null
  status: string
  completionComment?: string | null
  pbItem: SprintPbItemDto
  /** Optimistic-lock version (send it back on PATCH / DELETE; stale → 409 VERSION_CONFLICT). */
  version?: number
  i18n?: EntityI18n
}

/** One sprint of GET /api/projects/:id/sprints (dates are ISO strings). */
export interface SprintDto {
  id: string
  sprintName: string
  startDate: string
  endDate: string
  sprintGoal: string | null
  capacity: number
  actualScore: number
  status: string
  reviewComment: string | null
  retrospectiveMemo: string | null
  retrospectiveKeep: string | null
  retrospectiveProblem: string | null
  retrospectiveTry: string | null
  items: SprintTaskDto[]
  /** Optimistic-lock version (send it back on PATCH / DELETE; stale → 409 VERSION_CONFLICT). */
  version?: number
  i18n?: EntityI18n
}

/** Sprint without the review / retrospective text (timeline views). */
export type SprintTimelineDto = Omit<
  SprintDto,
  "reviewComment" | "retrospectiveMemo" | "retrospectiveKeep" | "retrospectiveProblem" | "retrospectiveTry"
>
