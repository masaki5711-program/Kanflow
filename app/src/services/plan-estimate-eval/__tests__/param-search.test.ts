/** The deterministic parameter search (pure): determinism, bounds, the margin rule, too few projects. SYNTHETIC data. */
import { describe, expect, it, vi } from "vitest"

// Pure functions only: no database client is opened.
vi.mock("@/services/_shared/db", () => ({ defaultDb: {}, withTransaction: vi.fn() }))

import { observationsOf, runBacktest, type BacktestProject } from "@/lib/plan-estimate"
import { resolveConfig } from "@/lib/plan-estimate/estimate"
import { syntheticPortfolio } from "@/lib/plan-estimate/synthetic"
import { DEFAULT_PARAMS, PARAM_GRID, SEARCH_MARGIN, SEARCH_MAX_CANDIDATES, TUNED_KEYS, gridCandidates, holdoutSize, isGridParams, metricsOf, searchParams, type TunedParams } from "../param-search"

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
    expect(holdoutSize(5)).toBe(2)
  })
})

describe("searchParams", () => {
  it("proposes nothing for a lineage with fewer finished projects than the gate needs", async () => {
    const r = await searchParams({ projects: steadyOverrun(4), pool: [] }, { yieldControl: noYield })
    expect(r).toMatchObject({ outcome: "keep_default", reason: "not_enough_actuals", params: DEFAULT_PARAMS, before: null, after: null, evaluated: 1 })
  })

  it("is deterministic: the same input gives the same proposal", async () => {
    const input = { projects: steadyOverrun(9), pool: [] }
    const a = await searchParams(input, { yieldControl: noYield })
    const b = await searchParams({ projects: [...input.projects].reverse(), pool: [] }, { yieldControl: noYield })
    expect(b).toEqual(a)
    expect(a.evaluated).toBe(81)
  })

  it("proposes a better set when it clearly beats the default, holds on the hold-out and passes the gate", async () => {
    const r = await searchParams({ projects: steadyOverrun(9), pool: [] }, { yieldControl: noYield })
    expect(r.outcome).toBe("propose")
    expect(r.params).not.toEqual(DEFAULT_PARAMS)
    expect(isGridParams(r.params)).toBe(true)
    const before = r.before as NonNullable<typeof r.before>
    const after = r.after as NonNullable<typeof r.after>
    expect(after.search.mape <= (1 - SEARCH_MARGIN) * before.search.mape || (after.search.p80Hit >= 0.7 && before.search.p80Hit < 0.7)).toBe(true)
    expect(after.holdout.mape).toBeLessThanOrEqual(before.holdout.mape)
    // The proposal's numbers are exactly what the backtest gives with those settings.
    expect(after).toEqual(metricsOf(runBacktest(steadyOverrun(9), { ...r.params })))
  })

  it("keeps the default when no candidate beats it by the margin (a lineage that matches its template)", async () => {
    const r = await searchParams({ projects: steadyOverrun(8, 1), pool: [] }, { yieldControl: noYield })
    expect(r.outcome).toBe("keep_default")
    expect(r.reason).toBe("no_improvement")
    expect(r.params).toEqual(DEFAULT_PARAMS)
    expect(r.before).not.toBeNull()
  })

  it("on the synthetic portfolio every outcome uses grid values only and is reproducible", async () => {
    const portfolio = syntheticPortfolio({ projects: 16 })
    for (const lineage of new Set(portfolio.map((p) => p.lineage))) {
      const projects = lineageOf(portfolio, lineage)
      const pool = portfolio.filter((p) => p.lineage !== lineage).flatMap(observationsOf)
      const a = await searchParams({ projects, pool }, { yieldControl: noYield })
      expect(isGridParams(a.params)).toBe(true)
      if (a.outcome === "keep_default") expect(a.params).toEqual(DEFAULT_PARAMS)
      expect(await searchParams({ projects, pool }, { yieldControl: noYield })).toEqual(a)
    }
  })

  it("past the time budget it proposes nothing (never a partial grid) and says so", async () => {
    let now = 0
    const clock = () => (now += 1000)
    const r = await searchParams({ projects: steadyOverrun(9), pool: [] }, { yieldControl: noYield, clock, budgetMs: 5000 })
    expect(r).toMatchObject({ outcome: "keep_default", reason: "time_budget", timedOut: true, params: DEFAULT_PARAMS })
    expect(r.evaluated).toBeLessThan(81)
    expect(r.before).not.toBeNull()
  })

  it("yields between candidates so the web's event loop is not held", async () => {
    const yieldControl = vi.fn(() => Promise.resolve())
    await searchParams({ projects: steadyOverrun(6), pool: [] }, { yieldControl })
    expect(yieldControl).toHaveBeenCalledTimes(80)
  })

  it("a proposal is never a set outside the grid even when a wider one would fit better", async () => {
    const narrow = { outlierMads: [3], halfLifeDays: [365], shrinkK: [3, 6], spreadPrior: [0.25] }
    const r = await searchParams({ projects: steadyOverrun(9), pool: [] }, { yieldControl: noYield, grid: narrow })
    expect(r.candidates).toBe(2)
    expect([3, 6]).toContain((r.params as TunedParams).shrinkK)
    expect(r.params.outlierMads).toBe(3)
  })
})
