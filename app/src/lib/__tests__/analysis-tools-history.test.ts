import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const m = vi.hoisted(() => ({
  sprintFindFirst: vi.fn(),
  sprintFindMany: vi.fn(),
  sbiFindMany: vi.fn(),
  activityFindMany: vi.fn(),
  pbiFindFirst: vi.fn(),
  pbiFindMany: vi.fn(),
  iceFindFirst: vi.fn(),
  iceFindMany: vi.fn(),
  commentFindMany: vi.fn(),
}))

vi.mock("@/lib/prisma", () => ({
  prisma: {
    sprint: { findFirst: m.sprintFindFirst, findMany: m.sprintFindMany },
    sprintBacklogItem: { findMany: m.sbiFindMany },
    activityLog: { findMany: m.activityFindMany },
    productBacklogItem: { findFirst: m.pbiFindFirst, findMany: m.pbiFindMany },
    iceboxItem: { findFirst: m.iceFindFirst, findMany: m.iceFindMany },
    comment: { findMany: m.commentFindMany },
  },
}))

const { HISTORY_TOOL_DEFS, historyHandlers, compareSprintRows, summarizeActivity } = await import("@/lib/analysis-tools-history")

const NOW = new Date("2026-03-10T12:00:00Z")
const d = (s: string) => new Date(`${s}T00:00:00Z`)
const run = async (name: string, args: Record<string, unknown> = {}) =>
  JSON.parse(await historyHandlers[name]({ projectId: "p1", args }))

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers()
  vi.setSystemTime(NOW)
})
afterEach(() => vi.useRealTimers())

describe("definitions", () => {
  it("has exactly one handler per definition", () => {
    expect(Object.keys(historyHandlers).sort()).toEqual(HISTORY_TOOL_DEFS.map((t) => t.function.name).sort())
  })
})

const S1 = { id: "s1", sprintName: "S1", status: "done", startDate: d("2026-02-01"), endDate: d("2026-02-14"), capacity: 10, actualScore: 6 }
const S2 = { id: "s2", sprintName: "S2", status: "active", startDate: d("2026-02-15"), endDate: d("2026-02-28"), capacity: 10, actualScore: 0 }
const task = (sprintId: string, pbItemId: string, status: string, sp: number, createdAt = d("2026-02-01"), taskName: string | null = "t") => ({
  sprintId, pbItemId, taskName, status, createdAt, sp,
})

describe("compare_sprints", () => {
  it("computes velocity, completion, carry-over and scope change", () => {
    const tasks = [
      task("s1", "A", "done", 3), task("s1", "A", "done", 3),
      task("s1", "B", "done", 5), task("s1", "B", "todo", 5, d("2026-02-05")),
      task("s1", "C", "todo", 2, d("2026-02-01"), null), // placeholder row: PBI without tasks
      task("s2", "B", "todo", 5, d("2026-02-15")),
    ]
    const later = new Map([["B", [S1.startDate.getTime(), S2.startDate.getTime()]], ["A", [S1.startDate.getTime()]]])
    const [r1, r2] = compareSprintRows([S1, S2], tasks, later)
    expect(r1).toMatchObject({
      committed_sp: 10, completed_sp: 5.5, sp_completion_pct: 55,
      tasks_done: "3/4", task_completion_pct: 75, pbi_count: 3,
      carry_over_pbis: 1, scope_change: { tasks_added_after_start: 1 },
    })
    expect(r2).toMatchObject({ committed_sp: 5, completed_sp: 0, carry_over_pbis: 0 })
  })

  it("resolves two named sprints inside the project only", async () => {
    m.sprintFindFirst.mockImplementation(async ({ where }: { where: { OR: Array<Record<string, unknown>> } }) =>
      (where.OR[0].id === "S2" || (where.OR[1].sprintName as { contains: string }).contains === "S2") ? S2 : S1
    )
    m.sbiFindMany.mockResolvedValue([])
    const out = await run("compare_sprints", { sprint_a: "S2", sprint_b: "S1" })
    for (const c of m.sprintFindFirst.mock.calls) expect(c[0].where.projectId).toBe("p1")
    expect(out.sprints.map((s: { name: string }) => s.name)).toEqual(["S1", "S2"])
  })

  it("reports a missing sprint instead of another project's data", async () => {
    m.sprintFindFirst.mockResolvedValue(null)
    expect(await run("compare_sprints", { sprint_a: "x", sprint_b: "y" })).toEqual({ error: "sprint not found in this project: x" })
    expect(m.sbiFindMany).not.toHaveBeenCalled()
  })

  it("uses the last N started sprints and needs at least two", async () => {
    m.sprintFindMany.mockResolvedValue([S1])
    expect(await run("compare_sprints", { last_n: 99 })).toEqual({ error: "need at least two started sprints to compare" })
    expect(m.sprintFindMany.mock.calls[0][0]).toMatchObject({ where: { projectId: "p1", status: { not: "planning" } }, take: 6 })
  })

  it("scopes the carry-over lookup to the project and live PBIs", async () => {
    m.sprintFindMany.mockResolvedValue([S2, S1])
    m.sbiFindMany
      .mockResolvedValueOnce([{ sprintId: "s1", pbItemId: "B", taskName: "t", status: "todo", createdAt: d("2026-02-01"), pbItem: { workloadScore: 5 } }])
      .mockResolvedValueOnce([{ pbItemId: "B", sprint: { startDate: S2.startDate } }])
    const out = await run("compare_sprints")
    expect(m.sbiFindMany.mock.calls[0][0].where).toMatchObject({ sprintId: { in: ["s1", "s2"] }, pbItem: { deletedAt: null } })
    expect(m.sbiFindMany.mock.calls[1][0].where).toEqual({ pbItemId: { in: ["B"] }, sprint: { projectId: "p1" } })
    expect(out.sprints[0].carry_over_pbis).toBe(1)
  })
})

describe("get_recent_activity", () => {
  const row = (action: string, entityType: string, actorName: string | null, diff: string | null = null) => ({
    entityType, entityId: "e", action, actorName, diff, createdAt: d("2026-03-09"),
  })

  it("summarizes counts and the latest entries with labels and changed fields", () => {
    const out = summarizeActivity([
      row("update", "pbi", "Taro", JSON.stringify({ label: "Login", changes: { status: { from: "a", to: "b" } } })),
      row("create", "sprint_task", "Taro"),
      row("status_change", "pbi", null, "{broken"),
    ], 2)
    expect(out.total).toBe(3)
    expect(out.by_action).toEqual({ update: 1, create: 1, status_change: 1 })
    expect(out.by_entity).toEqual({ pbi: 2, sprint_task: 1 })
    expect(out.top_actors).toEqual({ Taro: 2, "(system)": 1 })
    expect(out.latest).toHaveLength(2)
    expect(out.latest[0]).toMatchObject({ actor: "Taro", label: "Login", fields: ["status"] })
  })

  it("queries the project window with clamped days", async () => {
    m.activityFindMany.mockResolvedValue([])
    const out = await run("get_recent_activity", { days: 365 })
    const q = m.activityFindMany.mock.calls[0][0]
    expect(q.where.projectId).toBe("p1")
    expect(q.where.createdAt.gte).toEqual(new Date(NOW.getTime() - 30 * 86_400_000))
    expect(out.window_days).toBe(30)
  })
})

describe("get_comments", () => {
  it("resolves a PBI by #number in the project and excludes deleted comments", async () => {
    m.pbiFindFirst.mockResolvedValue({ id: "pb-1", initiative: "Login", userStory: null })
    m.commentFindMany.mockResolvedValue([
      { body: "Looks good", createdAt: d("2026-03-09"), editedAt: null, author: { name: "Hanako" } },
    ])
    const out = await run("get_comments", { entity: "pbi", id: "#4", limit: 100 })
    expect(m.pbiFindFirst.mock.calls[0][0].where).toEqual({ projectId: "p1", displayId: 4, deletedAt: null })
    const q = m.commentFindMany.mock.calls[0][0]
    expect(q.where).toEqual({ projectId: "p1", entityType: "pbi", entityId: "pb-1", deletedAt: null })
    expect(q.take).toBe(30)
    expect(out.comments).toEqual([{ at: "2026-03-09 00:00", author: "Hanako", edited: false, body: "Looks good" }])
  })

  it("resolves a task through its sprint's project and reports ambiguity", async () => {
    m.sbiFindMany.mockResolvedValueOnce([{ id: "t1", taskName: "Write docs" }, { id: "t2", taskName: "Write docs v2" }])
    const out = await run("get_comments", { entity: "task", task_name: "Write" })
    expect(m.sbiFindMany.mock.calls[0][0].where).toMatchObject({ sprint: { projectId: "p1" }, pbItem: { deletedAt: null } })
    expect(out.error).toContain("ambiguous")
    expect(m.commentFindMany).not.toHaveBeenCalled()
  })

  it("rejects unknown entities and missing items", async () => {
    expect(await run("get_comments", { entity: "sprint" })).toEqual({ error: "entity must be pbi | task | icebox" })
    m.iceFindFirst.mockResolvedValue(null)
    expect(await run("get_comments", { entity: "icebox", id: "#9" })).toEqual({ error: "Icebox #9 not found" })
  })
})

describe("triage_icebox", () => {
  it("lists open requests oldest first with age and flags likely duplicates", async () => {
    m.iceFindMany.mockResolvedValue([
      { displayId: 1, request: "CSV export of backlog", author: "A", status: "unreviewed", poFlag: null, assignedPo: null, createdAt: d("2026-01-10") },
      { displayId: 2, request: "Backlog CSV export", author: "B", status: "reviewed", poFlag: "hot", assignedPo: "PO", createdAt: d("2026-03-01") },
      { displayId: 3, request: "Dark mode", author: "C", status: "unreviewed", poFlag: null, assignedPo: null, createdAt: d("2026-03-05") },
    ])
    m.pbiFindMany.mockResolvedValue([{ displayId: 7, initiative: "Dark mode theme", userStory: null }])
    const out = await run("triage_icebox")
    expect(m.iceFindMany.mock.calls[0][0].where).toEqual({ projectId: "p1", deletedAt: null, status: { in: ["unreviewed", "reviewed"] } })
    expect(m.pbiFindMany.mock.calls[0][0].where).toEqual({ projectId: "p1", deletedAt: null })
    expect(out.open_count).toBe(3)
    expect(out.items[0]).toMatchObject({ id: "#1", age_days: 59 })
    expect(out.items[1]).toMatchObject({ po_flag: "hot", assigned_po: "PO" })
    expect(out.likely_duplicates.within_icebox[0]).toMatchObject({ a: "icebox #1", b: "icebox #2" })
    expect(out.likely_duplicates.against_pbis[0]).toMatchObject({ a: "icebox #3", b: "PBI #7" })
  })
})
