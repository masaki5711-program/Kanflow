import { describe, expect, it } from "vitest"
import {
  achievementRate,
  addMonthsUtc,
  isCheckDue,
  isWorsened,
  summarizeImprovements,
  targetContradictsDirection,
  type SummaryItem,
} from "../metrics"

const m = (direction: string, baselineValue: number | null, targetValue: number | null, resultValue: number | null) => ({
  direction,
  baselineValue,
  targetValue,
  resultValue,
})

describe("achievementRate", () => {
  it("decrease: (baseline - result) / (baseline - target)", () => {
    expect(achievementRate(m("decrease", 60, 30, 45))).toBeCloseTo(0.5)
    expect(achievementRate(m("decrease", 60, 30, 30))).toBe(1)
  })

  it("increase: (result - baseline) / (target - baseline)", () => {
    expect(achievementRate(m("increase", 80, 100, 95))).toBeCloseTo(0.75)
  })

  it("clamps worsening to 0 and over-achievement to 200 %", () => {
    expect(achievementRate(m("decrease", 60, 30, 70))).toBe(0)
    expect(achievementRate(m("decrease", 60, 50, 0))).toBe(2)
  })

  it("is null while a value is missing", () => {
    expect(achievementRate(m("decrease", 60, 30, null))).toBeNull()
    expect(achievementRate(m("decrease", null, 30, 20))).toBeNull()
    expect(achievementRate(m("decrease", 60, null, 20))).toBeNull()
  })

  it("zero planned gain (target = baseline): 100 % when at least as good, else 0 %", () => {
    expect(achievementRate(m("decrease", 10, 10, 9))).toBe(1)
    expect(achievementRate(m("decrease", 10, 10, 10))).toBe(1)
    expect(achievementRate(m("decrease", 10, 10, 11))).toBe(0)
    expect(achievementRate(m("increase", 10, 10, 12))).toBe(1)
    expect(achievementRate(m("increase", 10, 10, 8))).toBe(0)
  })
})

describe("isWorsened / targetContradictsDirection", () => {
  it("flags a result worse than the baseline in the chosen direction", () => {
    expect(isWorsened(m("decrease", 10, 5, 12))).toBe(true)
    expect(isWorsened(m("increase", 10, 15, 8))).toBe(true)
    expect(isWorsened(m("decrease", 10, 5, 10))).toBe(false)
    expect(isWorsened(m("decrease", null, 5, 10))).toBe(false)
  })

  it("flags a target that is not an improvement", () => {
    expect(targetContradictsDirection("decrease", 10, 12)).toBe(true)
    expect(targetContradictsDirection("increase", 10, 8)).toBe(true)
    expect(targetContradictsDirection("decrease", 10, 8)).toBe(false)
    expect(targetContradictsDirection("decrease", 10, 10)).toBe(false)
    expect(targetContradictsDirection("decrease", null, 10)).toBe(false)
  })
})

describe("summarizeImprovements", () => {
  const item = (over: Partial<SummaryItem>): SummaryItem => ({
    kaizenStage: "measuring",
    annualEffectUsd: null,
    rollouts: [],
    ...m("decrease", null, null, null),
    ...over,
  })

  it("totals money, counts stages and rollout completion, skipping deferred items", () => {
    const s = summarizeImprovements([
      item({ kaizenStage: "standardized", annualEffectUsd: 100_000, rollouts: [{ status: "done" }, { status: "todo" }] }),
      item({ kaizenStage: "sustained", annualEffectUsd: 50_000, rollouts: [{ status: "done" }], ...m("decrease", 10, 5, 5) }),
      item({ kaizenStage: "deferred", annualEffectUsd: 999_999, rollouts: [{ status: "todo" }] }),
      item({ kaizenStage: "bogus" }),
    ])
    expect(s.totalAnnualEffectUsd).toBe(150_000)
    expect(s.countByStage).toEqual({ measuring: 1, standardized: 1, deploying: 0, sustained: 1, deferred: 1 })
    expect(s.standardizedCount).toBe(2)
    expect(s).toMatchObject({ rolloutTotal: 3, rolloutDone: 2, averageAchievement: 1, itemCount: 4 })
    expect(s.rolloutCompletion).toBeCloseTo(2 / 3)
  })

  it("totals the space reduction in m² (area only), skipping deferred items and float noise", () => {
    const s = summarizeImprovements([
      item({ kaizenStage: "standardized", spaceSavedM2: 0.1 }),
      item({ kaizenStage: "sustained", spaceSavedM2: 0.2 }),
      item({ kaizenStage: "measuring", spaceSavedM2: null }),
      item({ kaizenStage: "deferred", spaceSavedM2: 500 }),
    ])
    expect(s.totalSpaceSavedM2).toBe(0.3)
  })

  it("empty board: zeros and nulls", () => {
    const s = summarizeImprovements([])
    expect(s).toMatchObject({ totalAnnualEffectUsd: 0, totalSpaceSavedM2: 0, standardizedCount: 0, rolloutCompletion: null, averageAchievement: null, itemCount: 0 })
  })
})

describe("dates", () => {
  it("addMonthsUtc clamps to the last day of the month", () => {
    expect(addMonthsUtc(new Date("2026-01-31T00:00:00Z"), 1).toISOString()).toBe("2026-02-28T00:00:00.000Z")
    expect(addMonthsUtc(new Date("2026-11-30T00:00:00Z"), 3).toISOString()).toBe("2027-02-28T00:00:00.000Z")
    expect(addMonthsUtc(new Date("2026-10-02T00:00:00Z"), 1).toISOString()).toBe("2026-11-02T00:00:00.000Z")
  })

  it("isCheckDue: due on its day (local calendar) and after", () => {
    const now = new Date(2026, 9, 2, 8, 0)
    expect(isCheckDue("2026-10-02T00:00:00.000Z", now)).toBe(true)
    expect(isCheckDue("2026-10-01T00:00:00.000Z", now)).toBe(true)
    expect(isCheckDue("2026-10-03T00:00:00.000Z", now)).toBe(false)
  })
})
