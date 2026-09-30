import type { EntityI18n } from "@/lib/translation/types"
import type { BacklogItemDto, CalendarEventDto, ProductGoalDto, SprintDto, SprintPbItemDto, SprintTaskDto } from "@/types/api"

/** Flattened member row built by the report server page. */
export interface Member {
  id: string
  name: string
  email: string
  role: string
}

export type ReportProductGoal = ProductGoalDto
export type SprintPbItem = SprintPbItemDto
export type SprintItem = SprintTaskDto
export type Sprint = SprintDto

/** Flattened PBI row built by the report server page. */
export type BacklogItem = Pick<
  BacklogItemDto,
  "displayId" | "initiative" | "epic" | "userStory" | "workloadScore" | "status" | "assignedPo" | "completedAt" | "i18n"
> & {
  productGoalTitle: string | null
  productGoalI18n?: EntityI18n | null
}

export type CalendarEvent = Pick<CalendarEventDto, "id" | "title" | "description" | "date" | "endDate" | "color" | "i18n">

export interface BacklogSummary {
  ready: number
  notReady: number
  completed: number
  totalReadyWorkload: number
}

export interface IceboxSummary {
  unreviewed: number
  reviewed: number
  frozen: number
}

/** Formatting helpers shared by every report section. */
export interface ReportFormat {
  /** Viewer-locale side of user text (print-oriented, so no badges). */
  pick: (i18n: EntityI18n | null | undefined, field: string, original: string | null | undefined) => string
  formatDate: (iso: string) => string
  pointUnit: string
  statusLabel: (status: string) => string
}

/** Role abbreviations are the same in every language. */
export const ROLE_ABBR: Record<string, string> = { po: "PO", sm: "SM", dev: "Dev" }

export const SPRINT_STATUS_ORDER = ["active", "review", "planning", "done", "archived"]

export function sprintStatusBadge(status: string): string {
  switch (status) {
    case "active": return "bg-blue-100 text-blue-800"
    case "review": return "bg-purple-100 text-purple-800"
    case "done": return "bg-green-100 text-green-800"
    case "archived": return "bg-gray-100 text-gray-700"
    default: return "bg-yellow-100 text-yellow-800"
  }
}

export function taskStatusBadge(status: string): string {
  if (status === "done") return "bg-green-100 text-green-800"
  if (status === "in_progress") return "bg-blue-100 text-blue-800"
  return "bg-gray-100 text-gray-700"
}

export function achievementRate(sprint: Pick<Sprint, "capacity" | "actualScore">): number {
  return sprint.capacity > 0 ? Math.round((sprint.actualScore / sprint.capacity) * 100) : 0
}

export function taskCounts(items: SprintItem[]): { total: number; done: number; inProgress: number; todo: number } {
  const total = items.length
  const done = items.filter((i) => i.status === "done").length
  const inProgress = items.filter((i) => i.status === "in_progress").length
  return { total, done, inProgress, todo: total - done - inProgress }
}
