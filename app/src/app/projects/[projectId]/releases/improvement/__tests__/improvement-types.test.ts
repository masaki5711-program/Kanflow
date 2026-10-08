import { describe, expect, it } from "vitest"
import { KAIZEN_STAGES } from "@/lib/improvement/constants"
import { groupByStage, invalidNumberFields, nextOpenCheck, parseNumberText, toForm, toPatch } from "../improvement-types"
import { improvement } from "./board-fixtures"

describe("improvement form helpers", () => {
  it("parses half- and full-width numbers with separators", () => {
    expect(parseNumberText("1,200.5")).toBe(1200.5)
    expect(parseNumberText("４５")).toBe(45)
    expect(parseNumberText("－３")).toBe(-3)
    expect(parseNumberText("")).toBeNull()
    expect(parseNumberText("12分")).toBeNaN()
  })

  it("money must be a whole, non-negative number", () => {
    const form = { ...toForm(improvement()), annualEffectUsd: "1.5", resultValue: "x" }
    expect(invalidNumberFields(form)).toEqual(["resultValue", "annualEffectUsd"])
  })

  it("space reduction may have decimals but not be negative", () => {
    const base = toForm(improvement())
    expect(invalidNumberFields({ ...base, spaceSavedM2: "12.5" })).toEqual([])
    expect(invalidNumberFields({ ...base, spaceSavedM2: "-1" })).toEqual(["spaceSavedM2"])
    expect(invalidNumberFields({ ...base, spaceSavedM2: "abc" })).toEqual(["spaceSavedM2"])
  })

  it("toPatch sends only the changed fields, converted for the API", () => {
    const saved = toForm(improvement({ manualLink: "https://a", baselineValue: 60 }))
    expect(toPatch(saved, saved)).toEqual({})
    expect(toPatch({ ...saved, resultValue: "45", metricName: "  ", manualLink: "" }, saved)).toEqual({ resultValue: 45, metricName: null, manualLink: null })
  })

  it("groups by stage (unknown → 効果確認中) and finds the next open check", () => {
    const groups = groupByStage([improvement({ id: "a", kaizenStage: "sustained" }), improvement({ id: "b", kaizenStage: "odd" })], KAIZEN_STAGES)
    expect(groups.get("sustained")?.map((i) => i.id)).toEqual(["a"])
    expect(groups.get("measuring")?.map((i) => i.id)).toEqual(["b"])
    const check = (id: string, dueDate: string, checkedAt: string | null = null) => ({ id, dueDate, kind: "custom", checkedAt, result: null, note: null, checkedByName: null, notifiedAt: null })
    expect(nextOpenCheck({ checks: [check("x", "2026-12-01"), check("y", "2026-11-01"), check("z", "2026-10-01", "2026-10-01")] })?.id).toBe("y")
  })
})
