// Pure geometry for the burndown SVG (unit-tested in burndown-geometry.test.ts).
import type { EntityI18n } from "@/lib/translation/types"

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
  actualLine: (number | null)[]
  actualBaseline: number | null
  /** Today (Asia/Tokyo) in `days`, -1 outside the range; older payloads lack it. */
  todayIndex?: number
  sprintMarkers: SprintMarker[]
}

export const CHART_WIDTH = 800
export const CHART_HEIGHT = 340
export const PADDING = { top: 48, right: 30, bottom: 60, left: 60 } as const
export const INNER_WIDTH = CHART_WIDTH - PADDING.left - PADDING.right
export const INNER_HEIGHT = CHART_HEIGHT - PADDING.top - PADDING.bottom

/** Sprint band labels sit above the plot (never under the lines); the today label sits just below them. */
export const BAND_LABEL_Y = 16
export const TODAY_LABEL_Y = PADDING.top - 8

export interface Point {
  x: number
  y: number
}

/** Actual series as (dayIndex, value); the optional baseline precedes the first actual value. */
export function actualPoints(data: Pick<BurndownData, "actualLine" | "actualBaseline">): Point[] {
  const firstIdx = data.actualLine.findIndex((v) => v !== null)
  const baseline = data.actualBaseline !== null && firstIdx >= 0 ? [{ x: firstIdx, y: data.actualBaseline }] : []
  const values = data.actualLine.flatMap((v, i) => (v === null ? [] : [{ x: i, y: v }]))
  return [...baseline, ...values]
}

/** Integer Y ticks from 0 to ceil(maxY), always ending on the max. */
export function yTicks(maxY: number): number[] {
  const ceilMax = Math.ceil(maxY)
  const step = ceilMax <= 10 ? 1 : ceilMax <= 30 ? 5 : ceilMax <= 60 ? 10 : Math.ceil(ceilMax / 5 / 10) * 10
  const ticks: number[] = []
  for (let v = 0; v <= ceilMax; v += step) ticks.push(v)
  return ticks[ticks.length - 1] < ceilMax ? [...ticks, ceilMax] : ticks
}

/** Show every Nth X label so they don't overlap. */
export function labelInterval(dayCount: number): number {
  if (dayCount <= 14) return 1
  if (dayCount <= 30) return 2
  if (dayCount <= 60) return 4
  return Math.ceil(dayCount / 15)
}

export interface Scale {
  toX: (index: number) => number
  toY: (value: number) => number
  maxY: number
}

export function makeScale(data: BurndownData, points: Point[]): Scale {
  const dayCount = data.days.length
  const maxY = Math.max(...data.idealLine, ...data.planLine, ...points.map((p) => p.y), 1)
  return {
    maxY,
    toX: (index) => PADDING.left + (index / Math.max(dayCount - 1, 1)) * INNER_WIDTH,
    toY: (value) => PADDING.top + INNER_HEIGHT - (value / maxY) * INNER_HEIGHT,
  }
}

/** SVG path through non-null values (gaps are skipped, not broken). */
export function linePath(values: (number | null)[], scale: Scale): string {
  return values
    .flatMap((v, i) => (v === null ? [] : [`${scale.toX(i)} ${scale.toY(v)}`]))
    .map((xy, i) => `${i === 0 ? "M" : "L"} ${xy}`)
    .join(" ")
}

const SERIES_EPSILON = 0.01

/** True when two series are the same at every index (e.g. ideal vs plan of a single sprint). */
export function sameSeries(a: readonly number[], b: readonly number[]): boolean {
  return a.length === b.length && a.every((v, i) => Math.abs(v - b[i]) < SERIES_EPSILON)
}

export function pointsPath(points: Point[], scale: Scale): string {
  return points.map((p, i) => `${i === 0 ? "M" : "L"} ${scale.toX(p.x)} ${scale.toY(p.y)}`).join(" ")
}

export function isWeekend(day: string): boolean {
  const dow = new Date(`${day}T00:00:00`).getDay()
  return dow === 0 || dow === 6
}
