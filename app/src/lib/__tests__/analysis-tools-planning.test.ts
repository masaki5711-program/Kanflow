import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const m = vi.hoisted(() => ({
  planFindMany: vi.fn(),
  releaseFindMany: vi.fn(),
  goalFindMany: vi.fn(),
  pbiCount: vi.fn(),
  eventFindMany: vi.fn(),
  sprintFindMany: vi.fn(),
}))

vi.mock("@/lib/prisma", () => ({
  prisma: {
    planItem: { findMany: m.planFindMany },
    releaseBacklogItem: { findMany: m.releaseFindMany },
    productGoal: { findMany: m.goalFindMany },
    productBacklogItem: { count: m.pbiCount },
    calendarEvent: { findMany: m.eventFindMany },
    sprint: { findMany: m.sprintFindMany },
  },
}))

const { PLANNING_TOOL_DEFS, planningHandlers, resolveCalendarRange, summarizePlan, summarizeReleases } = await import(
  "@/lib/analysis-tools-planning"
)

const NOW = new Date("2026-03-10T12:00:00Z")
const d = (s: string) => new Date(`${s}T00:00:00Z`)
const run = async (name: string, args: Record<string, unknown> = {}) =>
  JSON.parse(await planningHandlers[name]({ projectId: "p1", args }))

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers()
  vi.setSystemTime(NOW)
})
afterEach(() => vi.useRealTimers())

describe("definitions", () => {
  it("has exactly one handler per definition", () => {
    expect(Object.keys(planningHandlers).sort()).toEqual(PLANNING_TOOL_DEFS.map((t) => t.function.name).sort())
  })
})

const plan = (id: string, extra: Record<string, unknown>) => ({
  id, parentId: null, name: id, plannedStart: d("2026-01-01"), plannedEnd: d("2026-06-30"),
  progressPct: 0, status: "not_started", isMilestone: false, sortOrder: 0, ...extra,
})

describe("get_plan_progress", () => {
  it("summarizes roots, overdue items and upcoming milestones", () => {
    const rows = [
      plan("root1", { progressPct: 50, sortOrder: 1 }),
      plan("root2", { progressPct: 100, status: "done", sortOrder: 2 }),
      plan("child", { parentId: "root1", plannedEnd: d("2026-03-01"), progressPct: 50, status: "in_progress" }),
      plan("doneLate", { parentId: "root1", plannedEnd: d("2026-02-01"), progressPct: 100, status: "done" }),
      plan("ms", { parentId: "root1", isMilestone: true, plannedEnd: d("2026-03-20") }),
    ]
    const out = summarizePlan(rows, NOW)
    expect(out.overall_progress_pct).toBe(75)
    expect(out.top_level.map((r) => r.name)).toEqual(["root1", "root2"])
    expect(out.top_level[0].children).toBe(3)
    expect(out.overdue_count).toBe(1)
    expect(out.overdue_items[0]).toMatchObject({ name: "child", parent: "root1", days_overdue: 9 })
    expect(out.upcoming_milestones).toEqual([{ name: "ms", date: "2026-03-20", days_left: 9 }])
  })

  it("A3-13: overall progress is the duration-weighted root rollup shared with the portfolio / dashboard", () => {
    const rows = [
      plan("long", { progressPct: 10, plannedStart: d("2026-01-01"), plannedEnd: d("2026-01-30") }), // 30 days
      plan("short", { progressPct: 100, status: "done", plannedStart: d("2026-02-01"), plannedEnd: d("2026-02-10") }), // 10 days
      plan("gate", { isMilestone: true, plannedStart: d("2026-02-10"), plannedEnd: d("2026-02-10") }),
    ]
    // (10 × 30 + 100 × 10) / 40 = 32.5 → 33; the simple average of the roots would have said 37.
    expect(summarizePlan(rows, NOW).overall_progress_pct).toBe(33)
  })

  it("is scoped to the project and handles an empty plan", async () => {
    m.planFindMany.mockResolvedValue([])
    const out = await run("get_plan_progress")
    expect(m.planFindMany.mock.calls[0][0].where).toEqual({ projectId: "p1", deletedAt: null })
    expect(out.total_items).toBe(0)
    expect(out.as_of).toBe("2026-03-10")
  })
})

describe("get_release_status", () => {
  const rel = (extra: Record<string, unknown>) => ({
    releaseVersion: "v1", releaseDate: d("2026-03-20"), status: "staged", initiative: "Item", userStory: null, pbItem: null, ...extra,
  })

  it("groups by version with linked PBI completion, newest first, unversioned last", () => {
    const out = summarizeReleases([
      rel({ status: "ready", pbItem: { displayId: 1, status: "completed", initiative: "A" } }),
      rel({ pbItem: { displayId: 2, status: "ready", initiative: "B" } }),
      rel({ releaseVersion: "v2", releaseDate: d("2026-04-10") }),
      rel({ releaseVersion: null, releaseDate: null }),
    ], NOW)
    expect(out.map((r) => r.version)).toEqual(["v2", "v1", "(unversioned)"])
    const v1 = out[1]
    expect(v1).toMatchObject({ item_count: 2, days_until: 9, by_status: { ready: 1, staged: 1 } })
    expect(v1.linked_pbis).toEqual({ completed: 1, total: 2, completion_pct: 50 })
    expect(v1.items[0]).toMatchObject({ pbi: "#1", pbi_status: "completed" })
  })

  it("excludes items of trashed PBIs and filters by version inside the project", async () => {
    m.releaseFindMany.mockResolvedValue([])
    await run("get_release_status", { release_version: " v1 " })
    const where = m.releaseFindMany.mock.calls[0][0].where
    expect(where.projectId).toBe("p1")
    expect(where.OR).toEqual([{ pbItemId: null }, { pbItem: { deletedAt: null } }])
    expect(where.releaseVersion).toEqual({ contains: "v1" })
  })
})

describe("get_goal_progress", () => {
  it("computes completion by story points and lists open items", async () => {
    m.goalFindMany.mockResolvedValue([
      {
        title: "Goal A",
        description: null,
        backlogItems: [
          { displayId: 1, status: "completed", workloadScore: 3, initiative: "Done", userStory: null },
          { displayId: 2, status: "ready", workloadScore: 5, initiative: "Open", userStory: null },
        ],
      },
      { title: "Goal B", description: "d", backlogItems: [] },
    ])
    m.pbiCount.mockResolvedValue(4)
    const out = await run("get_goal_progress")
    expect(m.goalFindMany.mock.calls[0][0].where).toEqual({ projectId: "p1" })
    expect(m.goalFindMany.mock.calls[0][0].select.backlogItems.where).toEqual({ deletedAt: null })
    expect(m.pbiCount.mock.calls[0][0].where).toEqual({ projectId: "p1", deletedAt: null, productGoalId: null })
    expect(out.goals[0]).toMatchObject({ story_points: { completed: 3, total: 8 }, completion_pct: 38 })
    expect(out.goals[0].open_items).toEqual([{ id: "#2", status: "ready", sp: 5, title: "Open" }])
    expect(out.goals[1].completion_pct).toBeNull()
    expect(out.pbis_without_goal).toBe(4)
  })
})

describe("get_calendar", () => {
  it("defaults to today + 14 days and clamps to 60 days", () => {
    const def = resolveCalendarRange(undefined, undefined, NOW)
    expect(def).toEqual({ from: d("2026-03-10"), to: d("2026-03-24"), clamped: false })
    const wide = resolveCalendarRange("2026-01-01", "2026-12-31", NOW)
    expect(wide).toEqual({ from: d("2026-01-01"), to: d("2026-03-02"), clamped: true })
  })

  it("rejects malformed or inverted ranges", async () => {
    expect(resolveCalendarRange("03/01/2026", undefined, NOW)).toEqual({ error: "dates must be YYYY-MM-DD" })
    expect(await run("get_calendar", { from: "2026-03-10", to: "2026-03-01" })).toEqual({ error: "`to` is before `from`" })
    expect(m.eventFindMany).not.toHaveBeenCalled()
  })

  it("lists events and sprint boundaries inside the window", async () => {
    m.eventFindMany.mockResolvedValue([
      { title: "Review", description: null, date: d("2026-03-12"), endDate: null, allDay: true },
    ])
    m.sprintFindMany.mockResolvedValue([
      { sprintName: "S3", startDate: d("2026-03-01"), endDate: d("2026-03-14"), status: "active" },
    ])
    const out = await run("get_calendar", { from: "2026-03-10", to: "2026-03-20" })
    expect(m.eventFindMany.mock.calls[0][0].where.projectId).toBe("p1")
    expect(m.sprintFindMany.mock.calls[0][0].where.projectId).toBe("p1")
    expect(out.range).toBe("2026-03-10..2026-03-20")
    expect(out.events).toEqual([{ date: "2026-03-12", end: null, all_day: true, title: "Review", description: null }])
    expect(out.sprint_dates).toEqual([{ date: "2026-03-14", kind: "sprint_end", sprint: "S3" }])
  })
})
