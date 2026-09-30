import type { CalendarEventDto, SprintPbItemDto, SprintTaskDto, SprintTimelineDto } from "@/types/api"

export type SprintPbItem = SprintPbItemDto
export type SprintItem = SprintTaskDto
export type Sprint = SprintTimelineDto
export type CalendarEvent = Pick<CalendarEventDto, "id" | "title" | "date" | "endDate" | "color" | "sprintId" | "i18n">

export interface PbiGroup {
  pbItem: SprintPbItem
  tasks: SprintItem[]
}

export type GanttRow =
  | { kind: "sprint"; sprint: Sprint; key: string }
  | { kind: "pbi"; pbi: SprintPbItem; tasks: SprintItem[]; sprint: Sprint; key: string }
  | { kind: "task"; task: SprintItem; sprint: Sprint; pbiTasks: SprintItem[]; taskIndex: number; key: string }

export type ZoomLevel = "week" | "2weeks" | "month"

export interface DateColumn {
  /** Stable key (yyyy-mm-dd). */
  id: string
  date: Date
  dayNum: number
  isWeekendDay: boolean
  weekday: string
  showMonth: boolean
  monthYear: string
  monthSpan: number
}

/** Viewer-locale text accessors for user-entered content. */
export interface GanttText {
  sprintName: (s: Sprint) => string
  pbiLabel: (p: SprintPbItem) => string
  taskName: (tk: SprintItem) => string
  eventTitle: (ev: CalendarEvent) => string
  statusLabel: (status: string) => string
  taskStatusLabel: (status: string) => string
}

export const ROW_HEIGHT = 40
export const LEFT_PANEL_WIDTH = 320
export const HEADER_HEIGHT = 64
export const DAY_WIDTH_MAP: Record<ZoomLevel, number> = { week: 50, "2weeks": 36, month: 20 }
export const ZOOM_LEVELS: readonly ZoomLevel[] = ["week", "2weeks", "month"]
/** Days of padding before the first sprint / after the last one. */
export const TIMELINE_PADDING_DAYS = 7
/** Timeline length (days after today) when there are no sprints. */
export const EMPTY_TIMELINE_DAYS = 28
