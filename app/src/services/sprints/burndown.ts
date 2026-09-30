/**
 * Project burndown (pure). Counts real tasks (placeholder rows without a
 * taskName only mark PBI membership and would inflate the burn) across the
 * non-archived sprints, day by day from the earliest sprint start to
 * max(latest sprint end, today).
 *
 * Days are calendar days in Asia/Tokyo (the team's zone), independent of the
 * server's TZ. The ideal / plan lines cover the whole range; the ACTUAL line is
 * history only: it starts at the total on the first day and stops at today
 * (A3-01) — future days stay null so a reader can tell history from projection.
 */
import { isRealTask } from "@/lib/pbi-status-sync"
import { dateFromKey, tokyoDateKey } from "@/lib/plan-progress"
import type { EntityI18n } from "@/lib/translation/types"

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
  /** Sprint-name translations (attached by the service; absent in pure computations). */
  i18n?: EntityI18n
}

export interface BurndownData {
  days: string[]
  totalTasks: number
  idealLine: number[]
  planLine: number[]
  /** Remaining tasks per day up to and including today; null for future days. */
  actualLine: (number | null)[]
  /** Kept for API compatibility: always null now that the actual line starts on day 0. */
  actualBaseline: number | null
  /** Index of today (Asia/Tokyo) in `days`; -1 when today is outside the range. */
  todayIndex: number
  sprintMarkers: SprintMarker[]
}

export const EMPTY_BURNDOWN: BurndownData = {
  days: [],
  totalTasks: 0,
  idealLine: [],
  planLine: [],
  actualLine: [],
  actualBaseline: null,
  todayIndex: -1,
  sprintMarkers: [],
}

const DAY_MS = 86_400_000

/** Calendar day "YYYY-MM-DD" of an instant in Asia/Tokyo. */
export function toDateKey(d: Date): string {
  return tokyoDateKey(d)
}

function nextKey(key: string): string {
  const d = dateFromKey(key)
  if (!d) throw new Error(`invalid date key: ${key}`)
  return new Date(d.getTime() + DAY_MS).toISOString().slice(0, 10)
}

function buildDays(sprints: readonly BurndownSprint[], todayKey: string): string[] {
  const starts = sprints.map((s) => toDateKey(s.startDate))
  const ends = sprints.map((s) => toDateKey(s.endDate))
  const earliest = starts.reduce((min, k) => (k < min ? k : min))
  const latest = ends.reduce((max, k) => (k > max ? k : max))
  const rangeEnd = todayKey > latest ? todayKey : latest
  const days: string[] = []
  for (let k = earliest; k <= rangeEnd; k = nextKey(k)) days.push(k)
  return days
}

function sprintRange(s: BurndownSprint, dayIndex: ReadonlyMap<string, number>, dayCount: number) {
  return {
    start: dayIndex.get(toDateKey(s.startDate)) ?? 0,
    end: dayIndex.get(toDateKey(s.endDate)) ?? dayCount - 1,
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

/**
 * Remaining tasks per day, from the first day through today. Completions dated
 * before the first day count on the first day; days after today are null.
 */
export function buildActualLine(
  sprints: readonly BurndownSprint[],
  days: readonly string[],
  total: number,
  todayKey: string,
): (number | null)[] {
  const doneEvents = new Map<string, number>()
  const firstDay = days[0]
  for (const item of sprints.flatMap((s) => s.items)) {
    if (item.status === "done" && item.completedAt) {
      const raw = toDateKey(item.completedAt)
      const k = raw < firstDay ? firstDay : raw
      doneEvents.set(k, (doneEvents.get(k) ?? 0) + 1)
    }
  }
  let rem = total
  return days.map((day) => {
    if (day > todayKey) return null
    rem -= doneEvents.get(day) ?? 0
    return rem
  })
}

/** Compute the burndown for sprints ordered by startDate ascending. */
export function computeBurndown(rawSprints: readonly BurndownSprint[], now: Date = new Date()): BurndownData {
  const sprints = rawSprints.map((s) => ({ ...s, items: s.items.filter(isRealTask) }))
  if (sprints.length === 0) return EMPTY_BURNDOWN
  const todayKey = toDateKey(now)
  const days = buildDays(sprints, todayKey)
  const dayIndex = new Map(days.map((k, i) => [k, i]))
  const totalTasks = sprints.reduce((sum, s) => sum + s.items.length, 0)
  const idealLine = days.map((_, i) => (days.length <= 1 ? 0 : totalTasks - (totalTasks * i) / (days.length - 1)))
  const planLine = buildPlanLine(sprints, dayIndex, days.length, totalTasks)
  const actualLine = buildActualLine(sprints, days, totalTasks, todayKey)
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
  return { days, totalTasks, idealLine, planLine, actualLine, actualBaseline: null, todayIndex: dayIndex.get(todayKey) ?? -1, sprintMarkers }
}
