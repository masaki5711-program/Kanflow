import { describe, expect, it } from "vitest"
import type { BaseSchedule } from "@/lib/plan-schedule/base-schedule"
import { planBaseSchedule } from "@/lib/plan-schedule/base-schedule"
import { runBacktest } from "../backtest"
import { addDays, dayNumber } from "../dates"
import { criticalChain, estimatePlan } from "../plan"
import { syntheticPortfolio } from "../synthetic"
import type { EstimateContext, Observation } from "../types"

const SCHEDULE: BaseSchedule = {
  items: [
    { key: "spec", name: "仕様", children: [{ key: "req", name: "要件", durationDays: 5 }, { key: "rfq", name: "見積", durationDays: 3, dependsOn: ["req"] }] },
    { key: "side", name: "並行作業", durationDays: 2, dependsOn: ["req"] },
    { key: "build", name: "製作", durationDays: 10, dependsOn: ["spec"] },
    { key: "accept", name: "検収", milestone: true, dependsOn: ["build"] },
  ],
}

const ctx = (visible: string[], referenceDate = "2026-11-01"): EstimateContext => ({ lineage: "eq", projectType: "equipment", attributes: [], referenceDate, visibleProjectIds: new Set(visible) })

function obs(projectId: string, key: string, planned: number, actual: number): Observation {
  return { snapshotItemId: `${projectId}:${key}`, sourceProjectId: projectId, lineage: "eq", projectType: "equipment", templateKey: key, name: key, attributes: [], plannedDays: planned, actualDays: actual, closedAt: "2026-05-01", finalizedAt: "2026-05-03" }
}

describe("criticalChain", () => {
  it("follows the predecessor that releases each leaf, skipping the side branch", () => {
    const placed = planBaseSchedule(SCHEDULE, "2026-11-02")
    expect(criticalChain(placed.rows)).toEqual(["req", "rfq", "build", "accept"])
  })

  it("leaves without dependencies follow each other in display order", () => {
    const placed = planBaseSchedule({ items: [{ key: "a", name: "A", durationDays: 2 }, { key: "b", name: "B", durationDays: 3 }] }, "2026-11-02")
    expect(criticalChain(placed.rows)).toEqual(["a", "b"])
  })
})

describe("estimatePlan", () => {
  it("with no data the P50 end is the template end and B comes from the prior spread on the critical chain", () => {
    const e = estimatePlan(SCHEDULE, [], ctx([]), "2026-11-02")
    expect(e.p50End).toBe(e.templateEnd)
    const spread = (t: number) => Math.ceil(t * Math.exp(0.25) - 1e-9) - t
    const expectedB = Math.ceil(Math.sqrt(spread(5) ** 2 + spread(3) ** 2 + spread(10) ** 2) - 1e-9)
    expect(e.bufferDays).toBe(expectedB)
    expect(e.p80End).toBe(addDays(e.p50End, expectedB, false))
    expect(e.criticalKeys).toEqual(["req", "rfq", "build", "accept"])
  })

  it("writes D50 into the schedule it returns and moves the end date with the data", () => {
    const projects = ["p1", "p2", "p3", "p4", "p5"]
    const data = projects.flatMap((p) => [obs(p, "build", 10, 15), obs(p, "req", 5, 5)])
    const e = estimatePlan(SCHEDULE, data, ctx(projects), "2026-11-02")
    const build = e.leaves.find((l) => l.key === "build")
    const built = e.schedule.items.find((i) => i.key === "build")
    expect(built?.durationDays).toBe(build?.d50)
    expect(dayNumber(e.p50End)).toBeGreaterThan(dayNumber(e.templateEnd))
    expect(e.methodVersion).toBe("e2-v1")
  })

  it("start_date_sweep_does_not_isolate_hidden_source", () => {
    const hidden = ["h1", "h2", "h3", "h4", "h5"]
    const data = hidden.map((p, i) => obs(p, "build", 10, 11 + i * 3))
    const results = Array.from({ length: 40 }, (_, d) => estimatePlan(SCHEDULE, data, ctx(["v0"], "2026-11-01"), addDays("2026-11-02", d, false)))
    const first = JSON.stringify(results[0].leaves)
    for (const r of results) {
      expect(JSON.stringify(r.leaves)).toBe(first)
      expect(r.bufferDays).toBe(results[0].bufferDays)
    }
  })

  it("does not mutate the input schedule", () => {
    const copy = structuredClone(SCHEDULE)
    estimatePlan(SCHEDULE, [obs("p1", "build", 10, 20)], ctx(["p1"]), "2026-11-02")
    expect(SCHEDULE).toEqual(copy)
  })
})

describe("backtest on the synthetic portfolio (plan 12 §8 item 3)", () => {
  const report = runBacktest(syntheticPortfolio())

  it("estimates beat the template and the P80 hit rate is within 70-90 %", () => {
    expect(report.projects).toHaveLength(12)
    expect(report.overall.mapeEstimate).toBeLessThan(report.overall.mapeTemplate)
    expect(report.overall.p80HitRate).toBeGreaterThanOrEqual(0.7)
    expect(report.overall.p80HitRate).toBeLessThanOrEqual(0.9)
    expect(report.overall.endErrorEstimateDays).toBeLessThanOrEqual(report.overall.endErrorTemplateDays)
  })

  it("backtest_reports_mape_by_repo_count", () => {
    expect(Object.keys(report.byRepoCount).toSorted()).toEqual(["0", "1", "2", "3"])
    for (const t of Object.values(report.byRepoCount)) {
      expect(t.leaves).toBeGreaterThan(0)
      expect(t.mapeTemplate).toBeGreaterThan(0)
    }
    expect(Object.keys(report.byLineage).toSorted()).toEqual(["equipment-install", "software-release"])
  })

  it("never learns from a project closed after the evaluated project's start month", () => {
    const first = report.projects.find((p) => p.projectId === "syn-01")
    expect(first?.priorObservations).toBe(0)
    expect(first?.mapeEstimate).toBeCloseTo(first?.mapeTemplate ?? -1, 9)
  })

  it("is deterministic", () => {
    expect(runBacktest(syntheticPortfolio())).toEqual(report)
  })
})
