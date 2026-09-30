import { describe, expect, it, vi } from "vitest"

// burndown.ts reuses isRealTask from lib/pbi-status-sync, which imports the Prisma client.
vi.mock("@/lib/prisma", () => ({ prisma: {} }))

const { computeBurndown, EMPTY_BURNDOWN, toDateKey } = await import("../burndown")

const d = (s: string) => new Date(`${s}T09:00:00`)

describe("computeBurndown", () => {
  it("returns the empty payload without sprints", () => {
    expect(computeBurndown([])).toEqual(EMPTY_BURNDOWN)
  })

  it("burns real tasks only and tracks ideal / plan / actual lines", () => {
    const sprints = [
      {
        id: "s1",
        sprintName: "S1",
        status: "active",
        startDate: d("2026-03-01"),
        endDate: d("2026-03-03"),
        items: [
          { taskName: "a", status: "done", completedAt: d("2026-03-02") },
          { taskName: "b", status: "todo", completedAt: null },
          { taskName: null, status: "todo", completedAt: null },
        ],
      },
    ]
    const out = computeBurndown(sprints, d("2026-03-03"))
    expect(out.days).toEqual(["2026-03-01", "2026-03-02", "2026-03-03"])
    expect(out.totalTasks).toBe(2)
    expect(out.idealLine).toEqual([2, 1, 0])
    expect(out.planLine).toEqual([2, 1, 0])
    expect(out.actualBaseline).toBe(2)
    expect(out.actualLine).toEqual([null, 1, 1])
    expect(out.sprintMarkers).toEqual([
      { id: "s1", name: "S1", status: "active", startIndex: 0, endIndex: 2, taskCount: 2, doneCount: 1 },
    ])
  })

  it("extends the range to today and keeps a flat plan after the last sprint", () => {
    const sprints = [
      {
        id: "s1",
        sprintName: "S1",
        status: "done",
        startDate: d("2026-03-01"),
        endDate: d("2026-03-01"),
        items: [{ taskName: "a", status: "todo", completedAt: null }],
      },
    ]
    const out = computeBurndown(sprints, d("2026-03-03"))
    expect(out.days).toHaveLength(3)
    expect(out.planLine).toEqual([1, 0, 0])
    expect(out.actualLine).toEqual([null, null, null])
    expect(out.actualBaseline).toBeNull()
  })

  it("formats local date keys", () => {
    expect(toDateKey(new Date(2026, 0, 5))).toBe("2026-01-05")
  })
})
