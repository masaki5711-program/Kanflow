// Shared types for the sprint tab components (sprint-card, pbi-group,
// sprint-task-row). Mirrors the API response shapes from
// /api/projects/[projectId]/sprints. `i18n` carries the both-language text
// of the translatable fields (see lib/translation).

import type {
  CalendarEventDto,
  PbiWithStatusDto,
  ProjectMemberDto,
  SprintDto,
  SprintPbItemDto,
  SprintTaskDto,
} from "@/types/api"

export type SprintPbItem = SprintPbItemDto
export type SprintItem = SprintTaskDto
export type Sprint = SprintDto
export type CalendarEvent = CalendarEventDto

/** Ready PB item listed in the sprint-creation form (from /backlog). */
export type ReadyPbItem = PbiWithStatusDto

export interface ProjectSettings {
  defaultCapacity: number
  sprintDurationDays: number
  pointUnit: string
  pointDescription: string | null
}

export type Member = Pick<ProjectMemberDto, "id" | "userId" | "role"> & {
  user: Pick<ProjectMemberDto["user"], "id" | "name" | "email">
}

/** Retrospective / review fields editable in the status dialog. */
export interface RetroFields {
  reviewComment: string
  retrospectiveMemo: string
  retrospectiveKeep: string
  retrospectiveProblem: string
  retrospectiveTry: string
}

export interface StatusDialogState extends RetroFields {
  sprintId: string
  sprintName: string
  nextStatus: string
}

/** String-typed form state of the task add/edit modal. */
export interface TaskFormState {
  pbItemId: string
  taskName: string
  assignee: string
  estimatedHours: string
  actualHours: string
  status: string
}

/** Callbacks shared by SprintCard → PbiGroup → SprintTaskRow. */
export interface SprintTaskActions {
  onRequestComplete: (task: SprintItem) => void
  onQuickUpdateTaskStatus: (sprintId: string, taskId: string, status: string, completionComment?: string | null) => void
  onStartEditTask: (sprintId: string, task: SprintItem) => void
  onDeleteTask: (sprintId: string, taskId: string) => void
  /** Resolves true when saved (errors are toasted by the caller). */
  onEditCompletionComment: (sprintId: string, taskId: string, completionComment: string) => Promise<boolean>
  /** Push a follow-up item to the project Icebox. Resolves true when created. */
  onSendToIcebox: (request: string, background?: string) => Promise<boolean>
  onOpenTaskForm: (sprintId: string, pbItemId?: string) => void
  onRemovePbi: (sprintId: string, pbItemId: string) => void
  onViewPbiDetail: (pbiId: string) => void
}

/** Sprint-level callbacks used by SprintCard (in addition to the task actions). */
export interface SprintCardActions extends Omit<SprintTaskActions, "onRequestComplete"> {
  onRequestStatusChange: (sprintId: string, nextStatus: string) => void
  onDeleteSprint: (sprint: Sprint) => void
  onOpenStatusDialog: (sprint: Sprint) => void
  onAddPbi: (sprintId: string) => void
  onSprintUpdated: () => void
}
