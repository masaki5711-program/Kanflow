import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const m = vi.hoisted(() => ({
  sprintFindFirst: vi.fn(),
  sprintFindMany: vi.fn(),
  sbiFindMany: vi.fn(),
  pbiFindMany: vi.fn(),
  iceFindMany: vi.fn(),
  dsFindMany: vi.fn(),
}))

vi.mock("@/lib/prisma", () => ({
  prisma: {
    sprint: { findFirst: m.sprintFindFirst, findMany: m.sprintFindMany },
    sprintBacklogItem: { findMany: m.sbiFindMany },
    productBacklogItem: { findMany: m.pbiFindMany },
    iceboxItem: { findMany: m.iceFindMany },
    dailyScrumNote: { findMany: m.dsFindMany },
  },
}))

const { ANALYSIS_TOOL_DEFS, analysisHandlers } = await import("@/lib/analysis-tools")

const NOW = new Date("2026-03-10T12:00:00Z")
const d = (s: string) => new Date(`${s}T00:00:00Z`)

type Sprint = {
  id: string
  projectId: string
  sprintName: string
  status: string
  startDate: Date
  endDate: Date
  capacity: number
  actualScore: number
  sprintGoal: string | null
  retrospectiveKeep?: string | null
  retrospectiveProblem?: string | null
  retrospectiveTry?: string | null
  retrospectiveMemo?: string | null
  items?: { taskName: string | null; status: string }[]
}

const SPRINTS: Sprint[] = [
  { id: "s-active", projectId: "p1", sprintName: "Sprint 3", status: "active", startDate: d("2026-03-01"), endDate: d("2026-03-14"), capacity: 10, actualScore: 0, sprintGoal: "  Ship   login  " },
  { id: "s-plan", projectId: "p1", sprintName: "Sprint 4", status: "planning", startDate: d("2026-03-15"), endDate: d("2026-03-28"), capacity: 8, actualScore: 0, sprintGoal: null },
  { id: "s-done", projectId: "p1", sprintName: "Sprint 2", status: "done", startDate: d("2026-02-15"), endDate: d("2026-02-28"), capacity: 10, actualScore: 8, sprintGoal: null, retrospectiveKeep: "k", items: [{ taskName: "a", status: "done" }, { taskName: " ", status: "todo" }, { taskName: "b", status: "todo" }] },
  { id: "s-other", projectId: "p2", sprintName: "Secret Sprint", status: "active", startDate: d("2026-03-01"), endDate: d("2026-03-14"), capacity: 99, actualScore: 0, sprintGoal: "secret" },
]

function filterSprints(where: Record<string, unknown>): Sprint[] {
  return SPRINTS.filter((s) => {
    if (s.projectId !== where.projectId) return false
    const status = where.status as { in?: string[] } | undefined
    if (status?.in && !status.in.includes(s.status)) return false
    const name = where.sprintName as { contains?: string } | undefined
    if (name?.contains && !s.sprintName.includes(name.contains)) return false
    return true
  }).sort((a, b) => b.startDate.getTime() - a.startDate.getTime())
}

function installScopedSprintFake(sprints = SPRINTS) {
  m.sprintFindMany.mockImplementation(async ({ where }: { where: Record<string, unknown> }) =>
    filterSprints(where).filter((s) => sprints.includes(s))
  )
  m.sprintFindFirst.mockImplementation(async ({ where }: { where: Record<string, unknown> }) =>
    filterSprints(where).filter((s) => sprints.includes(s))[0] ?? null
  )
}

function pb(id: string, displayId: number, sp: number, extra: Record<string, unknown> = {}) {
  return { id, displayId, initiative: `Init ${id}`, userStory: null, workloadScore: sp, ...extra }
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers()
  vi.setSystemTime(NOW)
  installScopedSprintFake()
})
afterEach(() => vi.useRealTimers())

const run = async (name: string, projectId: string, args: Record<string, unknown> = {}) =>
  JSON.parse(await analysisHandlers[name]({ projectId, args }))

describe("tool definitions", () => {
  it("has a handler for every definition", () => {
    for (const def of ANALYSIS_TOOL_DEFS) {
      expect(typeof analysisHandlers[def.function.name]).toBe("function")
    }
    expect(Object.keys(analysisHandlers).sort()).toEqual(ANALYSIS_TOOL_DEFS.map((t) => t.function.name).sort())
  })
})

describe("projectId scoping (security)", () => {
  it("every sprint lookup is scoped to the caller's project", async () => {
    m.sbiFindMany.mockResolvedValue([])
    m.dsFindMany.mockResolvedValue([])
    m.pbiFindMany.mockResolvedValue([])
    m.iceFindMany.mockResolvedValue([])
    for (const name of Object.keys(analysisHandlers)) {
      await analysisHandlers[name]({ projectId: "p1", args: { keyword: "x", sprint_name: "Sprint" } })
    }
    for (const call of [...m.sprintFindMany.mock.calls, ...m.sprintFindFirst.mock.calls]) {
      expect(call[0].where.projectId).toBe("p1")
    }
    for (const call of [...m.pbiFindMany.mock.calls, ...m.iceFindMany.mock.calls]) {
      expect(call[0].where.projectId).toBe("p1")
    }
    // Sprint tasks are joined through the sprint relation.
    const taskSearch = m.sbiFindMany.mock.calls.find((c) => c[0].where.sprint)
    expect(taskSearch?.[0].where.sprint).toEqual({ projectId: "p1" })
  })

  it("naming another project's sprint yields 'no sprint found', not its data", async () => {
    for (const name of ["get_sprint_metrics", "get_member_workload", "get_daily_scrum_summary"]) {
      const out = await run(name, "p1", { sprint_name: "Secret Sprint" })
      expect(out).toEqual({ error: "no sprint found in this project" })
    }
    expect(m.sbiFindMany).not.toHaveBeenCalled()
    expect(m.dsFindMany).not.toHaveBeenCalled()
  })

  it("a project with no sprints at all reports none (does not fall through to others)", async () => {
    const out = await run("get_sprint_metrics", "p-empty")
    expect(out.error).toBe("no sprint found in this project")
  })
})

describe("sprint resolution", () => {
  it("prefers active, then planning, then latest sprint", async () => {
    m.sbiFindMany.mockResolvedValue([])
    expect((await run("get_member_workload", "p1")).sprint.name).toBe("Sprint 3")

    installScopedSprintFake(SPRINTS.filter((s) => s.id !== "s-active"))
    expect((await run("get_member_workload", "p1")).sprint.name).toBe("Sprint 4")

    installScopedSprintFake(SPRINTS.filter((s) => s.id === "s-done"))
    expect((await run("get_member_workload", "p1")).sprint.name).toBe("Sprint 2")
  })
})

describe("get_sprint_metrics", () => {
  it("computes committed/completed SP, statuses, stalled tasks", async () => {
    const old = new Date(NOW.getTime() - 5 * 86_400_000)
    m.sbiFindMany.mockResolvedValue([
      { taskName: "t1", status: "done", assignee: "Ann", estimatedHours: 2, actualHours: 3, updatedAt: NOW, pbItem: pb("A", 1, 5) },
      { taskName: "t2", status: "in_progress", assignee: "Ann, Bob", estimatedHours: 1, actualHours: null, updatedAt: old, pbItem: pb("A", 1, 5) },
      { taskName: "", status: "todo", assignee: null, estimatedHours: null, actualHours: null, updatedAt: NOW, pbItem: pb("B", 2, 8, { initiative: "", userStory: null }) },
      { taskName: "t3", status: "todo", assignee: null, estimatedHours: null, actualHours: null, updatedAt: NOW, pbItem: pb("C", 3, 0) },
      { taskName: "t4", status: "in_progress", assignee: "", estimatedHours: 0, actualHours: 0, updatedAt: old, pbItem: pb("C", 3, 0) },
    ])
    const out = await run("get_sprint_metrics", "p1")
    expect(m.sbiFindMany.mock.calls[0][0].where).toEqual({ sprintId: "s-active", pbItem: { deletedAt: null } })
    expect(out.as_of).toBe("2026-03-10")
    expect(out.sprint).toEqual({
      name: "Sprint 3",
      status: "active",
      period: "2026-03-01..2026-03-14",
      days_remaining: 3,
      goal: "Ship login",
    })
    expect(out.story_points).toEqual({
      capacity: 10,
      committed: 13,
      completed: 2.5,
      completion_rate_pct: 19,
      over_capacity: true,
    })
    expect(out.tasks).toEqual({ todo: 1, in_progress: 2, done: 1 })
    expect(out.per_pbi[1]).toMatchObject({ id: "#2", title: "(untitled)", tasks_done: "0/0" })
    expect(out.per_pbi[0]).toMatchObject({ id: "#1", tasks_done: "1/2", in_progress: 1, est_sum: 3, act_sum: 3 })
    expect(out.per_assignee_task_count).toEqual({ Ann: 2, Bob: 1 })
    expect(out.stalled_tasks).toEqual([
      { task: "t2", assignee: "Ann, Bob", idleDays: 5 },
      { task: "t4", assignee: "(unassigned)", idleDays: 5 },
    ])
  })

  it("reports null completion rate when nothing is committed", async () => {
    m.sbiFindMany.mockResolvedValue([])
    const out = await run("get_sprint_metrics", "p1", { sprint_name: "Sprint 4" })
    expect(out.sprint.name).toBe("Sprint 4")
    expect(out.sprint.goal).toBeNull()
    expect(out.story_points.completion_rate_pct).toBeNull()
    expect(out.story_points.over_capacity).toBe(false)
  })
})

describe("get_velocity_history", () => {
  it("reports an empty history", async () => {
    const out = await run("get_velocity_history", "p-none")
    expect(out).toEqual({ as_of: "2026-03-10", sprints: [], note: "no completed sprints yet" })
  })

  it("aggregates completed sprints and clamps the limit", async () => {
    const out = await run("get_velocity_history", "p1", { limit: 999 })
    expect(m.sprintFindMany.mock.calls[0][0]).toMatchObject({
      where: { projectId: "p1", status: { in: ["done", "archived"] } },
      take: 12,
      include: { items: { where: { pbItem: { deletedAt: null } } } },
    })
    expect(out.sprints).toEqual([
      {
        name: "Sprint 2",
        period: "2026-02-15..2026-02-28",
        capacity: 10,
        actual_score: 8,
        consumption_pct: 80,
        tasks_done: "1/2",
        has_retrospective: true,
      },
    ])
    expect(out.average_actual_score).toBe(8)
  })

  it("defaults the limit to 6 and floors at 1; capacity 0 gives null consumption", async () => {
    m.sprintFindMany.mockResolvedValueOnce([
      { ...SPRINTS[2], capacity: 0, retrospectiveKeep: null, items: [] },
    ])
    const out = await run("get_velocity_history", "p1", { limit: "abc" })
    expect(m.sprintFindMany.mock.calls[0][0].take).toBe(6)
    expect(out.sprints[0].consumption_pct).toBeNull()
    expect(out.sprints[0].has_retrospective).toBe(false)
    m.sprintFindMany.mockResolvedValueOnce([])
    await run("get_velocity_history", "p1", { limit: -5 })
    expect(m.sprintFindMany.mock.calls[1][0].take).toBe(1)
  })
})

describe("get_backlog_summary", () => {
  it("aggregates by status and epic with quality flags", async () => {
    m.pbiFindMany.mockResolvedValue([
      { displayId: 1, initiative: "a", epic: "Auth", userStory: "us", acceptanceCriteria: "ac", workloadScore: 3, status: "ready", sprintItems: [{ sprintId: "s" }] },
      { displayId: 2, initiative: "b", epic: " ", userStory: "", acceptanceCriteria: null, workloadScore: 0, status: "ready", sprintItems: [] },
      { displayId: 3, initiative: "c", epic: "Auth", userStory: null, acceptanceCriteria: "ac", workloadScore: 5, status: "completed", sprintItems: [] },
      { displayId: 4, initiative: "d", epic: null, userStory: "us", acceptanceCriteria: "ac", workloadScore: 2, status: "not_ready", sprintItems: [] },
    ])
    const out = await run("get_backlog_summary", "p1")
    expect(m.pbiFindMany.mock.calls[0][0].where).toEqual({ projectId: "p1", deletedAt: null })
    expect(out.total_items).toBe(4)
    expect(out.by_status).toEqual({
      ready: { count: 2, sp: 3 },
      completed: { count: 1, sp: 5 },
      not_ready: { count: 1, sp: 2 },
    })
    expect(out.by_epic).toEqual({ Auth: { count: 2, sp: 8 }, "(no epic)": { count: 2, sp: 2 } })
    expect(out.ready_items).toEqual({ adopted_in_open_sprint: 1, waiting: 1 })
    expect(out.quality_flags).toEqual({ missing_user_story: 1, missing_acceptance_criteria: 1, missing_estimate: 1 })
    expect(out.flagged_item_ids).toEqual(["#2"])
  })

  it("caps flagged ids at 10", async () => {
    m.pbiFindMany.mockResolvedValue(
      Array.from({ length: 12 }, (_, i) => ({
        displayId: i, initiative: "", epic: null, userStory: null, acceptanceCriteria: null,
        workloadScore: 0, status: "not_ready", sprintItems: [],
      }))
    )
    const out = await run("get_backlog_summary", "p1")
    expect(out.flagged_item_ids).toHaveLength(10)
    expect(out.quality_flags.missing_estimate).toBe(12)
  })
})

describe("get_member_workload", () => {
  it("splits shared estimates and counts unassigned tasks", async () => {
    m.sbiFindMany.mockResolvedValue([
      { taskName: "a", assignee: "Ann, Bob", status: "todo", estimatedHours: 3, actualHours: 1 },
      { taskName: "b", assignee: "Ann", status: "in_progress", estimatedHours: null, actualHours: null },
      { taskName: "c", assignee: "Bob", status: "done", estimatedHours: 2, actualHours: 2 },
      { taskName: "d", assignee: null, status: "todo", estimatedHours: 1, actualHours: 0 },
      { taskName: "", assignee: "Ann", status: "todo", estimatedHours: 9, actualHours: 9 },
      { taskName: "e", assignee: "Cy", status: "blocked", estimatedHours: 1, actualHours: 0 },
    ])
    const out = await run("get_member_workload", "p1")
    expect(out.members).toEqual({
      Ann: { todo: 1, in_progress: 1, done: 0, est: 1.5, act: 0.5, open: 2 },
      Bob: { todo: 1, in_progress: 0, done: 1, est: 3.5, act: 2.5, open: 1 },
      Cy: { todo: 0, in_progress: 0, done: 0, est: 1, act: 0, open: 0 },
    })
    expect(out.unassigned_tasks).toBe(1)
  })

  it("prefers the normalized assignees and loads them", async () => {
    m.sbiFindMany.mockResolvedValue([
      { taskName: "a", assignee: "stale text", assignees: [{ user: { name: "Ann" } }], status: "todo", estimatedHours: 2, actualHours: 0 },
      { taskName: "b", assignee: "Bob", assignees: [], status: "done", estimatedHours: 1, actualHours: 1 },
    ])
    const out = await run("get_member_workload", "p1")
    expect(Object.keys(out.members)).toEqual(["Ann", "Bob"])
    expect(m.sbiFindMany.mock.calls[0][0].select.assignees).toEqual({ select: { user: { select: { name: true } } } })
  })
})

describe("search_work_items", () => {
  // LIKE path (FULLTEXT is covered by analysis-tools-search.test.ts).
  beforeEach(() => vi.stubEnv("SEARCH_FULLTEXT", "off"))
  afterEach(() => vi.unstubAllEnvs())

  it("requires a keyword", async () => {
    expect(await run("search_work_items", "p1", { keyword: "  " })).toEqual({ error: "keyword is required" })
    expect(await run("search_work_items", "p1", {})).toEqual({ error: "keyword is required" })
    expect(m.pbiFindMany).not.toHaveBeenCalled()
  })

  it("searches pbi/icebox/tasks scoped to the project and merges results", async () => {
    m.pbiFindMany.mockResolvedValue([{ displayId: 1, initiative: "", userStory: "Login story", status: "ready", workloadScore: 3 }])
    m.iceFindMany.mockResolvedValue([{ displayId: 7, request: "Login please", status: "open", author: "Ann" }])
    m.sbiFindMany.mockResolvedValue([
      { taskName: "Login API", status: "todo", assignee: "", sprint: { sprintName: "S1", status: "active" }, pbItem: { displayId: 1 } },
      { taskName: "Login UI", status: "done", assignee: "Bob,Cy", sprint: { sprintName: "S1", status: "active" }, pbItem: { displayId: 1 } },
    ])
    const out = await run("search_work_items", "p1", { keyword: " Login " })
    expect(m.pbiFindMany.mock.calls[0][0].where.projectId).toBe("p1")
    expect(m.pbiFindMany.mock.calls[0][0].where.deletedAt).toBeNull()
    expect(m.iceFindMany.mock.calls[0][0].where.projectId).toBe("p1")
    expect(m.iceFindMany.mock.calls[0][0].where.deletedAt).toBeNull()
    expect(m.sbiFindMany.mock.calls[0][0].where).toEqual({
      sprint: { projectId: "p1" },
      pbItem: { deletedAt: null },
      taskName: { contains: "Login" },
    })
    expect(out.keyword).toBe("Login")
    expect(out.hit_count).toBe(4)
    expect(out.results[0]).toEqual({ type: "pbi", id: "#1", status: "ready", sp: 3, title: "Login story" })
    expect(out.results[1]).toEqual({ type: "icebox", id: "#7", status: "open", author: "Ann", title: "Login please" })
    expect(out.results[2].assignee).toBeNull()
    expect(out.results[3]).toMatchObject({ type: "task", pbi: "#1", sprint: "S1 (active)", assignee: "Bob, Cy" })
    expect(out.note).toBeUndefined()
  })

  it("caps merged results at 20 and adds a note", async () => {
    m.pbiFindMany.mockResolvedValue(Array.from({ length: 15 }, (_, i) => ({ displayId: i, initiative: "x".repeat(100), userStory: null, status: "ready", workloadScore: 1 })))
    m.iceFindMany.mockResolvedValue(Array.from({ length: 10 }, (_, i) => ({ displayId: i, request: "r", status: "open", author: "a" })))
    m.sbiFindMany.mockResolvedValue([])
    const out = await run("search_work_items", "p1", { keyword: "x" })
    expect(out.results).toHaveLength(20)
    expect(out.results[0].title).toBe("x".repeat(80) + "…")
    expect(out.note).toContain("capped at 20")
  })
})

describe("list_backlog_items", () => {
  it("filters by a known status and ignores unknown ones", async () => {
    m.pbiFindMany.mockResolvedValue([{ displayId: 1, status: "ready", workloadScore: 2, epic: " E ", initiative: null, userStory: null }])
    const out = await run("list_backlog_items", "p1", { status: "ready" })
    expect(m.pbiFindMany.mock.calls[0][0].where).toEqual({ projectId: "p1", deletedAt: null, status: "ready" })
    expect(out.items).toEqual([{ id: "#1", status: "ready", sp: 2, epic: "E", title: "(untitled)" }])
    expect(out.note).toBeUndefined()

    m.pbiFindMany.mockResolvedValue(Array.from({ length: 40 }, (_, i) => ({ displayId: i, status: "ready", workloadScore: 1, epic: null, initiative: "i", userStory: null })))
    const capped = await run("list_backlog_items", "p1", { status: "bogus" })
    expect(m.pbiFindMany.mock.calls[1][0].where).toEqual({ projectId: "p1", deletedAt: null })
    expect(capped.items[0].epic).toBeNull()
    expect(capped.note).toBe("capped at 40 items")
  })
})

describe("get_estimation_reference", () => {
  it("returns velocity and SP distribution with examples", async () => {
    m.sprintFindMany.mockResolvedValueOnce([
      { sprintName: "a", capacity: 10, actualScore: 9 },
      { sprintName: "b", capacity: 10, actualScore: 6 },
    ])
    m.pbiFindMany.mockResolvedValue([
      ...Array.from({ length: 4 }, (_, i) => ({ displayId: i + 1, workloadScore: 3, initiative: `i${i}`, userStory: null })),
      { displayId: 9, workloadScore: 1, initiative: null, userStory: "small" },
    ])
    const out = await run("get_estimation_reference", "p1")
    expect(m.sprintFindMany.mock.calls[0][0].where.projectId).toBe("p1")
    expect(m.pbiFindMany.mock.calls[0][0].where).toEqual({ projectId: "p1", status: "completed", deletedAt: null })
    expect(out.velocity).toEqual({ completed_sprints: 2, average_actual_score_per_sprint: 8 })
    expect(out.completed_pbi_sp_distribution).toEqual([
      { sp: 1, completed_count: 1, examples: ["#9 small"] },
      { sp: 3, completed_count: 4, examples: ["#1 i0", "#2 i1", "#3 i2"] },
    ])
    expect(out.note).toContain("calibrate")
  })

  it("handles a team without history", async () => {
    m.sprintFindMany.mockResolvedValueOnce([])
    m.pbiFindMany.mockResolvedValue([])
    const out = await run("get_estimation_reference", "p1")
    expect(out.velocity.average_actual_score_per_sprint).toBeNull()
    expect(out.note).toContain("no completed PBIs yet")
  })
})

describe("get_daily_scrum_summary", () => {
  it("queries notes for the resolved sprint in a clamped window", async () => {
    m.dsFindMany.mockResolvedValue([
      { date: d("2026-03-09"), author: "", content: "  blocked   on   API  " },
    ])
    const out = await run("get_daily_scrum_summary", "p1", { days: 100 })
    const where = m.dsFindMany.mock.calls[0][0].where
    expect(where.sprintId).toBe("s-active")
    expect(where.archivedAt).toBeNull()
    expect(where.date.gte.toISOString()).toBe(new Date(NOW.getTime() - 30 * 86_400_000).toISOString())
    expect(out).toMatchObject({
      window_days: 30,
      note_count: 1,
      notes: [{ date: "2026-03-09", author: null, content: "blocked on API" }],
    })
    await run("get_daily_scrum_summary", "p1", {})
    expect((await run("get_daily_scrum_summary", "p1", { days: 0 })).window_days).toBe(7)
  })
})
