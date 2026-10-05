import { describe, expect, it, vi } from "vitest"

vi.mock("@/lib/prisma", () => ({ prisma: {} }))

const rules = await import("../plan.rules")
const { day } = await import("./plan-fixtures")

type Existing = import("../plan.rules").ExistingDates
const existing = (over: Partial<Existing> = {}): Existing => ({ plannedStart: null, plannedEnd: null, actualStart: null, actualEnd: null, isMilestone: false, ...over })

describe("plan.rules: undated items (日程未定)", () => {
  it("create: no dates = undated; exactly one date on a non-milestone = 400; a milestone takes either date", () => {
    expect(rules.resolveCreateDates({})).toEqual({ plannedStart: null, plannedEnd: null })
    expect(rules.resolveCreateDates({ plannedStart: null, plannedEnd: "" })).toEqual({ plannedStart: null, plannedEnd: null })
    expect(() => rules.resolveCreateDates({ plannedStart: "2026-01-01" })).toThrow(expect.objectContaining({ code: "PLAN_DATES_INCOMPLETE" }))
    expect(rules.resolveCreateDates({ plannedStart: "2026-01-05", isMilestone: true })).toEqual({ plannedStart: day("2026-01-05"), plannedEnd: day("2026-01-05") })
    expect(rules.resolveCreateDates({ isMilestone: true })).toEqual({ plannedStart: null, plannedEnd: null })
  })

  it("update: set both dates on an undated leaf, clear both, refuse a half-dated leaf", () => {
    expect(rules.buildPlanUpdate({ plannedStart: "2026-02-01", plannedEnd: "2026-02-03" }, existing(), false)).toEqual({
      plannedStart: day("2026-02-01"),
      plannedEnd: day("2026-02-03"),
    })
    expect(() => rules.buildPlanUpdate({ plannedStart: "2026-02-01" }, existing(), false)).toThrow(expect.objectContaining({ code: "PLAN_DATES_INCOMPLETE" }))
    const dated = existing({ plannedStart: day("2026-01-01"), plannedEnd: day("2026-01-10") })
    expect(rules.buildPlanUpdate({ plannedStart: null, plannedEnd: null }, dated, false)).toEqual({ plannedStart: null, plannedEnd: null })
    expect(() => rules.buildPlanUpdate({ plannedEnd: "" }, dated, false)).toThrow(expect.objectContaining({ code: "PLAN_DATES_INCOMPLETE" }))
  })

  it("update: start ≤ end is checked only when both are set", () => {
    expect(() => rules.buildPlanUpdate({ plannedStart: "2026-02-05", plannedEnd: "2026-02-01" }, existing(), false)).toThrow(expect.objectContaining({ code: "PLAN_INVALID_RANGE" }))
  })

  it("update: an undated milestone gets one day; clearing a milestone clears both", () => {
    expect(rules.buildPlanUpdate({ plannedEnd: "2026-03-03" }, existing({ isMilestone: true }), false)).toEqual({ plannedStart: day("2026-03-03"), plannedEnd: day("2026-03-03") })
    const ms = existing({ isMilestone: true, plannedStart: day("2026-03-03"), plannedEnd: day("2026-03-03") })
    expect(rules.buildPlanUpdate({ plannedStart: null, plannedEnd: null }, ms, false)).toEqual({ plannedStart: null, plannedEnd: null })
    expect(rules.buildPlanUpdate({ name: "x" }, existing({ isMilestone: true }), false)).toEqual({ name: "x" })
  })

  it("update: a parent with an undated (derived) span accepts the same null as a no-op and refuses a date", () => {
    expect(rules.buildPlanUpdate({ plannedStart: null, plannedEnd: null }, existing(), true)).toEqual({})
    expect(() => rules.buildPlanUpdate({ plannedStart: "2026-01-01", plannedEnd: "2026-01-02" }, existing(), true)).toThrow(
      expect.objectContaining({ code: "PLAN_PARENT_DATES_DERIVED" }),
    )
  })

  it("update: durationDays passes through", () => {
    expect(rules.buildPlanUpdate({ durationDays: 12 }, existing(), false)).toEqual({ durationDays: 12 })
    expect(rules.buildPlanUpdate({ durationDays: null }, existing(), false)).toEqual({ durationDays: null })
  })
})
