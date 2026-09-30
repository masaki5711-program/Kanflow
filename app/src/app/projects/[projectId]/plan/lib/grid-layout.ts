/**
 * Width of the grid (name column + optional columns) next to the timeline:
 * which columns fit, the name column's default / splitter width, and the
 * phone "names first" layout. Pure; usePlanLayout applies it.
 */
import type { PlanColumn } from "./prefs"

/** Default name column width (desktop) and on a narrow screen where the grid starts names-only. */
export const NAME_COLUMN_WIDTH = 240
export const NAME_COLUMN_WIDTH_COMPACT = 180
/** Names stay legible (≈ 8 CJK characters after handle, chevron and menu) at this width. */
export const NAME_WIDTH_MIN = 160
export const NAME_WIDTH_MAX = 640
/** The splitter never squeezes the visible timeline below this (or 40% of a phone-width chart). */
export const MIN_TIMELINE_WIDTH = 200
const MIN_TIMELINE_SHARE = 0.4
/** The default (not user-set) grid takes at most this share of the chart box: 40 / 60. */
export const DEFAULT_GRID_SHARE = 0.4
/** Phone "names first" layout: the timeline keeps only this peek. */
export const PHONE_TIMELINE_PEEK = 64

export const COLUMN_WIDTH: Record<PlanColumn, number> = {
  period: 128,
  start: 96,
  end: 96,
  duration: 64,
  progress: 104,
  owner: 124,
  status: 140,
}

/** Which optional columns stay when they do not all fit (first = kept longest). */
export const COLUMN_PRIORITY: readonly PlanColumn[] = ["period", "progress", "status", "owner", "start", "end", "duration"]

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

/** Visible columns in canonical order (none while the grid is names-only). */
export function visibleColumns(shown: readonly PlanColumn[], collapsed: boolean, all: readonly PlanColumn[]): PlanColumn[] {
  return collapsed ? [] : all.filter((c) => shown.includes(c))
}

export function columnsWidth(columns: readonly PlanColumn[]): number {
  return columns.reduce((sum, c) => sum + COLUMN_WIDTH[c], 0)
}

export function gridWidth(columns: readonly PlanColumn[], nameWidth: number): number {
  return nameWidth + columnsWidth(columns)
}

/** Timeline width the grid must leave in a chart box `containerWidth` wide. */
export function minTimelineWidth(containerWidth: number): number {
  return Math.min(MIN_TIMELINE_WIDTH, Math.round(containerWidth * MIN_TIMELINE_SHARE))
}

export interface FittedColumns {
  columns: PlanColumn[]
  /** Chosen columns left out because the chart box is too narrow (canonical order). */
  hidden: PlanColumn[]
}

/**
 * The chosen columns that fit next to a legible name column (NAME_WIDTH_MIN)
 * and the minimum timeline; lower-priority columns are left out first.
 * Everything fits while the box is not measured yet (0).
 */
export function fitColumns(columns: readonly PlanColumn[], containerWidth: number): FittedColumns {
  if (containerWidth <= 0) return { columns: [...columns], hidden: [] }
  let room = containerWidth - minTimelineWidth(containerWidth) - NAME_WIDTH_MIN
  const kept = new Set<PlanColumn>()
  for (const c of COLUMN_PRIORITY) {
    if (!columns.includes(c) || COLUMN_WIDTH[c] > room) continue
    kept.add(c)
    room -= COLUMN_WIDTH[c]
  }
  return { columns: columns.filter((c) => kept.has(c)), hidden: columns.filter((c) => !kept.has(c)) }
}

/** Allowed name widths for the splitter in a chart box of `containerWidth` (0 = not measured yet). */
export function nameWidthBounds(containerWidth: number, columns: readonly PlanColumn[]): { min: number; max: number } {
  const roomMax = containerWidth > 0 ? containerWidth - columnsWidth(columns) - minTimelineWidth(containerWidth) : NAME_WIDTH_MAX
  return { min: NAME_WIDTH_MIN, max: clamp(roomMax, NAME_WIDTH_MIN, NAME_WIDTH_MAX) }
}

export interface NameWidthMode {
  /** Below md: the grid starts names-only at 180px. */
  compact: boolean
  /** Below lg (tablets): the default grid takes ≤ 40% of the box (40 / 60 split). */
  tablet?: boolean
}

/** Name width before the viewer moves the splitter: 240px (180 compact; tablets capped to a 40% grid). */
export function defaultNameWidth(containerWidth: number, columns: readonly PlanColumn[], mode: NameWidthMode): number {
  if (mode.compact) return NAME_COLUMN_WIDTH_COMPACT
  if (!mode.tablet || containerWidth <= 0) return NAME_COLUMN_WIDTH
  return Math.min(NAME_COLUMN_WIDTH, Math.round(containerWidth * DEFAULT_GRID_SHARE) - columnsWidth(columns))
}

/**
 * Name column width actually used: the viewer's splitter width (or the
 * default) kept inside the bounds, so the timeline always keeps its minimum.
 */
export function resolveNameWidth(pref: number | null, opts: NameWidthMode & { containerWidth: number; columns: readonly PlanColumn[] }): number {
  const { min, max } = nameWidthBounds(opts.containerWidth, opts.columns)
  return clamp(Math.round(pref ?? defaultNameWidth(opts.containerWidth, opts.columns, opts)), min, max)
}

/** Phone "names first": the name column takes the box except a timeline peek. */
export function phoneNamesWidth(containerWidth: number): number {
  return Math.max(NAME_WIDTH_MIN, Math.round(containerWidth) - PHONE_TIMELINE_PEEK)
}
