import type { BadgeTone } from "@/components/ui"
import type { Language } from "@/lib/i18n"
import { SPRINT_STATUS_TONE } from "@/lib/design-tokens"
import {
  EMPTY_TIMELINE_DAYS,
  TIMELINE_PADDING_DAYS,
  type DateColumn,
  type GanttRow,
  type PbiGroup,
  type Sprint,
  type SprintItem,
} from "./gantt-types"

const MS_PER_DAY = 86_400_000

export function daysBetween(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / MS_PER_DAY)
}

export function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}

export function addDays(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n)
}

function isWeekend(d: Date): boolean {
  const day = d.getDay()
  return day === 0 || day === 6
}

function dayId(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`
}

const LOCALE: Record<Language, string> = { ja: "ja-JP", en: "en-US", id: "id-ID" }

export function localeOf(language: Language): string {
  return LOCALE[language] ?? "en-US"
}

export function isRealTask(item: SprintItem): boolean {
  return !!(item.taskName && item.taskName.trim().length > 0)
}

/**
 * Preserve all PBIs (via every item including placeholders) so empty PBIs
 * still appear in the tree, but only real tasks populate `tasks`.
 */
export function groupItemsByPbi(items: SprintItem[]): PbiGroup[] {
  const map = new Map<string, PbiGroup>()
  for (const item of items) {
    const existing = map.get(item.pbItem.id)
    if (existing) {
      if (isRealTask(item)) map.set(item.pbItem.id, { ...existing, tasks: [...existing.tasks, item] })
    } else {
      map.set(item.pbItem.id, { pbItem: item.pbItem, tasks: isRealTask(item) ? [item] : [] })
    }
  }
  return Array.from(map.values())
}

export function getInitials(name: string): string {
  return name.split(/[\s　]+/).map((w) => w[0] || "").join("").toUpperCase().slice(0, 2)
}

function percentDone(tasks: SprintItem[]): number {
  if (tasks.length === 0) return 0
  const done = tasks.filter((tk) => tk.status === "done").length
  return Math.round((done / tasks.length) * 100)
}

export function sprintDonePercent(sprint: Sprint): number {
  return percentDone(sprint.items.filter(isRealTask))
}

export const pbiDonePercent = percentDone

export function sortSprints(sprints: Sprint[]): Sprint[] {
  return [...sprints].sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime())
}

export function computeTimeline(sorted: Sprint[], now: Date = new Date()): { timelineStart: Date; totalDays: number } {
  if (sorted.length === 0) {
    const start = addDays(startOfDay(now), -TIMELINE_PADDING_DAYS)
    return { timelineStart: start, totalDays: daysBetween(start, addDays(startOfDay(now), EMPTY_TIMELINE_DAYS)) + 1 }
  }
  const start = addDays(startOfDay(new Date(sorted[0].startDate)), -TIMELINE_PADDING_DAYS)
  const lastEnd = Math.max(...sorted.map((sp) => new Date(sp.endDate).getTime()))
  const end = addDays(startOfDay(new Date(lastEnd)), TIMELINE_PADDING_DAYS)
  return { timelineStart: start, totalDays: daysBetween(start, end) + 1 }
}

export function buildRows(sorted: Sprint[], isExpanded: (key: string) => boolean): GanttRow[] {
  const result: GanttRow[] = []
  for (const sprint of sorted) {
    const sprintKey = `sprint-${sprint.id}`
    result.push({ kind: "sprint", sprint, key: sprintKey })
    if (!isExpanded(sprintKey)) continue
    for (const group of groupItemsByPbi(sprint.items)) {
      const pbiKey = `pbi-${sprint.id}-${group.pbItem.id}`
      result.push({ kind: "pbi", pbi: group.pbItem, tasks: group.tasks, sprint, key: pbiKey })
      if (!isExpanded(pbiKey)) continue
      group.tasks.forEach((task, idx) => {
        result.push({ kind: "task", task, sprint, pbiTasks: group.tasks, taskIndex: idx, key: `task-${task.id}` })
      })
    }
  }
  return result
}

export function buildDateColumns(
  timelineStart: Date,
  totalDays: number,
  weekdays: readonly string[],
  locale: string,
): DateColumn[] {
  const cols: DateColumn[] = []
  for (let i = 0; i < totalDays; i++) {
    const d = addDays(timelineStart, i)
    const prev = i > 0 ? addDays(timelineStart, i - 1) : null
    const showMonth = !prev || prev.getMonth() !== d.getMonth()
    let monthSpan = 0
    if (showMonth) {
      for (let j = i; j < totalDays; j++) {
        const dd = addDays(timelineStart, j)
        if (dd.getMonth() !== d.getMonth() || dd.getFullYear() !== d.getFullYear()) break
        monthSpan++
      }
    }
    cols.push({
      id: dayId(d),
      date: d,
      dayNum: d.getDate(),
      isWeekendDay: isWeekend(d),
      weekday: weekdays[d.getDay()] ?? "",
      showMonth,
      monthYear: d.toLocaleDateString(locale, { year: "numeric", month: "short" }),
      monthSpan,
    })
  }
  return cols
}

/** Task bars are distributed proportionally inside their sprint's range. */
export function taskBarRange(sprint: Sprint, taskIndex: number, totalInPbi: number): { start: Date; end: Date } {
  const sprintStart = startOfDay(new Date(sprint.startDate))
  const sprintDays = daysBetween(sprintStart, startOfDay(new Date(sprint.endDate))) + 1
  const dayStart = Math.floor((taskIndex / totalInPbi) * sprintDays)
  const dayEnd = Math.floor(((taskIndex + 1) / totalInPbi) * sprintDays)
  return { start: addDays(sprintStart, dayStart), end: addDays(sprintStart, Math.max(dayEnd - 1, dayStart)) }
}

export function formatDate(d: Date, locale: string): string {
  return d.toLocaleDateString(locale, { month: "short", day: "numeric" })
}

// ---- Styles -------------------------------------------------------------

const SPRINT_GRADIENT: Record<string, string> = {
  planning: "from-amber-500 to-amber-300",
  active: "from-blue-600 to-blue-400",
  review: "from-violet-600 to-violet-400",
  done: "from-emerald-600 to-emerald-400",
  archived: "from-slate-500 to-slate-300",
}


const TASK_TONE: Record<string, BadgeTone> = { todo: "neutral", in_progress: "primary", done: "success" }
const TASK_BAR: Record<string, string> = { todo: "bg-slate-400", in_progress: "bg-blue-400", done: "bg-emerald-400" }

export function sprintGradient(status: string): string {
  return SPRINT_GRADIENT[status] ?? SPRINT_GRADIENT.active
}

export function sprintTone(status: string): BadgeTone {
  return SPRINT_STATUS_TONE[status] ?? "primary"
}

export function taskTone(status: string): BadgeTone {
  return TASK_TONE[status] ?? "neutral"
}

export function taskBarColor(status: string): string {
  return TASK_BAR[status] ?? TASK_BAR.todo
}

const EVENT_FLAG: Record<string, string> = {
  blue: "text-blue-500",
  green: "text-emerald-500",
  red: "text-red-500",
  yellow: "text-amber-500",
  purple: "text-violet-500",
  gray: "text-slate-400",
}

export function eventFlagColor(color: string): string {
  return EVENT_FLAG[color] ?? "text-blue-400"
}
