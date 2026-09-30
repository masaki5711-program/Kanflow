import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const sprintFindMany = vi.fn()
const sbiFindMany = vi.fn()
vi.mock("@/lib/prisma", () => ({
  prisma: {
    sprint: { findMany: (...a: unknown[]) => sprintFindMany(...a) },
    sprintBacklogItem: { findMany: (...a: unknown[]) => sbiFindMany(...a) },
  },
}))

const { detectAnomalies } = await import("@/lib/surveillance")

const NOW = new Date("2026-03-10T12:00:00Z").getTime()
const DAY = 86_400_000
const daysAgo = (n: number) => new Date(NOW - n * DAY)

function sprint(over: Record<string, unknown> = {}) {
  return {
    id: "s1",
    sprintName: "S1",
    status: "planning",
    endDate: new Date(NOW + 5 * DAY),
    capacity: 0,
    items: [],
    dailyScrumNotes: [],
    ...over,
  }
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(NOW)
  sprintFindMany.mockReset()
  sbiFindMany.mockReset().mockResolvedValue([])
})
afterEach(() => vi.useRealTimers())

describe("detectAnomalies", () => {
  it("scopes the sprint query to the project and open statuses", async () => {
    sprintFindMany.mockResolvedValue([])
    expect(await detectAnomalies("p1")).toEqual([])
    expect(sprintFindMany.mock.calls[0][0].where).toEqual({
      projectId: "p1",
      status: { in: ["planning", "active"] },
    })
  })

  it("flags an overdue sprint with unfinished real tasks", async () => {
    sprintFindMany.mockResolvedValue([
      sprint({
        endDate: daysAgo(2),
        items: [
          { taskName: "t1", status: "todo", updatedAt: daysAgo(0) },
          { taskName: "  ", status: "todo", updatedAt: daysAgo(0) },
          { taskName: null, status: "todo", updatedAt: daysAgo(0) },
        ],
      }),
    ])
    const out = await detectAnomalies("p1")
    expect(out).toEqual([
      expect.objectContaining({ code: "sprint_overdue", severity: "critical" }),
    ])
    expect(out[0].description).toContain("2日")
    expect(out[0].description).toContain("1件")
  })

  it("does not flag an overdue sprint whose tasks are all done", async () => {
    sprintFindMany.mockResolvedValue([
      sprint({ endDate: daysAgo(2), items: [{ taskName: "t", status: "done", updatedAt: daysAgo(0) }] }),
    ])
    expect(await detectAnomalies("p1")).toEqual([])
  })

  it("flags three or more stalled in-progress tasks", async () => {
    const stale = { taskName: "t", status: "in_progress", updatedAt: daysAgo(4) }
    sprintFindMany.mockResolvedValue([sprint({ items: [stale, stale, stale, { ...stale, updatedAt: daysAgo(1) }] })])
    const out = await detectAnomalies("p1")
    expect(out.map((a) => a.code)).toEqual(["stalled_tasks"])
    expect(out[0].description).toContain("3件")
  })

  it("does not flag two stalled tasks", async () => {
    const stale = { taskName: "t", status: "in_progress", updatedAt: daysAgo(4) }
    sprintFindMany.mockResolvedValue([sprint({ items: [stale, stale] })])
    expect(await detectAnomalies("p1")).toEqual([])
  })

  it("flags an active sprint with no daily scrum at all", async () => {
    sprintFindMany.mockResolvedValue([sprint({ status: "active" })])
    const out = await detectAnomalies("p1")
    expect(out[0]).toMatchObject({ code: "daily_scrum_silent" })
    expect(out[0].description).toContain("一件もない")
  })

  it("flags an active sprint silent for 3+ days but not for 1 day", async () => {
    sprintFindMany.mockResolvedValue([
      sprint({ status: "active", dailyScrumNotes: [{ date: daysAgo(3) }] }),
      sprint({ id: "s2", sprintName: "S2", status: "active", dailyScrumNotes: [{ date: daysAgo(1) }] }),
    ])
    const out = await detectAnomalies("p1")
    expect(out).toHaveLength(1)
    expect(out[0].description).toContain("3日途絶えている")
  })

  it("flags over-capacity counting each PBI once", async () => {
    sprintFindMany.mockResolvedValue([sprint({ capacity: 5 })])
    sbiFindMany.mockResolvedValue([
      { pbItem: { id: "a", workloadScore: 3 } },
      { pbItem: { id: "a", workloadScore: 3 } },
      { pbItem: { id: "b", workloadScore: 3 } },
    ])
    const out = await detectAnomalies("p1")
    expect(sbiFindMany).toHaveBeenCalledWith({
      where: { sprintId: "s1" },
      select: { pbItem: { select: { id: true, workloadScore: true } } },
    })
    expect(out).toEqual([expect.objectContaining({ code: "over_capacity" })])
    expect(out[0].description).toContain("6pt")
  })

  it("does not flag when committed points fit capacity", async () => {
    sprintFindMany.mockResolvedValue([sprint({ capacity: 10 })])
    sbiFindMany.mockResolvedValue([{ pbItem: { id: "a", workloadScore: 10 } }])
    expect(await detectAnomalies("p1")).toEqual([])
  })
})
