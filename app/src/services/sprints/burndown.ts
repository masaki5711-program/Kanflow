/**
 * Project burndown (pure). Counts real tasks (placeholder rows without a
 * taskName only mark PBI membership and would inflate the burn) across the
 * non-archived sprints, day by day from the earliest sprint start to
 * max(latest sprint end, today).
 */
import { isRealTask } from "@/lib/pbi-status-sync"

export interface BurndownTask {
  taskName: string | null
  status: string
  completedAt: Date | null
}

export interface BurndownSprint {
  id: string
  sprintName: string
  status: string
  startDate: Date
  endDate: Date
  items: readonly BurndownTask[]
}

export interface SprintMarker {
  id: string
  name: string
  status: string
  startIndex: number
  endIndex: number
  taskCount: number
  doneCount: number
}

export interface BurndownData {
  days: string[]
  totalTasks: number
  idealLine: number[]
  planLine: number[]
  actualLine: (number | null)[]
  actualBaseline: number | null
  sprintMarkers: SprintMarker[]
}

export const EMPTY_BURNDOWN: BurndownData = {
  days: [],
  totalTasks: 0,
  idealLine: [],
  planLine: [],
  actualLine: [],
  actualBaseline: null,
  sprintMarkers: [],
}

export function toDateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date)
  d.setDate(d.getDate() + days)
  return d
}

function startOfDay(date: Date): Date {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  return d
}

function buildDays(sprints: readonly BurndownSprint[], today: Date): string[] {
  const earliest = startOfDay(sprints.reduce<Date>((min, s) => (s.startDate < min ? s.startDate : min), sprints[0].startDate))
  const latest = startOfDay(sprints.reduce<Date>((max, s) => (s.endDate > max ? s.endDate : max), sprints[0].endDate))
  const rangeEnd = today > latest ? today : latest
  const days: string[] = []
  for (let d = new Date(earliest); d.getTime() <= rangeEnd.getTime(); d = addDays(d, 1)) days.push(toDateKey(d))
  return days
}

function sprintRange(s: BurndownSprint, dayIndex: ReadonlyMap<string, number>, dayCount: number) {
  return {
    start: dayIndex.get(toDateKey(startOfDay(s.startDate))) ?? 0,
    end: dayIndex.get(toDateKey(startOfDay(s.endDate))) ?? dayCount - 1,
  }
}

function buildPlanLine(sprints: readonly BurndownSprint[], dayIndex: ReadonlyMap<string, number>, dayCount: number, total: number): number[] {
  const planLine: number[] = new Array(dayCount).fill(total)
  let remaining = total
  for (const sprint of sprints) {
    const { start, end } = sprintRange(sprint, dayIndex, dayCount)
    const count = sprint.items.length
    const perDay = end > start ? count / (end - start) : count
    for (let i = 0; i < dayCount; i++) {
      if (i < start) planLine[i] = remaining
      else if (i <= end) planLine[i] = Math.max(0, remaining - perDay * (i - start))
    }
    remaining -= count
    for (let i = end + 1; i < dayCount; i++) planLine[i] = Math.max(0, remaining)
  }
  return planLine
}

function buildActualLine(sprints: readonly BurndownSprint[], days: readonly string[], total: number, todayKey: string) {
  const doneEvents = new Map<string, number>()
  for (const item of sprints.flatMap((s) => s.items)) {
    if (item.status === "done" && item.completedAt) {
      const k = toDateKey(startOfDay(item.completedAt))
      doneEvents.set(k, (doneEvents.get(k) ?? 0) + 1)
    }
  }
  const actualLine: (number | null)[] = new Array(days.length).fill(null)
  let rem = total
  let actualBaseline: number | null = null
  for (let i = 0; i < days.length; i++) {
    const done = doneEvents.get(days[i]) ?? 0
    if (done > 0) {
      if (actualBaseline === null) actualBaseline = rem
      rem -= done
      actualLine[i] = rem
    } else if (actualBaseline !== null) {
      actualLine[i] = rem
    }
    if (days[i] === todayKey && actualBaseline !== null && actualLine[i] === null) actualLine[i] = rem
  }
  return { actualLine, actualBaseline }
}

/** Compute the burndown for sprints ordered by startDate ascending. */
export function computeBurndown(rawSprints: readonly BurndownSprint[], now: Date = new Date()): BurndownData {
  const sprints = rawSprints.map((s) => ({ ...s, items: s.items.filter(isRealTask) }))
  if (sprints.length === 0) return EMPTY_BURNDOWN
  const today = startOfDay(now)
  const days = buildDays(sprints, today)
  const dayIndex = new Map(days.map((k, i) => [k, i]))
  const totalTasks = sprints.reduce((sum, s) => sum + s.items.length, 0)
  const idealLine = days.map((_, i) => (days.length <= 1 ? 0 : totalTasks - (totalTasks * i) / (days.length - 1)))
  const planLine = buildPlanLine(sprints, dayIndex, days.length, totalTasks)
  const { actualLine, actualBaseline } = buildActualLine(sprints, days, totalTasks, toDateKey(today))
  const sprintMarkers: SprintMarker[] = sprints.map((s) => {
    const { start, end } = sprintRange(s, dayIndex, days.length)
    return {
      id: s.id,
      name: s.sprintName,
      status: s.status,
      startIndex: start,
      endIndex: end,
      taskCount: s.items.length,
      doneCount: s.items.filter((i) => i.status === "done").length,
    }
  })
  return { days, totalTasks, idealLine, planLine, actualLine, actualBaseline, sprintMarkers }
}
