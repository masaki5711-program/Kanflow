/** runBacktest with real-shaped input (plan 12 §5 "継続"): given observations and a learning-only pool. SYNTHETIC data. */
import { describe, expect, it } from "vitest"
import { observationsOf, runBacktest, type BacktestProject } from "../backtest"
import { syntheticPortfolio } from "../synthetic"
import type { Observation } from "../types"

const portfolio = syntheticPortfolio()

describe("observationsOf", () => {
  it("returns the given observations instead of deriving them from the schedule", () => {
    const p = portfolio[0]
    const given: Observation[] = observationsOf(p).slice(0, 1).map((o) => ({ ...o, snapshotItemId: "given-1" }))
    expect(observationsOf({ ...p, observations: given })).toEqual(given)
  })

  it("derives them when none are given (unchanged behaviour)", () => {
    const p = portfolio[0]
    expect(observationsOf(p).length).toBeGreaterThan(0)
    expect(observationsOf(p).every((o) => o.sourceProjectId === p.projectId)).toBe(true)
  })
})

describe("runBacktest with a pool", () => {
  it("an empty pool gives the same report as before", () => {
    expect(runBacktest(portfolio, undefined, [])).toEqual(runBacktest(portfolio))
  })

  it("scores only the given projects; pool projects are learned from, never scored", () => {
    const lineage = portfolio[0].lineage
    const scored = portfolio.filter((p) => p.lineage === lineage)
    const poolProjects = portfolio.filter((p) => p.lineage !== lineage)
    const pool = poolProjects.flatMap(observationsOf)
    const report = runBacktest(scored, undefined, pool)
    expect(report.projects.map((r) => r.projectId).sort()).toEqual(scored.map((p) => p.projectId).sort())
    expect(Object.keys(report.byLineage)).toEqual([lineage])
  })

  it("does not take an observation twice when the pool repeats a scored project's", () => {
    const scored = portfolio.slice(0, 6)
    const twice = runBacktest(scored, undefined, scored.flatMap(observationsOf))
    expect(twice).toEqual(runBacktest(scored))
  })

  it("never learns a project from its own observations, even through the pool", () => {
    const one: BacktestProject[] = [portfolio[0]]
    const report = runBacktest(one, undefined, observationsOf(portfolio[0]))
    expect(report.projects[0].priorObservations).toBe(0)
    // With nothing to learn from, the estimate is the template.
    expect(report.overall.mapeEstimate).toBeCloseTo(report.overall.mapeTemplate, 10)
  })
})
