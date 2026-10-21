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
  /** Project members' user ids (TaskAssignee); [] = unassigned. */
  assigneeIds: string[]
  /**
   * Ids the edited task had when the form opened (null for a new task). The
   * PATCH only sends `assigneeIds` when they changed, so saving other fields
   * never clears a legacy assignee name that matches no member.
   */
  loadedAssigneeIds: string[] | null
  estimatedHours: string
  actualHours: string
  status: string
}

/** Fields a task row edits in place (assignees as user ids; hours null = clear). */
export interface TaskFieldPatch {
  taskName?: string
  estimatedHours?: number | null
  assigneeIds?: string[]
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
  /** In-place edit of a task row. Resolves true when saved (errors are toasted by the caller). */
  onPatchTask: (sprintId: string, taskId: string, patch: TaskFieldPatch) => Promise<boolean>
  /** Quick-add row: a named task under a PBI. Resolves true when created. */
  onQuickAddTask: (sprintId: string, pbItemId: string, taskName: string) => Promise<boolean>
}

/** Sprint-level callbacks used by SprintCard (in addition to the task actions). */
export interface SprintCardActions extends Omit<SprintTaskActions, "onRequestComplete"> {
  onRequestStatusChange: (sprintId: string, nextStatus: string) => void
  onDeleteSprint: (sprint: Sprint) => void
  onOpenStatusDialog: (sprint: Sprint) => void
  onAddPbi: (sprintId: string) => void
  onSprintUpdated: () => void
}
