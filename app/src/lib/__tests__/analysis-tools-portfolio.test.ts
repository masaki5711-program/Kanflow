import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { ProjectActor } from "@/lib/authz/policy"

const m = vi.hoisted(() => ({
  projectFindMany: vi.fn(),
  sprintFindMany: vi.fn(),
  planFindMany: vi.fn(),
  reportFindMany: vi.fn(),
}))

vi.mock("@/lib/prisma", () => ({
  prisma: {
    project: { findMany: m.projectFindMany },
    sprint: { findMany: m.sprintFindMany },
    planItem: { findMany: m.planFindMany },
    aiReport: { findMany: m.reportFindMany },
  },
}))

const { portfolioHandlers, canViewPortfolio, severityFromMeta } = await import("@/lib/analysis-tools-portfolio")

const NOW = new Date("2026-03-10T12:00:00Z")
const d = (s: string) => new Date(`${s}T00:00:00Z`)

const actor = (systemRole: string, extra: Partial<ProjectActor> = {}): ProjectActor => ({
  userId: "u1", systemRole, projectRole: "po", isSectionManagerOfProject: false, ...extra,
})
const run = async (a?: ProjectActor) => JSON.parse(await portfolioHandlers.portfolio_overview({ projectId: "p1", args: {}, actor: a }))

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers()
  vi.setSystemTime(NOW)
})
afterEach(() => vi.useRealTimers())

describe("portfolio_overview authorization", () => {
  it("refuses members, project POs and machine callers without touching the DB", async () => {
    for (const a of [actor("member"), actor("member", { projectRole: "po" }), undefined]) {
      const out = await run(a)
      expect(out.refused).toBe(true)
      expect(out.instruction).toMatch(/Politely/)
    }
    expect(m.projectFindMany).not.toHaveBeenCalled()
    expect(canViewPortfolio(actor("unknown-role"))).toBe(false)
  })

  it("admins see every live project", async () => {
    m.projectFindMany.mockResolvedValue([])
    const out = await run(actor("admin"))
    expect(m.projectFindMany.mock.calls[0][0].where).toEqual({ deletedAt: null })
    expect(out.project_count).toBe(0)
  })

  it("section managers only see projects of their own sections", async () => {
    m.projectFindMany.mockResolvedValue([])
    await run(actor("section_manager"))
    expect(m.projectFindMany.mock.calls[0][0].where).toEqual({
      deletedAt: null,
      sections: { some: { section: { users: { some: { userId: "u1" } } } } },
    })
  })
})

describe("portfolio_overview aggregation", () => {
  it("reports sprint progress, overdue counts and the last surveillance severity per project", async () => {
    m.projectFindMany.mockResolvedValue([
      { id: "a", name: "Alpha", status: "active" },
      { id: "b", name: "Beta", status: "active" },
    ])
    m.sprintFindMany.mockResolvedValue([
      { projectId: "a", sprintName: "A1", status: "active", endDate: d("2026-03-05"), items: [
        { taskName: "x", status: "done" }, { taskName: "y", status: "todo" }, { taskName: " ", status: "todo" },
      ] },
      { projectId: "b", sprintName: "B1", status: "planning", endDate: d("2026-04-01"), items: [] },
    ])
    m.planFindMany.mockResolvedValue([{ projectId: "b" }, { projectId: "b" }])
    m.reportFindMany.mockResolvedValue([
      { projectId: "a", createdAt: d("2026-03-09"), meta: JSON.stringify({ anomalies: [{ severity: "warning" }, { severity: "critical" }] }) },
      { projectId: "a", createdAt: d("2026-03-01"), meta: null },
    ])
    const out = await run(actor("admin"))
    for (const mock of [m.sprintFindMany, m.planFindMany, m.reportFindMany]) {
      expect(mock.mock.calls[0][0].where.projectId).toEqual({ in: ["a", "b"] })
    }
    expect(m.sprintFindMany.mock.calls[0][0].select.items.where).toEqual({ pbItem: { deletedAt: null } })
    const [alpha, beta] = out.projects
    expect(alpha).toMatchObject({
      project: "Alpha",
      active_sprint: { name: "A1", tasks_done: "1/2", progress_pct: 50, days_remaining: -6 },
      overdue_sprint_tasks: 1,
      overdue_plan_items: 0,
      last_surveillance: { date: "2026-03-09", severity: "critical" },
    })
    expect(beta).toMatchObject({ active_sprint: null, overdue_sprint_tasks: 0, overdue_plan_items: 2, last_surveillance: null })
  })

  it("parses surveillance severity defensively", () => {
    expect(severityFromMeta(null)).toBe("none")
    expect(severityFromMeta("{bad")).toBe("none")
    expect(severityFromMeta(JSON.stringify({ anomalies: [] }))).toBe("none")
    expect(severityFromMeta(JSON.stringify({ anomalies: [{ severity: "warning" }] }))).toBe("warning")
  })
})
