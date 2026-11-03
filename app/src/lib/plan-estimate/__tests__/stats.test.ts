import { describe, expect, it } from "vitest"
import { addDays, dayNumber, referenceDateOf } from "../dates"
import { countBand, hiddenAggregate } from "../hidden"
import { ceilDays, effectiveN, trimmedMean, weightedMedian, weightedQuantile } from "../stats"
import { trigramSimilarity, trigrams } from "../trigram"

describe("stats", () => {
  it("weighted quantiles pick an input value by cumulative weight", () => {
    expect(weightedMedian([{ x: 3, w: 1 }, { x: 1, w: 1 }, { x: 2, w: 1 }])).toBe(2)
    expect(weightedMedian([{ x: 1, w: 1 }, { x: 10, w: 5 }])).toBe(10)
    expect(weightedQuantile([{ x: 1, w: 1 }, { x: 2, w: 1 }, { x: 3, w: 1 }, { x: 4, w: 1 }, { x: 5, w: 1 }], 0.8)).toBe(4)
    expect(() => weightedMedian([])).toThrow()
    expect(() => weightedQuantile([{ x: 1, w: 0 }], 0.5)).toThrow()
    expect(() => weightedQuantile([{ x: 1, w: 1 }], 1.5)).toThrow()
  })

  it("effective n, trimmed mean and the guarded ceil", () => {
    expect(effectiveN([1, 1, 1])).toBeCloseTo(3)
    expect(effectiveN([1, 0.01])).toBeLessThan(1.1)
    expect(effectiveN([])).toBe(0)
    expect(trimmedMean([1, 5, 2, 3])).toBe(2.5)
    expect(() => trimmedMean([1, 2])).toThrow()
    expect(ceilDays(10 * 1.1)).toBe(11)
    expect(ceilDays(10.2)).toBe(11)
  })
})

describe("hiddenAggregate", () => {
  const pt = (projectId: string, x: number, orderAt = "2026-01-01", w = 1) => ({ projectId, orderAt, x, w })
  it("needs 3 projects and an even h' of at least 4; one value per project", () => {
    expect(hiddenAggregate([pt("a", 1), pt("b", 2), pt("c", 3)], { minHiddenSources: 3 })).toBeNull()
    const agg = hiddenAggregate([pt("a", 1), pt("a", 3), pt("b", 4), pt("c", 6), pt("d", 9)], { minHiddenSources: 3 })
    expect(agg?.hPrime).toBe(4)
    expect(agg?.x).toBe((4 + 6) / 2)
    expect(agg?.w).toBe(2)
  })

  it("uses the oldest h' projects by first finalization", () => {
    const agg = hiddenAggregate([pt("new", 100, "2026-09-01"), pt("a", 1, "2026-01-01"), pt("b", 2, "2026-02-01"), pt("c", 3, "2026-03-01"), pt("d", 4, "2026-04-01")], { minHiddenSources: 3 })
    expect(agg?.projectIds).toEqual(["a", "b", "c", "d"])
  })

  it("count bands", () => {
    expect([countBand(0), countBand(3), countBand(4), countBand(9), countBand(10)]).toEqual(["~3", "~3", "4-9", "4-9", "10+"])
  })
})

describe("trigram similarity (pg_trgm compatible)", () => {
  it("matches pg_trgm's padding and set semantics", () => {
    expect([...trigrams("cat")].toSorted()).toEqual(["  c", " ca", "at ", "cat"])
    expect(trigramSimilarity("word", "word")).toBe(1)
    // pg_trgm: similarity('word', 'two words') = 0.36363636
    expect(trigramSimilarity("word", "two words")).toBeCloseTo(0.363636, 5)
    expect(trigramSimilarity("", "x")).toBe(0)
    expect(trigramSimilarity("据え付け工事", "据え付け")).toBeGreaterThan(0.3)
  })
})

describe("dates", () => {
  it("validates keys, adds working days, and cuts R to the month", () => {
    expect(() => dayNumber("2026-13-01")).toThrow()
    expect(() => dayNumber("x")).toThrow()
    expect(addDays("2026-11-06", 1, true)).toBe("2026-11-09")
    expect(addDays("2026-11-06", 1, false)).toBe("2026-11-07")
    expect(addDays("2026-11-06", 0, true)).toBe("2026-11-06")
    expect(referenceDateOf("2026-11-30")).toBe("2026-11-01")
  })
})
