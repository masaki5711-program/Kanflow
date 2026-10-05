/** 日程未定 (undated) plan items through the pure progress / schedule / summary rules. */
import { describe, expect, it, vi } from "vitest"

vi.mock("@/lib/prisma", () => ({ prisma: {} }))

import { baselineVarianceDays, computePlanRecalc, computeScheduleState, isDated, rollupChildren, sameDateOrNull, type PlanCalcNode } from "../plan-progress"
import { planOverallProgress } from "../plan-overall-progress"
import { summarizePlan, type PlanRow } from "../analysis-tools-planning"
import { planSummary } from "@/services/portfolio/portfolio.compute"

const d = (key: string) => new Date(`${key}T00:00:00.000Z`)

describe("plan-progress with undated items", () => {
  it("isDated / sameDateOrNull", () => {
    expect(isDated({ plannedStart: d("2026-01-01"), plannedEnd: d("2026-01-02") })).toBe(true)
    expect(isDated({ plannedStart: null, plannedEnd: null })).toBe(false)
    expect(isDated({ plannedStart: d("2026-01-01"), plannedEnd: null })).toBe(false)
    expect(sameDateOrNull(null, null)).toBe(true)
    expect(sameDateOrNull(null, d("2026-01-01"))).toBe(false)
    expect(sameDateOrNull(d("2026-01-01"), d("2026-01-01"))).toBe(true)
  })

  it("an undated item is never delayed / at_risk", () => {
    const undated = { status: "in_progress", progressPct: 0, plannedStart: null, plannedEnd: null }
    expect(computeScheduleState(undated, "2030-01-01")).toBe("on_track")
    expect(computeScheduleState({ ...undated, status: "not_started" }, "2030-01-01")).toBe("not_started")
    expect(computeScheduleState({ ...undated, status: "done", progressPct: 100 }, "2030-01-01")).toBe("done")
  })

  it("a parent spans only its dated children; none dated → null span; undated work weighs 1", () => {
    const child = (s: string | null, e: string | null, pct: number, isMilestone = false) => ({
      plannedStart: s ? d(s) : null,
      plannedEnd: e ? d(e) : null,
      progressPct: pct,
      status: pct === 100 ? "done" : "not_started",
      isMilestone,
    })
    const mixed = rollupChildren([child("2026-01-01", "2026-01-03", 100), child(null, null, 0)])
    expect(mixed.plannedStart?.toISOString()).toBe("2026-01-01T00:00:00.000Z")
    expect(mixed.plannedEnd?.toISOString()).toBe("2026-01-03T00:00:00.000Z")
    // 3 days @100 + 1 (undated) @0 → 75
    expect(mixed.progressPct).toBe(75)
    const none = rollupChildren([child(null, null, 100), child(null, null, 0)])
    expect(none).toMatchObject({ plannedStart: null, plannedEnd: null, progressPct: 50 })
  })

  it("baseline variance needs a planned end", () => {
    expect(baselineVarianceDays(null, d("2026-01-01"))).toBeNull()
    expect(baselineVarianceDays(d("2026-01-03"), d("2026-01-01"))).toBe(2)
  })

  it("recalc clears a parent's span when its last dated child loses its dates", () => {
    const nodes: PlanCalcNode[] = [
      { id: "p", parentId: null, status: "not_started", progressPct: 0, progressMode: "manual", isMilestone: false, plannedStart: d("2026-01-01"), plannedEnd: d("2026-01-05") },
      { id: "c", parentId: "p", status: "not_started", progressPct: 0, progressMode: "manual", isMilestone: false, plannedStart: null, plannedEnd: null },
    ]
    const { updates } = computePlanRecalc(nodes, new Map(), ["c"])
    expect(updates).toEqual([{ id: "p", plannedStart: null, plannedEnd: null }])
  })
})

describe("summaries with undated items", () => {
  const row = (id: string, over: Partial<PlanRow> = {}): PlanRow => ({
    id,
    parentId: null,
    name: id,
    plannedStart: null,
    plannedEnd: null,
    progressPct: 0,
    status: "not_started",
    isMilestone: false,
    sortOrder: 1,
    ...over,
  })

  it("planOverallProgress counts undated top-level items", () => {
    expect(planOverallProgress([row("a", { progressPct: 100, status: "done" }), row("b")])).toBe(50)
  })

  it("the AI plan summary never reports undated items as overdue or as upcoming milestones", () => {
    const today = d("2026-10-10")
    const out = summarizePlan(
      [
        row("late", { plannedStart: d("2026-09-01"), plannedEnd: d("2026-09-30") }),
        row("undated"),
        row("ms", { isMilestone: true }),
        row("ms2", { isMilestone: true, plannedStart: d("2026-10-15"), plannedEnd: d("2026-10-15") }),
      ],
      today,
    )
    expect(out.overdue_items.map((o) => o.name)).toEqual(["late"])
    expect(out.upcoming_milestones.map((m) => m.name)).toEqual(["ms2"])
    expect(out.undated_count).toBe(2)
    expect(out.top_level.find((t) => t.name === "undated")).toMatchObject({ period: "undated", overdue: false })
  })

  it("the portfolio counts no delay for undated leaves", () => {
    const res = planSummary(
      [
        { id: "a", parentId: null, progressPct: 0, status: "in_progress", isMilestone: false, plannedStart: null, plannedEnd: null },
        { id: "b", parentId: null, progressPct: 0, status: "in_progress", isMilestone: false, plannedStart: d("2026-01-01"), plannedEnd: d("2026-01-02") },
      ],
      d("2026-10-10"),
    )
    expect(res).toMatchObject({ delayed: 1, total: 2 })
  })
})
