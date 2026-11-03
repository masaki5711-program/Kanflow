import { describe, expect, it } from "vitest"
import { baseScheduleSchema, planBaseSchedule, type BaseSchedule } from "../base-schedule"

const dates = (s: BaseSchedule, start: string) => Object.fromEntries(planBaseSchedule(s, start).rows.map((r) => [r.key, [r.plannedStart, r.plannedEnd]]))

describe("notBeforeOffsetDays (plan 12 E5: a levelled proposal written as constraints)", () => {
  it("not_before_offset_places_leaf_not_earlier: the offset counts working days from the start", () => {
    const s: BaseSchedule = {
      skipWeekends: true,
      items: [
        { key: "a", name: "A", durationDays: 3 },
        { key: "b", name: "B", durationDays: 2, notBeforeOffsetDays: 4 },
      ],
    }
    // Start Mon 2026-11-02: a = Mon..Wed; b would follow on Thu, but offset 4 working days = Fri 11-06.
    expect(dates(s, "2026-11-02")).toMatchObject({ a: ["2026-11-02", "2026-11-04"], b: ["2026-11-06", "2026-11-09"] })
  })

  it("levelled parallel leaves stay parallel (offset 0 on both)", () => {
    const s: BaseSchedule = {
      items: [
        { key: "a", name: "A", durationDays: 3, notBeforeOffsetDays: 0 },
        { key: "b", name: "B", durationDays: 3, notBeforeOffsetDays: 0 },
      ],
    }
    expect(dates(s, "2026-11-02")).toMatchObject({ a: ["2026-11-02", "2026-11-04"], b: ["2026-11-02", "2026-11-04"] })
  })

  it("a dependency still wins over an earlier offset", () => {
    const s: BaseSchedule = {
      items: [
        { key: "a", name: "A", durationDays: 3 },
        { key: "b", name: "B", durationDays: 1, dependsOn: ["a"], notBeforeOffsetDays: 0 },
      ],
    }
    expect(dates(s, "2026-11-02").b).toEqual(["2026-11-05", "2026-11-05"])
  })

  it("an old schedule without offsets is placed exactly as before", () => {
    const s: BaseSchedule = { items: [{ key: "a", name: "A", durationDays: 2 }, { key: "b", name: "B", durationDays: 2 }] }
    expect(dates(s, "2026-11-02")).toMatchObject({ a: ["2026-11-02", "2026-11-03"], b: ["2026-11-04", "2026-11-05"] })
  })

  it("the schema takes a whole number of days 0..3650", () => {
    const ok = (n: unknown) => baseScheduleSchema.safeParse({ items: [{ key: "a", name: "A", notBeforeOffsetDays: n }] }).success
    expect(ok(0)).toBe(true)
    expect(ok(3650)).toBe(true)
    expect(ok(-1)).toBe(false)
    expect(ok(1.5)).toBe(false)
    expect(ok(3651)).toBe(false)
  })
})
