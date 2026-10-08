import { describe, expect, it } from "vitest"
import { createCheckSchema, recordCheckSchema, updateImprovementSchema, updateRolloutSchema } from "../improvements.schemas"

describe("updateImprovementSchema", () => {
  it("accepts a full effect update", () => {
    const parsed = updateImprovementSchema.parse({
      metricCategory: "time",
      metricName: "段取り時間",
      metricUnit: "分",
      direction: "decrease",
      baselineValue: 60,
      targetValue: 30,
      resultValue: 32.5,
      annualEffectUsd: 1_200_000,
      kaizenStage: "measuring",
      releaseDate: "2026-10-01",
      standardizedAt: "",
    })
    expect(parsed.resultValue).toBe(32.5)
  })

  it.each([
    ["non-finite number", { baselineValue: Number.POSITIVE_INFINITY }],
    ["NaN", { targetValue: Number.NaN }],
    ["unit over 20 chars", { metricUnit: "x".repeat(21) }],
    ["negative money", { annualEffectUsd: -1 }],
    ["fractional money", { annualEffectUsd: 1.5 }],
    ["negative space", { spaceSavedM2: -0.5 }],
    ["absurd space", { spaceSavedM2: 1e12 }],
    ["unknown category", { metricCategory: "speed" }],
    ["unknown stage", { kaizenStage: "done" }],
    ["unknown direction", { direction: "up" }],
    ["bad day", { releaseDate: "10/01/2026" }],
    ["string number", { resultValue: "12" }],
  ])("rejects %s", (_name, input) => {
    expect(updateImprovementSchema.safeParse(input).success).toBe(false)
  })

  it("space reduction takes decimals in m²", () => {
    expect(updateImprovementSchema.parse({ spaceSavedM2: 12.75 })).toEqual({ spaceSavedM2: 12.75 })
    expect(updateImprovementSchema.parse({ spaceSavedM2: null })).toEqual({ spaceSavedM2: null })
  })

  it("null clears values", () => {
    expect(updateImprovementSchema.parse({ baselineValue: null, metricCategory: null, annualEffectUsd: null })).toEqual({ baselineValue: null, metricCategory: null, annualEffectUsd: null })
  })
})

describe("children schemas", () => {
  it("rollout update needs a change; check result is sustained / regressed / null", () => {
    expect(updateRolloutSchema.safeParse({}).success).toBe(false)
    expect(updateRolloutSchema.safeParse({ status: "doing" }).success).toBe(true)
    expect(updateRolloutSchema.safeParse({ status: "finished" }).success).toBe(false)
    expect(recordCheckSchema.safeParse({ result: null }).success).toBe(true)
    expect(recordCheckSchema.safeParse({ result: "ok" }).success).toBe(false)
    expect(createCheckSchema.safeParse({ dueDate: "2026-13-45" }).success).toBe(false)
    expect(createCheckSchema.safeParse({ dueDate: "2026-12-01" }).success).toBe(true)
  })
})
