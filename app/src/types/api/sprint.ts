import type { EntityI18n } from "@/lib/translation/types"
import type { PbiSummaryDto } from "./backlog"

/** PBI embedded in a sprint task (GET /api/projects/:id/sprints). */
export interface SprintPbItemDto extends PbiSummaryDto {
  acceptanceCriteria?: string | null
}

/** Sprint backlog item (task) with its PBI. */
export interface SprintTaskDto {
  id: string
  taskName: string | null
  assignee: string | null
  estimatedHours: number | null
  actualHours: number | null
  status: string
  completionComment?: string | null
  pbItem: SprintPbItemDto
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
  i18n?: EntityI18n
}

/** Sprint without the review / retrospective text (timeline views). */
export type SprintTimelineDto = Omit<
  SprintDto,
  "reviewComment" | "retrospectiveMemo" | "retrospectiveKeep" | "retrospectiveProblem" | "retrospectiveTry"
>
