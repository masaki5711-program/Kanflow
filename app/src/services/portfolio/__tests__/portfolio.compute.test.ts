import { describe, expect, it } from "vitest"
import { BURN_MAX_DAYS, daysLeft, needsAttention, planSummary, sprintBurn, tokyoDay, velocityTrend, type PlanRow } from "../portfolio.compute"
import { EMPTY_PORTFOLIO_FILTERS, filterPortfolio, type PortfolioRow } from "../portfolio.types"
import { canViewPortfolio, portfolioProjectWhere, severityFromMeta } from "../portfolio.scope"

/** Midnight Tokyo of a YYYY-MM-DD. */
const jst = (day: string, hour = 0) => new Date(`${day}T${String(hour).padStart(2, "0")}:00:00+09:00`)

describe("days", () => {
  it("counts Tokyo calendar days", () => {
    expect(tokyoDay(jst("2026-10-01", 23)) - tokyoDay(jst("2026-10-01", 0))).toBe(0)
    expect(daysLeft(jst("2026-10-01", 18), jst("2026-10-03"))).toBe(2)
    expect(daysLeft(jst("2026-10-05"), jst("2026-10-03"))).toBe(-2)
  })
})

describe("sprintBurn", () => {
  const tasks = [
    { status: "done", completedAt: jst("2026-10-01", 15) },
    { status: "done", completedAt: jst("2026-10-03", 9) },
    { status: "done", completedAt: null },
    { status: "todo", completedAt: null },
  ]

  it("gives remaining tasks per day from start to today", () => {
    expect(sprintBurn(tasks, jst("2026-10-01"), jst("2026-10-10"), jst("2026-10-04", 12))).toEqual([2, 2, 1, 1])
  })

  it("stops at the sprint end and handles a sprint that has not started", () => {
    expect(sprintBurn(tasks, jst("2026-10-01"), jst("2026-10-02"), jst("2026-10-20"))).toEqual([2, 2])
    expect(sprintBurn(tasks, jst("2026-11-01"), jst("2026-11-10"), jst("2026-10-20"))).toEqual([4])
  })

  it("caps very long sprints", () => {
    expect(sprintBurn([], jst("2026-01-01"), jst("2026-12-31"), jst("2026-12-31"))).toHaveLength(BURN_MAX_DAYS)
  })
})

describe("velocityTrend", () => {
  it("compares the last sprint with the earlier average (±10 %)", () => {
    expect(velocityTrend([])).toBeNull()
    expect(velocityTrend([10])).toBeNull()
    expect(velocityTrend([10, 12, 15])).toBe("up")
    expect(velocityTrend([10, 10, 8])).toBe("down")
    expect(velocityTrend([10, 10, 10.5])).toBe("flat")
    expect(velocityTrend([0, 0])).toBe("flat")
    expect(velocityTrend([0, 3])).toBe("up")
  })
})

describe("planSummary", () => {
  const item = (over: Partial<PlanRow>): PlanRow => ({
    id: "x", parentId: null, progressPct: 0, plannedStart: jst("2026-10-01"), plannedEnd: jst("2026-10-10"), status: "in_progress", ...over,
  })
  const today = jst("2026-10-06", 10)

  it("is empty without plan items", () => {
    expect(planSummary([], today)).toEqual({ progressPct: null, delayed: 0, atRisk: 0, total: 0 })
  })

  it("weights top-level progress by duration and counts delayed / at-risk leaves", () => {
    const items = [
      item({ id: "root", progressPct: 50, plannedStart: jst("2026-09-01"), plannedEnd: jst("2026-10-30") }), // 60 days
      item({ id: "late", parentId: "root", plannedEnd: jst("2026-10-05"), progressPct: 80 }), // past end, not done
      item({ id: "behind", parentId: "root", progressPct: 10 }), // 6/10 elapsed, 10 % done
      item({ id: "fine", parentId: "root", progressPct: 60 }),
      item({ id: "doneLate", parentId: "root", plannedEnd: jst("2026-10-01"), status: "done", progressPct: 100 }),
      item({ id: "future", parentId: "root", plannedStart: jst("2026-11-01"), plannedEnd: jst("2026-11-10") }),
      item({ id: "solo", progressPct: 100, status: "done", plannedStart: jst("2026-10-01"), plannedEnd: jst("2026-10-20") }), // 20 days
    ]
    expect(planSummary(items, today)).toEqual({ progressPct: Math.round((50 * 60 + 100 * 20) / 80), delayed: 1, atRisk: 1, total: 7 })
  })

  it("treats an orphan (parent missing) as a top-level item", () => {
    expect(planSummary([item({ id: "o", parentId: "gone", progressPct: 40 })], today)).toMatchObject({ progressPct: 40, total: 1 })
  })
})

describe("needsAttention", () => {
  const plan = { progressPct: 10, delayed: 0, atRisk: 3, total: 5 }
  it("flags critical surveillance, overdue tasks or delayed plan items", () => {
    expect(needsAttention({ surveillance: null, overdueTasks: 0, plan })).toBe(false)
    expect(needsAttention({ surveillance: { severity: "warning" }, overdueTasks: 0, plan })).toBe(false)
    expect(needsAttention({ surveillance: { severity: "critical" }, overdueTasks: 0, plan })).toBe(true)
    expect(needsAttention({ surveillance: null, overdueTasks: 1, plan })).toBe(true)
    expect(needsAttention({ surveillance: null, overdueTasks: 0, plan: { ...plan, delayed: 1 } })).toBe(true)
  })
})

describe("filterPortfolio", () => {
  const row = (id: string, over: Partial<PortfolioRow> = {}): PortfolioRow =>
    ({ id, status: "active", sections: [], needsAttention: false, ...over }) as PortfolioRow
  const rows = [
    row("a", { sections: [{ id: "s1", name: "S1" }] }),
    row("b", { status: "archived", needsAttention: true, sections: [{ id: "s2", name: "S2" }] }),
    row("c", { needsAttention: true }),
  ]
  const ids = (f: Partial<typeof EMPTY_PORTFOLIO_FILTERS>) => filterPortfolio(rows, { ...EMPTY_PORTFOLIO_FILTERS, ...f }).map((r) => r.id)

  it("filters by section, no section, status and attention", () => {
    expect(ids({})).toEqual(["a", "b", "c"])
    expect(ids({ section: "s2" })).toEqual(["b"])
    expect(ids({ section: "none" })).toEqual(["c"])
    expect(ids({ status: "active" })).toEqual(["a", "c"])
    expect(ids({ attentionOnly: true })).toEqual(["b", "c"])
    expect(ids({ attentionOnly: true, status: "active" })).toEqual(["c"])
  })
})

describe("portfolio scope", () => {
  it("admins and section managers only", () => {
    expect(canViewPortfolio({ userId: "u", systemRole: "admin" })).toBe(true)
    expect(canViewPortfolio({ userId: "u", systemRole: "section_manager" })).toBe(true)
    expect(canViewPortfolio({ userId: "u", systemRole: "member" })).toBe(false)
    expect(canViewPortfolio(null)).toBe(false)
  })

  it("admins see all live projects; section managers their sections' live projects", () => {
    expect(portfolioProjectWhere({ userId: "u", systemRole: "admin" })).toEqual({ deletedAt: null })
    expect(portfolioProjectWhere({ userId: "u9", systemRole: "section_manager" })).toEqual({
      deletedAt: null,
      sections: { some: { section: { users: { some: { userId: "u9" } } } } },
    })
  })

  it("reads the highest severity from report meta", () => {
    expect(severityFromMeta(JSON.stringify({ anomalies: [{ severity: "warning" }, { severity: "critical" }] }))).toBe("critical")
    expect(severityFromMeta("{bad")).toBe("none")
    expect(severityFromMeta(null)).toBe("none")
  })
})
