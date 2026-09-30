// Pure geometry of the velocity bar chart (unit-tested in velocity-geometry.test.ts).
import type { EntityI18n } from "@/lib/translation/types"
import { yTicks } from "./burndown-geometry"

export interface VelocityPoint {
  id: string
  name: string
  status: string
  points: number
  capacity: number
  endDate: string
  /** Sprint-name translations (`sprintName`). */
  i18n?: EntityI18n
}

export interface VelocityData {
  sprints: VelocityPoint[]
  average: number | null
  pointUnit: string
}

export const V_WIDTH = 640
export const V_HEIGHT = 260
export const V_PADDING = { top: 24, right: 16, bottom: 44, left: 44 } as const
export const V_INNER_WIDTH = V_WIDTH - V_PADDING.left - V_PADDING.right
export const V_INNER_HEIGHT = V_HEIGHT - V_PADDING.top - V_PADDING.bottom
/** Share of a slot taken by its bar (the rest is the gap). */
const BAR_RATIO = 0.56
/** Bars never get wider than this (few sprints would otherwise give slabs). */
const MAX_BAR = 56

export interface VelocityScale {
  maxY: number
  ticks: number[]
  toY: (value: number) => number
  /** Horizontal slot of bar `index`: its left x, width and centre. */
  bar: (index: number) => { x: number; width: number; center: number }
}

export function velocityScale(data: Pick<VelocityData, "sprints" | "average">): VelocityScale {
  const peak = Math.max(1, data.average ?? 0, ...data.sprints.flatMap((s) => [s.points, s.capacity]))
  const ticks = yTicks(peak)
  const maxY = ticks[ticks.length - 1]
  const slot = V_INNER_WIDTH / Math.max(data.sprints.length, 1)
  const width = Math.min(slot * BAR_RATIO, MAX_BAR)
  return {
    maxY,
    ticks,
    toY: (value) => V_PADDING.top + V_INNER_HEIGHT - (Math.max(0, value) / maxY) * V_INNER_HEIGHT,
    bar: (index) => {
      const center = V_PADDING.left + slot * index + slot / 2
      return { x: center - width / 2, width, center }
    },
  }
}
