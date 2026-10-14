/**
 * Layout of the visual template editor: where each stage's bar sits on a day
 * axis. Positions come from the same scheduler the plan uses for 「日程を
 * 仮置き」 (scheduleFrom), so what the editor shows is what a load produces.
 * Pure.
 */
import { dateFromKey, dayIndex } from "@/lib/plan-progress"
import type { TemplateLink } from "@/lib/plan-templates/links"
import { scheduleFrom, DEFAULT_SCHEDULE_DAYS, type ScheduleNode } from "@/lib/plan-templates/schedule"
import { parseDuration, type EditorNode } from "./editor-state"

/** Day 0 of the axis (a Monday; weekends are not skipped in the preview). */
const EPOCH_KEY = "2001-01-01"
/** Smallest axis length drawn, in days. */
export const MIN_SPAN_DAYS = 30
/** Widest bar-area the axis is squeezed into (px). */
const MAX_AXIS_PX = 2000
export const MAX_DAY_PX = 14
export const MIN_DAY_PX = 2

export type TimelineKind = "task" | "milestone" | "group"

export interface TimelineRow {
  key: string
  name: string
  /** 0 = top level. */
  depth: number
  /** Sibling-index path from the top (stage-ops address). */
  path: number[]
  siblings: number
  node: EditorNode
  kind: TimelineKind
  /** First and last day (0-based, inclusive) on the axis. */
  start: number
  end: number
}

export interface Timeline {
  rows: TimelineRow[]
  /** Days the axis covers (last bar end + 1, at least MIN_SPAN_DAYS). */
  span: number
}

interface Flat {
  node: EditorNode
  parentKey: string | null
  path: number[]
  siblings: number
}

function flatten(nodes: readonly EditorNode[], parentKey: string | null = null, parent: number[] = []): Flat[] {
  return nodes.flatMap((node, i) => [{ node, parentKey, path: [...parent, i], siblings: nodes.length }, ...flatten(node.children, node.key, [...parent, i])])
}

/** Bars of every stage (depth-first, display order) for the stages and their (already effective) links. */
export function buildTimeline(stages: readonly EditorNode[], links: readonly TemplateLink[]): Timeline {
  const flat = flatten(stages)
  const nodes: ScheduleNode[] = flat.map((f, i) => ({
    id: f.node.key,
    parentId: f.parentKey,
    sortOrder: i,
    isMilestone: f.node.isMilestone && f.node.children.length === 0,
    durationDays: parseDuration(f.node.durationDays) ?? null,
    plannedStart: null,
    plannedEnd: null,
  }))
  const epoch = dayIndex(dateFromKey(EPOCH_KEY) as Date)
  const dayOf = (key: string) => dayIndex(dateFromKey(key) as Date) - epoch
  const placed = new Map(
    scheduleFrom(nodes, null, EPOCH_KEY, { dependencies: links.map((l) => ({ predecessorId: l.from, successorId: l.to })) }).map((p) => [p.id, { start: dayOf(p.plannedStart), end: dayOf(p.plannedEnd) }]),
  )
  const rows: TimelineRow[] = []
  const spanOf = (f: Flat): { start: number; end: number } | null => {
    const own = placed.get(f.node.key)
    if (own) return own
    const kids = f.node.children.map((c) => spanOf({ ...f, node: c })).filter((s): s is { start: number; end: number } => s !== null)
    return kids.length > 0 ? { start: Math.min(...kids.map((k) => k.start)), end: Math.max(...kids.map((k) => k.end)) } : null
  }
  for (const f of flat) {
    const s = spanOf(f) ?? { start: 0, end: DEFAULT_SCHEDULE_DAYS - 1 }
    rows.push({
      key: f.node.key,
      name: f.node.name,
      depth: f.path.length - 1,
      path: f.path,
      siblings: f.siblings,
      node: f.node,
      kind: f.node.children.length > 0 ? "group" : f.node.isMilestone ? "milestone" : "task",
      start: s.start,
      end: s.end,
    })
  }
  const last = rows.reduce((m, r) => Math.max(m, r.end), 0)
  return { rows, span: Math.max(MIN_SPAN_DAYS, last + 2) }
}

/** Pixels per day: full size for short plans, squeezed so the axis stays within MAX_AXIS_PX. */
export function dayPxFor(span: number): number {
  return Math.max(MIN_DAY_PX, Math.min(MAX_DAY_PX, Math.floor(MAX_AXIS_PX / Math.max(1, span))))
}

const ELBOW = 8

/** Finish-to-start connector from (x1, y1) at a predecessor's end to (x2, y2) at a successor's start. */
export function arrowPath(x1: number, y1: number, x2: number, y2: number): string {
  if (x2 >= x1 + ELBOW * 2) {
    const mid = x1 + ELBOW
    return `M${x1} ${y1} H${mid} V${y2} H${x2}`
  }
  // Successor starts before / right at the predecessor's end: go around through the row gap.
  const midY = y2 > y1 ? y1 + (y2 - y1) / 2 : y1 - (y1 - y2) / 2
  return `M${x1} ${y1} H${x1 + ELBOW} V${midY} H${x2 - ELBOW} V${y2} H${x2}`
}
