/**
 * Time scale of the timeline: visible day range per zoom and the two header
 * tiers (day → months + days, week → months + ISO weeks, month → years +
 * months, quarter → years + quarters).
 */
import type { Language } from "@/lib/i18n"
import {
  dayParts,
  isWeekendDay,
  isoWeekStartDay,
  monthStartDay,
  nextMonthStartDay,
  quarterStartDay,
  ymdToDay,
} from "./date"
import { formatMonthDay, formatMonthYear, formatYear, monthShort, weekdayInitial } from "./date-format"
import type { PlanItem, Ymd } from "./plan-types"

export type PlanZoom = "day" | "week" | "month" | "quarter"
export const PLAN_ZOOMS: readonly PlanZoom[] = ["day", "week", "month", "quarter"]

export const ZOOM_DAY_WIDTH: Record<PlanZoom, number> = { day: 32, week: 14, month: 5, quarter: 2 }
const PAD_DAYS: Record<PlanZoom, number> = { day: 7, week: 14, month: 31, quarter: 92 }
const MIN_SPAN_DAYS: Record<PlanZoom, number> = { day: 42, week: 120, month: 400, quarter: 800 }
/** Extra room right of the last date so chips / milestone names / drag tooltips are never clipped. */
export const TRAILING_GUTTER_PX = 200

export function isPlanZoom(value: unknown): value is PlanZoom {
  return typeof value === "string" && (PLAN_ZOOMS as readonly string[]).includes(value)
}

function alignStart(day: number, zoom: PlanZoom): number {
  if (zoom === "day" || zoom === "week") return isoWeekStartDay(day)
  if (zoom === "month") return monthStartDay(day)
  return quarterStartDay(day)
}

export interface ChartRange {
  startDay: number
  /** Number of days shown (end = startDay + days, exclusive). */
  days: number
}

/** Days covered by every item date (planned, actual, baseline) and today, padded and unit-aligned. */
export function chartRange(items: readonly PlanItem[], today: Ymd, zoom: PlanZoom): ChartRange {
  let min = ymdToDay(today)
  let max = min
  for (const it of items) {
    for (const v of [it.plannedStart, it.plannedEnd, it.actualStart, it.actualEnd, it.baselineStart, it.baselineEnd]) {
      if (!v) continue
      const d = ymdToDay(v)
      if (d < min) min = d
      if (d > max) max = d
    }
  }
  const startDay = alignStart(min - PAD_DAYS[zoom], zoom)
  const gutterDays = Math.ceil(TRAILING_GUTTER_PX / ZOOM_DAY_WIDTH[zoom])
  const endDay = Math.max(max + Math.max(PAD_DAYS[zoom], gutterDays) + 1, startDay + MIN_SPAN_DAYS[zoom])
  return { startDay, days: endDay - startDay }
}

export interface ScaleCell {
  key: string
  label: string
  /** Second line (weekday initial in day zoom). */
  sub?: string
  x: number
  width: number
  weekend?: boolean
}

export interface TimeScale {
  top: ScaleCell[]
  bottom: ScaleCell[]
  /** Day offsets (from startDay) that are Saturday/Sunday — shaded in day and week zoom. */
  weekendOffsets: number[]
  width: number
}

/** Split [start, end) at the boundaries produced by `next(day)`. */
function segments(start: number, end: number, next: (day: number) => number): [number, number][] {
  const out: [number, number][] = []
  let cursor = start
  while (cursor < end) {
    const boundary = Math.min(end, Math.max(cursor + 1, next(cursor)))
    out.push([cursor, boundary])
    cursor = boundary
  }
  return out
}

const nextWeek = (day: number) => isoWeekStartDay(day) + 7
const nextQuarter = (day: number) => {
  let d = nextMonthStartDay(day)
  while ((dayParts(d).month - 1) % 3 !== 0) d = nextMonthStartDay(d)
  return d
}
const nextYear = (day: number) => {
  let d = nextMonthStartDay(day)
  while (dayParts(d).month !== 1) d = nextMonthStartDay(d)
  return d
}

/** The zoom whose header tiers read well at `dayWidth` px per day (print fit-to-page uses any width). */
export function zoomForDayWidth(dayWidth: number): PlanZoom {
  if (dayWidth >= 20) return "day"
  if (dayWidth >= 7) return "week"
  if (dayWidth >= 2.5) return "month"
  return "quarter"
}

/** Header tiers of `range` at `zoom`; `dayWidth` defaults to the zoom's width (print passes a fitted one). */
export function buildScale(range: ChartRange, zoom: PlanZoom, language: Language, dayWidth: number = ZOOM_DAY_WIDTH[zoom]): TimeScale {
  const dw = dayWidth
  const { startDay } = range
  const endDay = startDay + range.days
  const cell = (key: string, [a, b]: [number, number], label: string, extra?: Partial<ScaleCell>): ScaleCell => ({
    key,
    label,
    x: (a - startDay) * dw,
    width: (b - a) * dw,
    ...extra,
  })

  const byMonth = segments(startDay, endDay, nextMonthStartDay)
  const byYear = segments(startDay, endDay, nextYear)
  const top =
    zoom === "day" || zoom === "week"
      ? byMonth.map((s) => cell(`m${s[0]}`, s, formatMonthYear(s[0], language)))
      : byYear.map((s) => cell(`y${s[0]}`, s, formatYear(s[0], language)))

  let bottom: ScaleCell[]
  if (zoom === "day") {
    bottom = segments(startDay, endDay, (d) => d + 1).map((s) =>
      cell(`d${s[0]}`, s, String(dayParts(s[0]).day), { sub: weekdayInitial(s[0], language), weekend: isWeekendDay(s[0]) }),
    )
  } else if (zoom === "week") {
    bottom = segments(startDay, endDay, nextWeek).map((s) => cell(`w${s[0]}`, s, formatMonthDay(isoWeekStartDay(s[0]), language)))
  } else if (zoom === "month") {
    bottom = byMonth.map((s) => cell(`mm${s[0]}`, s, monthShort(s[0], language)))
  } else {
    bottom = segments(startDay, endDay, nextQuarter).map((s) =>
      cell(`q${s[0]}`, s, `Q${Math.floor((dayParts(s[0]).month - 1) / 3) + 1}`),
    )
  }

  const weekendOffsets: number[] = []
  if (zoom === "day" || zoom === "week") {
    for (let d = startDay; d < endDay; d++) if (isWeekendDay(d)) weekendOffsets.push(d - startDay)
  }
  return { top, bottom, weekendOffsets, width: range.days * dw }
}
