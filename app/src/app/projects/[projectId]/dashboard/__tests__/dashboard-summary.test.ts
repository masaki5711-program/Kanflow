import { describe, expect, it } from "vitest"
import { DUE_MAX_ITEMS, buildUpcomingDue, daysFromToday, sparklineOf, sprintTimeline } from "../dashboard-summary"

// Stored dates are UTC midnight; "today" is the viewer's local day.
const now = new Date(2026, 8, 30, 18, 30) // local 2026-09-30 18:30
const day = (s: string) => `${s}T00:00:00.000Z`

describe("daysFromToday / sprintTimeline", () => {
  it("counts calendar days to a UTC-midnight date", () => {
    expect(daysFromToday(day("2026-09-30"), now)).toBe(0)
    expect(daysFromToday(day("2026-10-03"), now)).toBe(3)
    expect(daysFromToday(day("2026-09-28"), now)).toBe(-2)
    expect(daysFromToday("bad", now)).toBeNull()
  })

  it("describes the time left of a sprint", () => {
    expect(sprintTimeline(day("2026-10-04"), now)).toEqual({ kind: "left", days: 4 })
    expect(sprintTimeline(day("2026-09-30"), now)).toEqual({ kind: "today" })
    expect(sprintTimeline(day("2026-09-27"), now)).toEqual({ kind: "overdue", days: 3 })
    expect(sprintTimeline("bad", now)).toBeNull()
  })
})

describe("sparklineOf", () => {
  it("starts the actual series at the total and reports the remaining count", () => {
    const s = sparklineOf({ totalTasks: 4, idealLine: [4, 2, 0], actualLine: [null, 3, null], actualBaseline: 4 })
    expect(s).toEqual({ ideal: [4, 2, 0], actual: [4, 3, null], total: 4, remaining: 3 })
  })

  it("keeps a first-day burn and falls back to the total without any burn", () => {
    expect(sparklineOf({ totalTasks: 2, idealLine: [2, 0], actualLine: [1, 1], actualBaseline: 2 }).actual).toEqual([1, 1])
    expect(sparklineOf({ totalTasks: 5, idealLine: [5, 0], actualLine: [null, null], actualBaseline: null }).remaining).toBe(5)
  })
})

describe("buildUpcomingDue", () => {
  const plan = (id: string, end: string, over: Partial<{ status: string; isMilestone: boolean }> = {}) => ({
    id, name: id, plannedEnd: day(end), status: "in_progress", isMilestone: false, ...over,
  })

  it("merges open plan items and the sprint end, soonest (overdue) first, within 14 days", () => {
    const items = buildUpcomingDue(
      [plan("late", "2026-09-25"), plan("ms", "2026-10-05", { isMilestone: true }), plan("done", "2026-10-01", { status: "done" }), plan("far", "2026-10-20")],
      { id: "s1", name: "Sprint 1", endDate: day("2026-10-02") },
      now,
    )
    expect(items.map((i) => [i.id, i.kind, i.days])).toEqual([
      ["late", "plan_item", -5],
      ["s1", "sprint_end", 2],
      ["ms", "milestone", 5],
    ])
  })

  it("caps the list and skips unparsable dates", () => {
    const many = Array.from({ length: 10 }, (_, i) => plan(`p${i}`, `2026-10-0${1 + (i % 9)}`))
    expect(buildUpcomingDue([...many, plan("bad", "x")], null, now)).toHaveLength(DUE_MAX_ITEMS)
    expect(buildUpcomingDue([], null, now)).toEqual([])
  })
})
