import { afterEach, describe, expect, it, vi } from "vitest"

// burndown.ts reuses isRealTask from lib/pbi-status-sync, which imports the Prisma client.
vi.mock("@/lib/prisma", () => ({ prisma: {} }))

const { computeBurndown, buildActualLine, EMPTY_BURNDOWN, toDateKey } = await import("../burndown")
const { sparklineOf } = await import("@/app/projects/[projectId]/dashboard/dashboard-summary")

/** 09:00 JST of a calendar day (00:00 UTC) — independent of the test machine's TZ. */
const d = (s: string) => new Date(`${s}T09:00:00+09:00`)

const task = (status: string, completedAt: Date | null = null) => ({ taskName: "t", status, completedAt })

function sprint(start: string, end: string, items: ReturnType<typeof task>[], status = "active") {
  return { id: "s1", sprintName: "S1", status, startDate: d(start), endDate: d(end), items }
}

afterEach(() => {
  vi.useRealTimers()
})

describe("computeBurndown", () => {
  it("returns the empty payload without sprints", () => {
    expect(computeBurndown([])).toEqual(EMPTY_BURNDOWN)
  })

  it("burns real tasks only and tracks ideal / plan / actual lines", () => {
    const sprints = [
      {
        ...sprint("2026-03-01", "2026-03-03", []),
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
    expect(out.actualLine).toEqual([2, 1, 1])
    expect(out.actualBaseline).toBeNull()
    expect(out.todayIndex).toBe(2)
    expect(out.sprintMarkers).toEqual([
      { id: "s1", name: "S1", status: "active", startIndex: 0, endIndex: 2, taskCount: 2, doneCount: 1 },
    ])
  })

  it("A3-01: stops the actual line at today (fake clock) while the ideal line runs to the sprint end", () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-09-30T10:00:00+09:00"))
    const s = sprint("2026-09-30", "2026-10-07", [task("done", new Date()), task("todo"), task("todo")])
    const out = computeBurndown([s])
    expect(out.days).toHaveLength(8)
    expect(out.todayIndex).toBe(0)
    expect(out.actualLine).toEqual([2, null, null, null, null, null, null, null])
    expect(out.idealLine[7]).toBe(0)
    expect(out.idealLine.every((v) => v !== null)).toBe(true)
  })

  it("A3-01: the dashboard sparkline built from it has no future actual values", () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-10-01T12:00:00+09:00"))
    const s = sprint("2026-09-30", "2026-10-07", [task("done", new Date()), task("todo"), task("todo")])
    const spark = sparklineOf(computeBurndown([s]))
    expect(spark.actual).toEqual([3, 2, null, null, null, null, null, null])
    expect(spark.remaining).toBe(2)
  })

  it("A3-01: uses the Asia/Tokyo date for today even when UTC is still the previous day", () => {
    vi.useFakeTimers()
    // 2026-10-02 01:30 JST = 2026-10-01 16:30 UTC.
    vi.setSystemTime(new Date("2026-10-01T16:30:00Z"))
    const s = sprint("2026-09-30", "2026-10-07", [task("todo"), task("todo")])
    const out = computeBurndown([s])
    expect(out.todayIndex).toBe(2)
    expect(out.actualLine.slice(0, 4)).toEqual([2, 2, 2, null])
  })

  it("shows a flat history line before the first completion (no gap until the first burn)", () => {
    const s = sprint("2026-03-01", "2026-03-05", [task("done", d("2026-03-03")), task("todo")])
    const out = computeBurndown([s], d("2026-03-04"))
    expect(out.actualLine).toEqual([2, 2, 1, 1, null])
  })

  it("counts completions dated before the first day on the first day", () => {
    const s = sprint("2026-03-02", "2026-03-04", [task("done", d("2026-02-27")), task("todo")])
    const out = computeBurndown([s], d("2026-03-04"))
    expect(out.actualLine).toEqual([1, 1, 1])
  })

  it("has no actual line and todayIndex -1 for a sprint that starts in the future", () => {
    const s = sprint("2026-03-10", "2026-03-12", [task("todo")])
    const out = computeBurndown([s], d("2026-03-01"))
    expect(out.days[0]).toBe("2026-03-10")
    expect(out.actualLine).toEqual([null, null, null])
    expect(out.todayIndex).toBe(-1)
  })

  it("extends the range to today and keeps a flat plan after the last sprint", () => {
    const s = sprint("2026-03-01", "2026-03-01", [task("todo")], "done")
    const out = computeBurndown([s], d("2026-03-03"))
    expect(out.days).toHaveLength(3)
    expect(out.planLine).toEqual([1, 0, 0])
    expect(out.actualLine).toEqual([1, 1, 1])
    expect(out.todayIndex).toBe(2)
  })

  it("buildActualLine ignores tasks that are not done or lack a completion date", () => {
    const s = sprint("2026-03-01", "2026-03-02", [task("done", null), task("in_progress", d("2026-03-01"))])
    expect(buildActualLine([s], ["2026-03-01", "2026-03-02"], 2, "2026-03-02")).toEqual([2, 2])
  })

  it("formats Asia/Tokyo date keys", () => {
    expect(toDateKey(new Date("2026-01-04T15:30:00Z"))).toBe("2026-01-05")
    expect(toDateKey(new Date("2026-01-05T14:59:00Z"))).toBe("2026-01-05")
  })
})
