/** The deterministic parameter search (pure): determinism, bounds, the margin rule, too few projects. SYNTHETIC data. */
import { describe, expect, it, vi } from "vitest"

// Pure functions only: no database client is opened.
vi.mock("@/services/_shared/db", () => ({ defaultDb: {}, withTransaction: vi.fn() }))

import { observationsOf, runBacktest, type BacktestProject, type Observation } from "@/lib/plan-estimate"
import { resolveConfig } from "@/lib/plan-estimate/estimate"
import { syntheticPortfolio } from "@/lib/plan-estimate/synthetic"
import { DEFAULT_PARAMS, PARAM_GRID, SEARCH_MARGIN, SEARCH_MAX_CANDIDATES, SEARCH_MIN_PROJECTS, TUNED_KEYS, gridCandidates, holdoutSize, isGridParams, metricsOf, qualifies, searchParams, type ParamSearchResult, type TunedParams } from "../param-search"

const noYield = () => Promise.resolve()
const lineageOf = (all: BacktestProject[], lineage: string) => all.filter((p) => p.lineage === lineage)

/**
 * A lineage whose leaves always took 1.6 × the template, closed one a month: the shrinkage constant K (and the spread)
 * decides how fast the estimate follows — a case where a non-default candidate clearly wins.
 */
function steadyOverrun(count: number, factor = 1.6): BacktestProject[] {
  return Array.from({ length: count }, (_, i) => {
    const month = String(i + 1).padStart(2, "0")
    return {
      projectId: `steady-${String(i).padStart(2, "0")}`,
      lineage: "steady",
      projectType: "steady-type",
      attributes: [],
      repoCount: 0,
      startDate: `2024-${month}-01`,
      closedAt: `2024-${month}-25`,
      finalizedAt: `2024-${month}-26`,
      schedule: {
        items: [
          { key: "a", name: "設計", durationDays: 10 },
          { key: "b", name: "製作", durationDays: 20, dependsOn: ["a"] },
          { key: "c", name: "試験", durationDays: 5, dependsOn: ["b"] },
        ],
      },
      actualDays: { a: Math.round(10 * factor), b: Math.round(20 * factor), c: Math.round(5 * factor) },
    }
  })
}

describe("the grid", () => {
  it("is small, bounded, starts with today's defaults and holds only values the estimator accepts", () => {
    const c = gridCandidates()
    expect(c.length).toBe(81)
    expect(c.length).toBeLessThanOrEqual(SEARCH_MAX_CANDIDATES)
    expect(c[0]).toEqual(DEFAULT_PARAMS)
    expect(DEFAULT_PARAMS).toEqual({ outlierMads: 3, halfLifeDays: 365, shrinkK: 3, spreadPrior: 0.25 })
    expect(new Set(c.map((p) => JSON.stringify(p))).size).toBe(c.length)
    for (const p of c) {
      expect(isGridParams(p)).toBe(true)
      expect(() => resolveConfig({ ...p })).not.toThrow()
    }
    // Each default sits inside its range (searched around it, not at an edge).
    for (const k of TUNED_KEYS) {
      expect(Math.min(...PARAM_GRID[k])).toBeLessThan(DEFAULT_PARAMS[k])
      expect(Math.max(...PARAM_GRID[k])).toBeGreaterThan(DEFAULT_PARAMS[k])
    }
  })

  it("refuses a grid larger than the cap", () => {
    const big = { ...PARAM_GRID, outlierMads: [1, 2, 2.5, 3, 3.5, 4] }
    expect(() => gridCandidates(big)).toThrow(RangeError)
  })

  it("stored settings must be grid values with exactly the searched keys", () => {
    expect(isGridParams({ ...DEFAULT_PARAMS })).toBe(true)
    expect(isGridParams({ ...DEFAULT_PARAMS, shrinkK: 2 })).toBe(false)
    expect(isGridParams({ ...DEFAULT_PARAMS, minHiddenSources: 1 })).toBe(false)
    expect(isGridParams(Object.fromEntries(Object.entries(DEFAULT_PARAMS).filter(([k]) => k !== "spreadPrior")))).toBe(false)
    expect(isGridParams(null)).toBe(false)
    expect(isGridParams([1, 2, 3, 4])).toBe(false)
  })
})

describe("metrics", () => {
  it("are the gate's backtest metrics, with the latest third of the scored projects held out", () => {
    const projects = steadyOverrun(9)
    const report = runBacktest(projects)
    const m = metricsOf(report)
    expect(m.full).toMatchObject({ n: 9, mape: report.overall.mapeEstimate, mapeTemplate: report.overall.mapeTemplate, p80Hit: report.overall.p80HitRate })
    expect(m.full.endErrorDays).toBeCloseTo(report.overall.endErrorEstimateDays, 10)
    expect(m.search.projects + m.holdout.projects).toBe(9)
    expect(m.holdout.projects).toBe(holdoutSize(9))
  })
})

/** The result without its wall-clock fields (logged only). */
function stable(r: ParamSearchResult | null): Omit<ParamSearchResult, "elapsedMs" | "slowestCandidateMs"> {
  if (!r) throw new Error("the search paused")
  return Object.fromEntries(Object.entries(r).filter(([k]) => k !== "elapsedMs" && k !== "slowestCandidateMs")) as Omit<ParamSearchResult, "elapsedMs" | "slowestCandidateMs">
}
const search = async (projects: BacktestProject[], opts: Parameters<typeof searchParams>[1] = {}, pool: Observation[] = []) => stable(await searchParams({ projects, pool }, { yieldControl: noYield, ...opts }))

describe("qualifies (the margin rule against the baseline, ranking part only)", () => {
  const m = (mape: number, p80Hit: number) => ({ projects: 5, leaves: 15, mape, mapeTemplate: 0.4, p80Hit, endErrorDays: 1, endErrorTemplateDays: 2 })
  it("needs a MAPE smaller by the margin", () => {
    expect(qualifies(m(0.191, 0.8), m(0.2, 0.8))).toBe(false)
    expect(qualifies(m(0.189, 0.8), m(0.2, 0.8))).toBe(true)
    // A baseline without error cannot be beaten.
    expect(qualifies(m(0, 0.8), m(0, 0.8))).toBe(false)
  })
  it("never takes a candidate that moves P80 out of the range, however good its MAPE", () => {
    expect(qualifies(m(0.05, 0.6), m(0.2, 0.8))).toBe(false)
  })
  it("takes a candidate that brings P80 into the range without a worse MAPE, and only then", () => {
    expect(qualifies(m(0.2, 0.75), m(0.2, 0.6))).toBe(true)
    expect(qualifies(m(0.21, 0.75), m(0.2, 0.6))).toBe(false)
  })
})

describe("searchParams", () => {
  it("needs more finished projects than the gate (SEARCH_MIN_PROJECTS, a hold-out of at least 3)", async () => {
    expect(SEARCH_MIN_PROJECTS).toBeGreaterThan(5)
    expect(holdoutSize(8)).toBe(3)
    expect(holdoutSize(12)).toBe(4)
    const r = await search(steadyOverrun(SEARCH_MIN_PROJECTS - 1))
    expect(r).toMatchObject({ outcome: "keep_default", reason: "not_enough_actuals", params: DEFAULT_PARAMS, before: null, after: null, evaluated: 1 })
  })

  it("is deterministic: the same input gives the same proposal", async () => {
    const a = await search(steadyOverrun(9))
    const b = await search([...steadyOverrun(9)].reverse())
    expect(b).toEqual(a)
    expect(a.evaluated).toBe(81)
  })

  it("proposes a better set when it beats the baseline by the margin, holds on the hold-out and passes the gate", async () => {
    const r = await search(steadyOverrun(9))
    expect(r.outcome).toBe("propose")
    expect(r.params).not.toEqual(DEFAULT_PARAMS)
    expect(isGridParams(r.params)).toBe(true)
    const before = r.before as NonNullable<typeof r.before>
    const after = r.after as NonNullable<typeof r.after>
    expect(qualifies(after.search, before.search)).toBe(true)
    expect(after.search.mape).toBeLessThanOrEqual((1 - SEARCH_MARGIN) * before.search.mape)
    expect(after.holdout.mape).toBeLessThanOrEqual(before.holdout.mape)
    // The proposal's numbers are exactly what the backtest gives with those settings.
    expect(after).toEqual(metricsOf(runBacktest(steadyOverrun(9), { ...r.params })))
    // ...and it has the smallest ranking MAPE of every qualifying candidate in the grid.
    for (const c of gridCandidates()) {
      const m = metricsOf(runBacktest(steadyOverrun(9), { ...c })).search
      if (qualifies(m, before.search)) expect(after.search.mape).toBeLessThanOrEqual(m.mape)
    }
  })

  it("compares with the settings IN USE: approved settings are the baseline, never proposed again", async () => {
    const first = await search(steadyOverrun(9))
    const again = await search(steadyOverrun(9), { baseline: first.params })
    expect(again.baseline).toEqual(first.params)
    expect(again.before).toEqual(first.after)
    expect(again.params === first.params || again.outcome === "keep_default").toBe(true)
    if (again.outcome === "propose") expect(again.params).not.toEqual(first.params)
    expect(gridCandidates(PARAM_GRID, first.params)[0]).toEqual(first.params)
  })

  it("keeps the baseline when no candidate beats it by the margin (a lineage that matches its template)", async () => {
    const r = await search(steadyOverrun(9, 1))
    expect(r).toMatchObject({ outcome: "keep_default", reason: "no_improvement", params: DEFAULT_PARAMS })
    expect(r.before).not.toBeNull()
  })

  it("on the synthetic portfolio every outcome uses grid values only and is reproducible", async () => {
    const portfolio = syntheticPortfolio({ projects: 16 })
    for (const lineage of new Set(portfolio.map((p) => p.lineage))) {
      const projects = lineageOf(portfolio, lineage)
      const pool = portfolio.filter((p) => p.lineage !== lineage).flatMap(observationsOf)
      const a = await search(projects, {}, pool)
      expect(isGridParams(a.params)).toBe(true)
      if (a.outcome === "keep_default") expect(a.params).toEqual(DEFAULT_PARAMS)
      expect(await search(projects, {}, pool)).toEqual(a)
    }
  })

  it("past the time budget it proposes nothing (never a partial grid) and says so", async () => {
    let now = 0
    const clock = () => (now += 1000)
    const r = await search(steadyOverrun(9), { clock, budgetMs: 5000 })
    expect(r).toMatchObject({ outcome: "keep_default", reason: "time_budget", timedOut: true, params: DEFAULT_PARAMS })
    expect(r.evaluated).toBeLessThan(81)
    expect(r.before).not.toBeNull()
  })

  it("checks the budget after the baseline's run too", async () => {
    let now = 0
    // The first backtest alone takes longer than the budget.
    const clock = () => (now += 10_000)
    const yieldControl = vi.fn(() => Promise.resolve())
    const r = await searchParams({ projects: steadyOverrun(9), pool: [] }, { clock, budgetMs: 5000, yieldControl })
    expect(r).toMatchObject({ reason: "time_budget", evaluated: 1 })
    expect(yieldControl).not.toHaveBeenCalled()
    expect(r?.slowestCandidateMs).toBeGreaterThan(0)
  })

  it("yields between candidates so the web's event loop is not held", async () => {
    const yieldControl = vi.fn(() => Promise.resolve())
    await searchParams({ projects: steadyOverrun(9), pool: [] }, { yieldControl })
    expect(yieldControl).toHaveBeenCalledTimes(80)
  })

  it("pauses (null, nothing decided) as soon as it is asked to between candidates", async () => {
    let asked = 0
    const shouldPause = vi.fn(async () => ++asked >= 3)
    const r = await searchParams({ projects: steadyOverrun(9), pool: [] }, { yieldControl: noYield, shouldPause })
    expect(r).toBeNull()
    expect(shouldPause).toHaveBeenCalledTimes(3)
  })

  it("a proposal is never a set outside the grid even when a wider one would fit better", async () => {
    const narrow = { outlierMads: [3], halfLifeDays: [365], shrinkK: [3, 6], spreadPrior: [0.25] }
    const r = await search(steadyOverrun(9), { grid: narrow })
    expect(r.candidates).toBe(2)
    expect([3, 6]).toContain((r.params as TunedParams).shrinkK)
    expect(r.params.outlierMads).toBe(3)
  })
})
