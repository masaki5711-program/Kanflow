import { prisma } from "@/lib/prisma"
import { LIVE_PBI, NOT_DELETED } from "@/services/_shared/soft-delete"
import type { ToolDefinition, ToolHandler } from "@/lib/chat-tools-types"
import { DAY_MS, daysBetween, iso, now, pct, strArg, trunc } from "@/lib/tool-helpers"

/**
 * Planning pack (P3): master plan, releases, product goals, calendar.
 * Same contract as analysis-tools.ts — deterministic aggregation in code,
 * compact JSON with `as_of`, capped lists, every query scoped to projectId,
 * trashed PBIs excluded.
 */

export const PLANNING_TOOL_DEFS: ToolDefinition[] = [
  {
    type: "function",
    function: {
      name: "get_plan_progress",
      description:
        "Master plan (全体計画) status: overall progress %, top-level items with progress, overdue items (planned end passed, not done), and upcoming milestones. Use for 'is the overall plan on schedule', 'what is overdue in the plan'.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "get_release_status",
      description:
        "Releases grouped by version: release date, item status counts, and how many included PBIs are completed. Use for 'when is the next release', 'is release X ready'.",
      parameters: {
        type: "object",
        properties: {
          release_version: { type: "string", description: "Optional version (substring match). Omit for all releases." },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_goal_progress",
      description:
        "Product goals with their linked PBIs: completion by count and story points, and open items. Use for 'how far are we toward the product goal'.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "get_calendar",
      description:
        "Calendar events plus sprint start/end dates in a date range (default: today + 14 days, max 60 days). Use for schedule questions like 'what is coming up next week'.",
      parameters: {
        type: "object",
        properties: {
          from: { type: "string", description: "Start date YYYY-MM-DD (default today)." },
          to: { type: "string", description: "End date YYYY-MM-DD (default from + 14 days, max from + 60 days)." },
        },
      },
    },
  },
]

// ── get_plan_progress ───────────────────────────────────────────────────────

export interface PlanRow {
  id: string
  parentId: string | null
  name: string
  plannedStart: Date
  plannedEnd: Date
  progressPct: number
  status: string
  isMilestone: boolean
  sortOrder: number
}

const TOP_LEVEL_CAP = 20
const OVERDUE_CAP = 15
const MILESTONE_CAP = 10
const MILESTONE_WINDOW_DAYS = 30

/** Pure: plan tree summary (overall % = average of the roots, like the plan page). */
export function summarizePlan(rows: readonly PlanRow[], today: Date) {
  const byId = new Map(rows.map((r) => [r.id, r]))
  const childCount = new Map<string, number>()
  for (const r of rows) if (r.parentId) childCount.set(r.parentId, (childCount.get(r.parentId) ?? 0) + 1)
  const roots = rows.filter((r) => !r.parentId || !byId.has(r.parentId)).sort((a, b) => a.sortOrder - b.sortOrder)
  const isOverdue = (r: PlanRow) => r.status !== "done" && r.progressPct < 100 && r.plannedEnd.getTime() < today.getTime()
  const byStatus: Record<string, number> = {}
  for (const r of rows) byStatus[r.status] = (byStatus[r.status] ?? 0) + 1

  const overdue = rows
    .filter(isOverdue)
    .sort((a, b) => a.plannedEnd.getTime() - b.plannedEnd.getTime())
  const horizon = today.getTime() + MILESTONE_WINDOW_DAYS * DAY_MS
  const milestones = rows
    .filter((r) => r.isMilestone && r.status !== "done" && r.plannedEnd.getTime() >= today.getTime() && r.plannedEnd.getTime() <= horizon)
    .sort((a, b) => a.plannedEnd.getTime() - b.plannedEnd.getTime())

  return {
    total_items: rows.length,
    overall_progress_pct: roots.length > 0 ? Math.round(roots.reduce((s, r) => s + r.progressPct, 0) / roots.length) : null,
    by_status: byStatus,
    top_level: roots.slice(0, TOP_LEVEL_CAP).map((r) => ({
      name: trunc(r.name, 60),
      period: `${iso(r.plannedStart)}..${iso(r.plannedEnd)}`,
      progress_pct: r.progressPct,
      status: r.status,
      children: childCount.get(r.id) ?? 0,
      overdue: isOverdue(r),
    })),
    overdue_count: overdue.length,
    overdue_items: overdue.slice(0, OVERDUE_CAP).map((r) => ({
      name: trunc(r.name, 60),
      parent: r.parentId ? trunc(byId.get(r.parentId)?.name, 40) || null : null,
      planned_end: iso(r.plannedEnd),
      days_overdue: daysBetween(r.plannedEnd, today),
      progress_pct: r.progressPct,
      status: r.status,
    })),
    upcoming_milestones: milestones.slice(0, MILESTONE_CAP).map((r) => ({
      name: trunc(r.name, 60),
      date: iso(r.plannedEnd),
      days_left: daysBetween(today, r.plannedEnd),
    })),
    note: `overdue = planned end passed and not done; milestones within ${MILESTONE_WINDOW_DAYS} days`,
  }
}

// ── get_release_status ──────────────────────────────────────────────────────

export interface ReleaseRow {
  releaseVersion: string | null
  releaseDate: Date | null
  status: string
  initiative: string | null
  userStory: string | null
  pbItem: { displayId: number; status: string; initiative: string | null } | null
}

const RELEASE_CAP = 8
const RELEASE_ITEM_CAP = 10
const UNVERSIONED = "(unversioned)"

/** Pure: group release items by version. Newest release date first, unversioned last. */
export function summarizeReleases(rows: readonly ReleaseRow[], today: Date) {
  const groups = new Map<string, ReleaseRow[]>()
  for (const r of rows) {
    const key = r.releaseVersion?.trim() || UNVERSIONED
    groups.set(key, [...(groups.get(key) ?? []), r])
  }
  const releases = Array.from(groups.entries()).map(([version, items]) => {
    const dates = items.map((i) => i.releaseDate).filter((d): d is Date => d !== null).sort((a, b) => a.getTime() - b.getTime())
    const date = dates[0] ?? null
    const byStatus: Record<string, number> = {}
    for (const i of items) byStatus[i.status] = (byStatus[i.status] ?? 0) + 1
    const linked = items.filter((i) => i.pbItem)
    const completed = linked.filter((i) => i.pbItem?.status === "completed").length
    return {
      version,
      release_date: date ? iso(date) : null,
      days_until: date ? daysBetween(today, date) : null,
      item_count: items.length,
      by_status: byStatus,
      linked_pbis: { completed, total: linked.length, completion_pct: pct(completed, linked.length) },
      items: items.slice(0, RELEASE_ITEM_CAP).map((i) => ({
        title: trunc(i.initiative || i.pbItem?.initiative || i.userStory, 60) || "(untitled)",
        status: i.status,
        pbi: i.pbItem ? `#${i.pbItem.displayId}` : null,
        pbi_status: i.pbItem?.status ?? null,
      })),
    }
  })
  const sortKey = (r: (typeof releases)[number]) => (r.release_date ? Date.parse(r.release_date) : null)
  const sorted = [...releases].sort((a, b) => {
    const ka = sortKey(a)
    const kb = sortKey(b)
    if (ka === null) return 1
    if (kb === null) return -1
    return kb - ka
  })
  return sorted.slice(0, RELEASE_CAP)
}

// ── get_calendar ────────────────────────────────────────────────────────────

const CALENDAR_DEFAULT_DAYS = 14
const CALENDAR_MAX_DAYS = 60
const CALENDAR_EVENT_CAP = 50

function parseDay(value: unknown): Date | null | undefined {
  const s = strArg(value, 10)
  if (s === undefined) return undefined
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null
  const d = new Date(`${s}T00:00:00Z`)
  return Number.isNaN(d.getTime()) ? null : d
}

/** Pure: resolve the [from, to] window (inclusive days); error text for bad input. */
export function resolveCalendarRange(fromArg: unknown, toArg: unknown, today: Date):
  | { from: Date; to: Date; clamped: boolean }
  | { error: string } {
  const from = parseDay(fromArg)
  const to = parseDay(toArg)
  if (from === null || to === null) return { error: "dates must be YYYY-MM-DD" }
  const start = from ?? new Date(`${iso(today)}T00:00:00Z`)
  const end = to ?? new Date(start.getTime() + CALENDAR_DEFAULT_DAYS * DAY_MS)
  if (end.getTime() < start.getTime()) return { error: "`to` is before `from`" }
  const maxEnd = new Date(start.getTime() + CALENDAR_MAX_DAYS * DAY_MS)
  return end.getTime() > maxEnd.getTime() ? { from: start, to: maxEnd, clamped: true } : { from: start, to: end, clamped: false }
}

// ── handlers ────────────────────────────────────────────────────────────────

export const planningHandlers: Record<string, ToolHandler> = {
  async get_plan_progress({ projectId }) {
    const rows = await prisma.planItem.findMany({
      where: { projectId, ...NOT_DELETED },
      select: {
        id: true, parentId: true, name: true, plannedStart: true, plannedEnd: true,
        progressPct: true, status: true, isMilestone: true, sortOrder: true,
      },
      take: 1000,
    })
    if (rows.length === 0) return JSON.stringify({ as_of: iso(now()), total_items: 0, note: "no master plan items in this project" })
    return JSON.stringify({ as_of: iso(now()), ...summarizePlan(rows, now()) })
  },

  async get_release_status({ projectId, args }) {
    const version = strArg(args.release_version, 100)
    const rows = await prisma.releaseBacklogItem.findMany({
      where: {
        projectId,
        // Items whose PBI is in the trash are hidden like the PBI itself.
        OR: [{ pbItemId: null }, LIVE_PBI],
        ...(version ? { releaseVersion: { contains: version } } : {}),
      },
      select: {
        releaseVersion: true, releaseDate: true, status: true, initiative: true, userStory: true,
        pbItem: { select: { displayId: true, status: true, initiative: true } },
      },
      orderBy: { releaseDate: "desc" },
      take: 400,
    })
    return JSON.stringify({
      as_of: iso(now()),
      filter: version ?? null,
      release_count: new Set(rows.map((r) => r.releaseVersion?.trim() || UNVERSIONED)).size,
      releases: summarizeReleases(rows, now()),
      note: `item status: staged | ready | released | deferred; up to ${RELEASE_CAP} releases, ${RELEASE_ITEM_CAP} items each`,
    })
  },

  async get_goal_progress({ projectId }) {
    const [goals, unlinked] = await Promise.all([
      prisma.productGoal.findMany({
        where: { projectId },
        orderBy: { createdAt: "asc" },
        take: 15,
        select: {
          title: true,
          description: true,
          backlogItems: {
            where: NOT_DELETED,
            select: { displayId: true, status: true, workloadScore: true, initiative: true, userStory: true },
          },
        },
      }),
      prisma.productBacklogItem.count({ where: { projectId, ...NOT_DELETED, productGoalId: null } }),
    ])
    return JSON.stringify({
      as_of: iso(now()),
      goal_count: goals.length,
      goals: goals.map((g) => {
        const items = g.backlogItems
        const done = items.filter((i) => i.status === "completed")
        const spTotal = items.reduce((s, i) => s + i.workloadScore, 0)
        const spDone = done.reduce((s, i) => s + i.workloadScore, 0)
        return {
          title: trunc(g.title, 80),
          description: trunc(g.description, 120) || null,
          pbis: { completed: done.length, total: items.length },
          story_points: { completed: spDone, total: spTotal },
          completion_pct: spTotal > 0 ? pct(spDone, spTotal) : pct(done.length, items.length),
          open_items: items
            .filter((i) => i.status !== "completed")
            .slice(0, 5)
            .map((i) => ({ id: `#${i.displayId}`, status: i.status, sp: i.workloadScore, title: trunc(i.initiative || i.userStory, 50) })),
        }
      }),
      pbis_without_goal: unlinked,
      note: "completion_pct is by story points (by count when no points are set)",
    })
  },

  async get_calendar({ projectId, args }) {
    const range = resolveCalendarRange(args.from, args.to, now())
    if ("error" in range) return JSON.stringify({ error: range.error })
    const { from, to } = range
    // `to` is inclusive: everything before the next midnight.
    const toExclusive = new Date(to.getTime() + DAY_MS)
    const [events, sprints] = await Promise.all([
      prisma.calendarEvent.findMany({
        where: {
          projectId,
          date: { lt: toExclusive },
          OR: [{ endDate: { gte: from } }, { endDate: null, date: { gte: from } }],
        },
        orderBy: { date: "asc" },
        take: CALENDAR_EVENT_CAP,
        select: { title: true, description: true, date: true, endDate: true, allDay: true },
      }),
      prisma.sprint.findMany({
        where: {
          projectId,
          OR: [{ startDate: { gte: from, lt: toExclusive } }, { endDate: { gte: from, lt: toExclusive } }],
        },
        orderBy: { startDate: "asc" },
        take: 20,
        select: { sprintName: true, startDate: true, endDate: true, status: true },
      }),
    ])
    const inRange = (d: Date) => d.getTime() >= from.getTime() && d.getTime() < toExclusive.getTime()
    const sprintDates = sprints.flatMap((s) => [
      ...(inRange(s.startDate) ? [{ date: iso(s.startDate), kind: "sprint_start", sprint: s.sprintName }] : []),
      ...(inRange(s.endDate) ? [{ date: iso(s.endDate), kind: "sprint_end", sprint: s.sprintName }] : []),
    ])
    return JSON.stringify({
      as_of: iso(now()),
      range: `${iso(from)}..${iso(to)}`,
      event_count: events.length,
      events: events.map((e) => ({
        date: iso(e.date),
        end: e.endDate ? iso(e.endDate) : null,
        all_day: e.allDay,
        title: trunc(e.title, 80),
        description: trunc(e.description, 100) || null,
      })),
      sprint_dates: sprintDates.sort((a, b) => a.date.localeCompare(b.date)),
      note: range.clamped
        ? `range clamped to ${CALENDAR_MAX_DAYS} days`
        : events.length === CALENDAR_EVENT_CAP ? `capped at ${CALENDAR_EVENT_CAP} events` : undefined,
    })
  },
}
