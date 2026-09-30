import { describe, expect, it } from "vitest"
import type { PortfolioRow } from "@/services/portfolio/portfolio.types"
import { DEFAULT_VIEW, nextSort, portfolioKpis, sortPortfolio, viewFromParams, viewToQuery } from "../portfolio-state"

const row = (id: string, over: Partial<PortfolioRow> = {}): PortfolioRow => ({
  id,
  name: id,
  i18n: {},
  status: "active",
  sections: [],
  activeSprint: null,
  overdueTasks: 0,
  openPbis: 0,
  openPoints: 0,
  velocity: [],
  velocityTrend: null,
  surveillance: null,
  plan: { progressPct: null, delayed: 0, atRisk: 0, total: 0 },
  lastActivityAt: null,
  needsAttention: false,
  ...over,
})

const ids = (rows: PortfolioRow[]) => rows.map((r) => r.id)

describe("sortPortfolio", () => {
  const rows = [
    row("b", { overdueTasks: 2, velocity: [5], surveillance: { severity: "warning", at: "" } }),
    row("a", { overdueTasks: 2, velocity: [9], surveillance: { severity: "critical", at: "" } }),
    row("c", { overdueTasks: 0 }),
  ]

  it("sorts numbers in both directions with name as tie-breaker", () => {
    expect(ids(sortPortfolio(rows, "overdue", "desc"))).toEqual(["a", "b", "c"])
    expect(ids(sortPortfolio(rows, "overdue", "asc"))).toEqual(["c", "a", "b"])
    expect(ids(sortPortfolio(rows, "name", "desc"))).toEqual(["c", "b", "a"])
  })

  it("keeps empty values last in either direction", () => {
    expect(ids(sortPortfolio(rows, "velocity", "desc"))).toEqual(["a", "b", "c"])
    expect(ids(sortPortfolio(rows, "velocity", "asc"))).toEqual(["b", "a", "c"])
    expect(ids(sortPortfolio(rows, "surveillance", "asc"))).toEqual(["b", "a", "c"])
  })

  it("uses the displayed (translated) name", () => {
    const shown: Record<string, string> = { a: "z", b: "y", c: "x" }
    expect(ids(sortPortfolio(rows, "name", "asc", (r) => shown[r.id]))).toEqual(["c", "b", "a"])
  })

  it("ranks plans by delayed, then at risk, then least progress", () => {
    const plans = [
      row("p1", { plan: { progressPct: 90, delayed: 0, atRisk: 2, total: 5 } }),
      row("p2", { plan: { progressPct: 10, delayed: 1, atRisk: 0, total: 5 } }),
      row("p3", { plan: { progressPct: 10, delayed: 0, atRisk: 2, total: 5 } }),
      row("p4"),
    ]
    expect(ids(sortPortfolio(plans, "plan", "desc"))).toEqual(["p2", "p3", "p1", "p4"])
  })
})

describe("A3-04 default order and first clicks", () => {
  it("defaults to overall risk: attention first, then overdue tasks, then delayed plan items", () => {
    const rows = [
      row("calm"),
      row("late-plan", { needsAttention: true, plan: { progressPct: 10, delayed: 3, atRisk: 0, total: 3 } }),
      row("overdue", { needsAttention: true, overdueTasks: 2 }),
    ]
    expect(DEFAULT_VIEW).toMatchObject({ sort: "risk", dir: "desc" })
    expect(ids(sortPortfolio(rows, DEFAULT_VIEW.sort, DEFAULT_VIEW.dir))).toEqual(["overdue", "late-plan", "calm"])
  })

  it.each(["overdue", "backlog", "velocity", "surveillance", "plan", "activity"] as const)("sorts %s worst / highest first on the first click", (key) => {
    expect(nextSort(DEFAULT_VIEW, key).dir).toBe("desc")
  })

  it("drops the removed status column from URLs", () => {
    expect(viewFromParams(new URLSearchParams("sort=status&dir=asc"))).toMatchObject({ sort: "risk" })
  })
})

describe("portfolioKpis", () => {
  it("totals the strip", () => {
    const sprint = { id: "s" } as PortfolioRow["activeSprint"]
    expect(
      portfolioKpis([
        row("a", { activeSprint: sprint, needsAttention: true, overdueTasks: 3, plan: { progressPct: 1, delayed: 2, atRisk: 0, total: 3 } }),
        row("b", { surveillance: { severity: "critical", at: "" }, needsAttention: true, overdueTasks: 1 }),
        row("c"),
      ])
    ).toEqual({ projects: 3, activeSprints: 1, attention: 2, overdueTasks: 4, delayedPlan: 2, critical: 1 })
  })
})

describe("URL state", () => {
  it("round-trips filters and sort, omitting defaults", () => {
    expect(viewToQuery(DEFAULT_VIEW)).toBe("")
    const v = { section: "s1", status: "active", attentionOnly: true, sort: "name" as const, dir: "asc" as const }
    expect(viewToQuery(v)).toBe("?section=s1&status=active&attention=1&sort=name&dir=asc")
    expect(viewFromParams(new URLSearchParams(viewToQuery(v)))).toEqual(v)
  })

  it("falls back on unknown values and uses the column's default direction", () => {
    expect(viewFromParams(new URLSearchParams("sort=bogus&dir=up&status=weird"))).toEqual(DEFAULT_VIEW)
    expect(viewFromParams(new URLSearchParams("sort=name"))).toMatchObject({ sort: "name", dir: "asc" })
  })

  it("header clicks flip the same column and reset another", () => {
    expect(nextSort(DEFAULT_VIEW, "overdue")).toEqual({ sort: "overdue", dir: "desc" })
    expect(nextSort({ ...DEFAULT_VIEW, sort: "overdue", dir: "desc" }, "overdue")).toEqual({ sort: "overdue", dir: "asc" })
    expect(nextSort(DEFAULT_VIEW, "name")).toEqual({ sort: "name", dir: "asc" })
    expect(nextSort(DEFAULT_VIEW, "activity")).toEqual({ sort: "activity", dir: "desc" })
  })
})
