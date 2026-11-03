/**
 * Base schedule (ベースのスケジュール, `schedule.yml` of a spec template) → 全体計画 rows.
 *
 * The agent reads `schedule.yml` and sends it as JSON: phases / milestones as a tree with relative
 * durations (days) and dependencies. With a start date this module places every leaf (the same
 * placement as 「日程を仮置き」: `scheduleFrom`) and derives the parents' spans. Pure; the server
 * recomputes it on approval, so dates inside a stored proposal are only a preview.
 */
import { z } from "zod"
import { dateFromKey } from "@/lib/plan-progress"
import { firstLinkProblem, type TemplateLink } from "@/lib/plan-templates/links"
import { scheduleFrom, type ScheduleNode } from "@/lib/plan-templates/schedule"
import { WorkCalendar } from "@/lib/plan-leveling/from-schedule"

export const BASE_SCHEDULE_MAX_ITEMS = 500
export const BASE_SCHEDULE_MAX_DEPTH = 5
export const BASE_SCHEDULE_MAX_DURATION = 3650
/** `role`: a short identifier (who does the work, e.g. "procurement"); letters, digits, _ and -. */
export const BASE_SCHEDULE_ROLE_MAX = 32
/** `formerKeys` per item (keys this item had in earlier versions of the template). */
export const BASE_SCHEDULE_MAX_FORMER_KEYS = 10

export interface BaseScheduleItem {
  /** Unique id inside the schedule; `dependsOn` refers to it. */
  key: string
  name: string
  /** Relative duration in days (calendar, or Monday–Friday with skipWeekends). Default 1. */
  durationDays?: number
  /** A milestone sits on the last day of its window. */
  milestone?: boolean
  /** Keys of items that must finish first (finish to start). */
  dependsOn?: string[]
  children?: BaseScheduleItem[]
  /**
   * Optional (plan 12 E0): who does the work, as a short identifier ("procurement", "qa"). Not used for
   * placement; stored with the load so finished projects can later be compared per role.
   */
  role?: string
  /**
   * Optional (plan 12 E0): the share of one person's time the item takes, 0..1. Absent = 1 (full time);
   * never filled in by validation so an old schedule's stored content and hash stay exactly as given.
   */
  load?: number
  /**
   * Optional (plan 12 E0): keys this item had in earlier versions of the template, so actuals recorded under
   * an old key still map to it (`keyAliases`). Unique across the schedule and never equal to a current key.
   * `dependsOn` always uses current keys.
   */
  formerKeys?: string[]
  /**
   * Optional (plan 12 E5): the leaf starts no earlier than this many working days after the start (Mon–Fri with
   * skipWeekends) — how a levelled proposal is written as a constraint, so the server recomputes the dates on
   * approval instead of trusting them. Leaves only; ignored on a parent.
   */
  notBeforeOffsetDays?: number
}

export interface BaseSchedule {
  items: BaseScheduleItem[]
  skipWeekends?: boolean
}

const keySchema = z.string().regex(/^[A-Za-z0-9_-]{1,40}$/, "key: letters, digits, _ and - (1-40 chars)")

const itemSchema: z.ZodType<BaseScheduleItem> = z.lazy(() =>
  z.object({
    key: keySchema,
    name: z.string().trim().min(1).max(255),
    durationDays: z.number().int().min(1).max(BASE_SCHEDULE_MAX_DURATION).optional(),
    milestone: z.boolean().optional(),
    dependsOn: z.array(keySchema).max(50).optional(),
    children: z.array(itemSchema).max(BASE_SCHEDULE_MAX_ITEMS).optional(),
    role: z.string().regex(new RegExp(`^[A-Za-z0-9_-]{1,${BASE_SCHEDULE_ROLE_MAX}}$`), `role: letters, digits, _ and - (1-${BASE_SCHEDULE_ROLE_MAX} chars)`).optional(),
    load: z.number().min(0).max(1).optional(),
    formerKeys: z.array(keySchema).max(BASE_SCHEDULE_MAX_FORMER_KEYS).optional(),
    notBeforeOffsetDays: z.number().int().min(0).max(BASE_SCHEDULE_MAX_DURATION).optional(),
  })
)

export const baseScheduleSchema = z.object({
  items: z.array(itemSchema).min(1).max(BASE_SCHEDULE_MAX_ITEMS),
  skipWeekends: z.boolean().optional(),
})

export const startDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "startDate: YYYY-MM-DD")

export type PlanScheduleErrorCode = "PLAN_SCHEDULE_TOO_LARGE" | "PLAN_SCHEDULE_TOO_DEEP" | "PLAN_SCHEDULE_INVALID" | "INVALID_DATE"

export class PlanScheduleError extends Error {
  constructor(readonly code: PlanScheduleErrorCode, message: string) {
    super(message)
    this.name = "PlanScheduleError"
  }
}

/** One row to create (parents always precede their children). */
export interface PlannedRow {
  key: string
  parentKey: string | null
  name: string
  isMilestone: boolean
  durationDays: number | null
  /** 0-based position among the siblings. */
  siblingIndex: number
  depth: number
  plannedStart: string
  plannedEnd: string
  dependsOn: string[]
}

export interface PlannedSchedule {
  rows: PlannedRow[]
  plannedStart: string
  plannedEnd: string
}

interface Flat {
  item: BaseScheduleItem
  parentKey: string | null
  depth: number
  siblingIndex: number
}

function flatten(items: readonly BaseScheduleItem[], parentKey: string | null, depth: number, out: Flat[]): void {
  items.forEach((item, siblingIndex) => {
    out.push({ item, parentKey, depth, siblingIndex })
    flatten(item.children ?? [], item.key, depth + 1, out)
  })
}

function fail(code: PlanScheduleErrorCode, message: string): never {
  throw new PlanScheduleError(code, message)
}

/**
 * Validate and place. Throws PlanScheduleError: more than 500 items, deeper than 5 levels, a duplicate
 * key, an unknown / self / ancestor dependency, a dependency cycle, an invalid start date.
 */
/** Current keys of the schedule; fails on a duplicate key or a former key that collides (see `keyAliases`). */
function collectKeys(flat: readonly Flat[]): Set<string> {
  const keys = new Set<string>()
  for (const { item } of flat) {
    if (keys.has(item.key)) fail("PLAN_SCHEDULE_INVALID", `Duplicate key: ${item.key}`)
    keys.add(item.key)
  }
  const former = new Set<string>()
  for (const { item } of flat) {
    for (const old of item.formerKeys ?? []) {
      if (keys.has(old)) fail("PLAN_SCHEDULE_INVALID", `Former key ${old} of ${item.key} is a current key`)
      if (former.has(old)) fail("PLAN_SCHEDULE_INVALID", `Former key ${old} is listed more than once`)
      former.add(old)
    }
  }
  return keys
}

/**
 * Every key a schedule item answers to → its current key: the current keys map to themselves and each
 * `formerKeys` entry to the item that lists it. Fails like `planBaseSchedule` on duplicates / collisions.
 */
export function keyAliases(schedule: BaseSchedule): Map<string, string> {
  const flat: Flat[] = []
  flatten(schedule.items, null, 1, flat)
  collectKeys(flat)
  const aliases = new Map<string, string>()
  for (const { item } of flat) {
    aliases.set(item.key, item.key)
    for (const old of item.formerKeys ?? []) aliases.set(old, item.key)
  }
  return aliases
}

export function planBaseSchedule(schedule: BaseSchedule, startDate: string): PlannedSchedule {
  const start = dateFromKey(startDate)
  if (!start) fail("INVALID_DATE", `startDate is not a valid date: ${startDate}`)
  const flat: Flat[] = []
  flatten(schedule.items, null, 1, flat)
  if (flat.length > BASE_SCHEDULE_MAX_ITEMS) fail("PLAN_SCHEDULE_TOO_LARGE", `A schedule has at most ${BASE_SCHEDULE_MAX_ITEMS} items (got ${flat.length})`)
  const deepest = Math.max(...flat.map((f) => f.depth))
  if (deepest > BASE_SCHEDULE_MAX_DEPTH) fail("PLAN_SCHEDULE_TOO_DEEP", `A schedule is at most ${BASE_SCHEDULE_MAX_DEPTH} levels deep (got ${deepest})`)

  const keys = collectKeys(flat)
  const links: TemplateLink[] = []
  for (const { item } of flat) {
    for (const from of item.dependsOn ?? []) {
      if (!keys.has(from)) fail("PLAN_SCHEDULE_INVALID", `Item ${item.key} depends on unknown key ${from}`)
      links.push({ from, to: item.key })
    }
  }
  // self / ancestor-descendant / duplicate / cycle: the same rules the plan itself enforces.
  const problem = firstLinkProblem(schedule.items, links)
  if (problem) fail("PLAN_SCHEDULE_INVALID", problem)

  const nodes: ScheduleNode[] = flat.map((f) => ({
    id: f.item.key,
    parentId: f.parentKey,
    sortOrder: f.siblingIndex,
    // A parent's span is derived from its children, so it is never a milestone.
    isMilestone: f.item.milestone === true && (f.item.children ?? []).length === 0,
    durationDays: f.item.durationDays ?? null,
    plannedStart: null,
    plannedEnd: null,
  }))
  const skipWeekends = schedule.skipWeekends === true
  const calendar = new WorkCalendar(startDate, skipWeekends)
  const notBefore = new Map<string, string>()
  for (const { item } of flat) if (item.notBeforeOffsetDays !== undefined && (item.children ?? []).length === 0) notBefore.set(item.key, calendar.keyOf(item.notBeforeOffsetDays))
  const placed = new Map(
    scheduleFrom(nodes, null, startDate, {
      skipWeekends,
      dependencies: links.map((l) => ({ predecessorId: l.from, successorId: l.to })),
      ...(notBefore.size > 0 ? { notBefore } : {}),
    }).map((p) => [p.id, p])
  )

  const span = new Map<string, { start: string; end: string }>()
  const childrenOf = new Map<string, Flat[]>()
  for (const f of flat) if (f.parentKey) childrenOf.set(f.parentKey, [...(childrenOf.get(f.parentKey) ?? []), f])
  const spanOf = (f: Flat): { start: string; end: string } => {
    const cached = span.get(f.item.key)
    if (cached) return cached
    const kids = childrenOf.get(f.item.key) ?? []
    let result: { start: string; end: string }
    if (kids.length === 0) {
      const p = placed.get(f.item.key)
      if (!p) fail("PLAN_SCHEDULE_INVALID", `Could not place ${f.item.key}`)
      result = { start: p.plannedStart, end: p.plannedEnd }
    } else {
      const spans = kids.map(spanOf)
      result = { start: spans.map((s) => s.start).sort()[0], end: spans.map((s) => s.end).sort().reverse()[0] }
    }
    span.set(f.item.key, result)
    return result
  }

  const rows: PlannedRow[] = flat.map((f) => {
    const s = spanOf(f)
    const hasKids = (f.item.children ?? []).length > 0
    return {
      key: f.item.key,
      parentKey: f.parentKey,
      name: f.item.name,
      isMilestone: !hasKids && f.item.milestone === true,
      durationDays: f.item.durationDays ?? null,
      siblingIndex: f.siblingIndex,
      depth: f.depth,
      plannedStart: s.start,
      plannedEnd: s.end,
      dependsOn: f.item.dependsOn ?? [],
    }
  })
  return {
    rows,
    plannedStart: rows.map((r) => r.plannedStart).sort()[0],
    plannedEnd: rows.map((r) => r.plannedEnd).sort().reverse()[0],
  }
}
