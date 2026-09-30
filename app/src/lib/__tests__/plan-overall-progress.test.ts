import { describe, expect, it } from "vitest"
import { planOverallProgress, type OverallPlanRow } from "../plan-overall-progress"

const day = (s: string) => new Date(`${s}T00:00:00Z`)
function row(id: string, over: Partial<OverallPlanRow> = {}): OverallPlanRow {
  return { id, parentId: null, progressPct: 0, status: "not_started", plannedStart: day("2026-06-01"), plannedEnd: day("2026-06-10"), isMilestone: false, ...over }
}

describe("planOverallProgress (A3-13)", () => {
  it("is null without items", () => {
    expect(planOverallProgress([])).toBeNull()
  })

  it("weights top-level items by planned days and ignores children (they are already rolled up)", () => {
    const rows = [
      row("a", { progressPct: 4, plannedStart: day("2026-06-01"), plannedEnd: day("2026-07-03") }), // 33 days
      row("a1", { parentId: "a", progressPct: 90 }),
      row("b", { progressPct: 0, plannedStart: day("2026-10-08"), plannedEnd: day("2026-10-30") }), // 23 days
    ]
    expect(planOverallProgress(rows)).toBe(2) // (4*33 + 0*23) / 56 = 2.36
  })

  it("gives milestones no weight unless every root is a milestone", () => {
    expect(planOverallProgress([row("a", { progressPct: 50 }), row("m", { isMilestone: true, progressPct: 0 })])).toBe(50)
    expect(planOverallProgress([row("m1", { isMilestone: true, progressPct: 100 }), row("m2", { isMilestone: true })])).toBe(50)
  })

  it("treats orphans as top level and clamps out-of-range values", () => {
    expect(planOverallProgress([row("x", { parentId: "gone", progressPct: 150 })])).toBe(100)
  })
})
