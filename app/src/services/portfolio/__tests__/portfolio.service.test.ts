import { beforeEach, describe, expect, it, vi } from "vitest"
import { fakeDb, type FakeDb } from "@/services/__tests__/fake-db"

const i18n = vi.hoisted(() => ({ getI18nFor: vi.fn() }))
vi.mock("@/services/_shared/db", () => ({ defaultDb: {}, withTransaction: vi.fn() }))
vi.mock("@/services/_shared/translations", () => ({ getI18nFor: i18n.getI18nFor }))

const { getPortfolio } = await import("../portfolio.service")
const { PORTFOLIO_PROJECT_CAP } = await import("../portfolio.repository")

const jst = (day: string, hour = 0) => new Date(`${day}T${String(hour).padStart(2, "0")}:00:00+09:00`)
const NOW = jst("2026-10-06", 12)
const ADMIN = { userId: "adm", systemRole: "admin" }
const SM = { userId: "sm1", systemRole: "section_manager" }

const project = (id: string, name: string, sections: Array<{ id: string; name: string; sortOrder: number }> = []) => ({
  id, name, status: "active", sections: sections.map((section) => ({ section })),
})

const task = (pbItemId: string, status: string, completedAt: Date | null = null, points = 3, taskName: string | null = "t") => ({
  taskName, status, completedAt, pbItemId, pbItem: { workloadScore: points },
})

let db: FakeDb

function seed(overrides: Record<string, unknown> = {}) {
  db = fakeDb({
    "project.findMany": [
      project("a", "Alpha", [{ id: "s2", name: "Sec B", sortOrder: 2 }, { id: "s1", name: "Sec A", sortOrder: 1 }]),
      project("b", "Beta"),
    ],
    "sprint.findMany": [],
    "productBacklogItem.groupBy": [{ projectId: "a", _count: { _all: 4 }, _sum: { workloadScore: 13 } }],
    "aiReport.groupBy": [{ projectId: "b", _max: { createdAt: jst("2026-10-05") } }],
    "aiReport.findMany": [{ projectId: "b", createdAt: jst("2026-10-05"), meta: JSON.stringify({ anomalies: [{ severity: "critical" }] }) }],
    "planItem.findMany": [
      { id: "p1", projectId: "a", parentId: null, progressPct: 30, plannedStart: jst("2026-09-01"), plannedEnd: jst("2026-10-30"), status: "in_progress" },
    ],
    "activityLog.groupBy": [{ projectId: "a", _max: { createdAt: jst("2026-10-06", 9) } }],
    ...overrides,
  })
  // findOpenSprints and findFinishedSprints both call sprint.findMany: answer by the status filter.
  const open = [
    {
      id: "sp1", projectId: "a", sprintName: "Sprint 5", status: "active", startDate: jst("2026-10-01"), endDate: jst("2026-10-10"), actualScore: 3,
      items: [task("pbi1", "done", jst("2026-10-02", 10)), task("pbi1", "todo"), task("pbi2", "done", null, 5, null), task("pbi2", "in_progress", null, 5)],
    },
    {
      id: "sp0", projectId: "b", sprintName: "Old", status: "planning", startDate: jst("2026-09-01"), endDate: jst("2026-09-30"), actualScore: 0,
      items: [task("x", "todo"), task("x", "done"), task("x", "todo", null, 1, " ")],
    },
  ]
  const finished = [
    { projectId: "a", actualScore: 12, endDate: jst("2026-09-30") },
    { projectId: "a", actualScore: 8, endDate: jst("2026-09-20") },
    { projectId: "a", actualScore: 10, endDate: jst("2026-09-10") },
    { projectId: "a", actualScore: 99, endDate: jst("2026-09-01") },
  ]
  db.fn("sprint.findMany").mockImplementation(async (args: { where: { status: { in: string[] } } }) =>
    args.where.status.in.includes("active") ? open : finished
  )
  i18n.getI18nFor.mockImplementation(async (type: string) => new Map(type === "project" ? [["a", { name: { ja: "アルファ", id: "Alfa", source: "ja", status: "done" } }]] : []))
}

beforeEach(() => {
  vi.clearAllMocks()
  seed()
})

describe("getPortfolio: who sees what", () => {
  it("403 for members (no query at all)", async () => {
    await expect(getPortfolio({ userId: "m", systemRole: "member" }, NOW, db.client)).rejects.toMatchObject({ status: 403 })
    expect(db.fn("project.findMany")).not.toHaveBeenCalled()
  })

  it("admins: every live project, capped", async () => {
    const out = await getPortfolio(ADMIN, NOW, db.client)
    const args = db.fn("project.findMany").mock.calls[0][0]
    expect(args.where).toEqual({ deletedAt: null })
    expect(args.take).toBe(PORTFOLIO_PROJECT_CAP + 1)
    expect(out.scope).toBe("all")
    expect(out.capped).toBe(false)
  })

  it("section managers: projects of their own sections", async () => {
    const out = await getPortfolio(SM, NOW, db.client)
    expect(db.fn("project.findMany").mock.calls[0][0].where).toEqual({
      deletedAt: null,
      sections: { some: { section: { users: { some: { userId: "sm1" } } } } },
    })
    expect(out.scope).toBe("sections")
  })

  it("returns an empty list without further queries when nothing is in scope", async () => {
    seed({ "project.findMany": [] })
    const out = await getPortfolio(SM, NOW, db.client)
    expect(out.rows).toEqual([])
    expect(db.fn("sprint.findMany")).not.toHaveBeenCalled()
  })

  it("marks the list as capped beyond the cap", async () => {
    seed({ "project.findMany": Array.from({ length: PORTFOLIO_PROJECT_CAP + 1 }, (_, i) => project(`p${i}`, `P${i}`)) })
    const out = await getPortfolio(ADMIN, NOW, db.client)
    expect(out.capped).toBe(true)
    expect(out.rows).toHaveLength(PORTFOLIO_PROJECT_CAP)
  })
})

describe("getPortfolio: aggregation", () => {
  it("batches every read over the project ids (no per-project queries)", async () => {
    await getPortfolio(ADMIN, NOW, db.client)
    for (const key of ["productBacklogItem.groupBy", "aiReport.groupBy", "planItem.findMany", "activityLog.groupBy"]) {
      expect(db.fn(key)).toHaveBeenCalledTimes(1)
      expect(db.fn(key).mock.calls[0][0].where.projectId).toEqual({ in: ["a", "b"] })
    }
    expect(db.fn("aiReport.findMany")).toHaveBeenCalledTimes(1)
    expect(db.fn("sprint.findMany")).toHaveBeenCalledTimes(2)
    expect(db.fn("planItem.findMany").mock.calls[0][0].where).toEqual({ projectId: { in: ["a", "b"] }, deletedAt: null })
    expect(db.fn("aiReport.findMany").mock.calls[0][0].where).toEqual({ trigger: "surveillance", OR: [{ projectId: "b", createdAt: jst("2026-10-05") }] })
    expect(i18n.getI18nFor.mock.calls).toEqual([["project", ["a", "b"]], ["sprint", ["sp1"]]])
  })

  it("builds each row", async () => {
    const out = await getPortfolio(ADMIN, NOW, db.client)
    const [a, b] = out.rows
    expect(out.sections).toEqual([{ id: "s1", name: "Sec A" }, { id: "s2", name: "Sec B" }])
    expect(a).toMatchObject({
      id: "a",
      i18n: { name: { ja: "アルファ" } },
      sections: [{ id: "s1", name: "Sec A" }, { id: "s2", name: "Sec B" }],
      activeSprint: {
        id: "sp1", name: "Sprint 5", daysLeft: 4, tasksDone: 1, tasksTotal: 3, progressPct: 33, donePoints: 3, plannedPoints: 8,
        burn: [3, 2, 2, 2, 2, 2],
      },
      overdueTasks: 0,
      openPbis: 4,
      openPoints: 13,
      velocity: [10, 8, 12],
      velocityTrend: "up",
      surveillance: null,
      plan: { progressPct: 30, delayed: 0, atRisk: 1, total: 1 },
      lastActivityAt: jst("2026-10-06", 9).toISOString(),
      needsAttention: false,
    })
    expect(b).toMatchObject({
      activeSprint: null,
      overdueTasks: 1,
      openPbis: 0,
      velocity: [],
      velocityTrend: null,
      surveillance: { severity: "critical", at: jst("2026-10-05").toISOString() },
      plan: { progressPct: null, total: 0 },
      lastActivityAt: null,
      needsAttention: true,
    })
  })
})
