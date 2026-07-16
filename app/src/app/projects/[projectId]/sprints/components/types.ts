// Shared types for the sprint tab components (sprint-card, pbi-group,
// sprint-task-row). Mirrors the API response shapes from
// /api/projects/[projectId]/sprints.

export interface SprintPbItem {
  id: string
  displayId: number
  initiative: string | null
  epic: string | null
  userStory: string | null
  workloadScore: number
}

export interface SprintItem {
  id: string
  taskName: string | null
  assignee: string | null
  estimatedHours: number | null
  actualHours: number | null
  status: string
  completionComment?: string | null
  pbItem: SprintPbItem
}

export interface Sprint {
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
  items: SprintItem[]
}

export interface CalendarEvent {
  id: string
  title: string
  description: string | null
  date: string
  endDate: string | null
  color: string
  sprintId: string | null
  sprint: { id: string; sprintName: string } | null
}
