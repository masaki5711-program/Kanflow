import { describe, expect, it } from "vitest"
import { level } from "../level"
import { levelItemsFromSchedule, WorkCalendar } from "../from-schedule"
import { planBaseSchedule } from "@/lib/plan-schedule/base-schedule"

describe("levelItemsFromSchedule", () => {
  it("a leaf without any dependency follows every earlier leaf (as loading places it): levelling never compresses the stage order", () => {
    const schedule = { items: [{ key: "a", name: "A", durationDays: 3 }, { key: "b", name: "B", durationDays: 2 }, { key: "c", name: "C", durationDays: 4, dependsOn: ["a"] }] }
    const items = levelItemsFromSchedule(schedule)
    expect(items.find((i) => i.key === "b")?.predecessors).toEqual(["a"])
    // c names its dependency: only that one (it may run beside b).
    expect(items.find((i) => i.key === "c")?.predecessors).toEqual(["a"])
    // No owners at all (no capacity limit): the levelled end is the end loading gives, not an earlier one.
    const r = level({ items, assign: {}, capacity: () => 1, parallelCap: () => 2 })
    const cal = new WorkCalendar("2026-11-02", false)
    expect(cal.keyOf(r.end)).toBe(planBaseSchedule(schedule, "2026-11-02").plannedEnd)
  })


  it("leaves only; dependencies on parents cover their leaves; roles inherit; milestones take no capacity", () => {
    const items = levelItemsFromSchedule({
      items: [
        { key: "spec", name: "仕様", role: "pm", children: [{ key: "req", name: "要求", durationDays: 3 }, { key: "rfq", name: "見積", durationDays: 2, load: 0.5, dependsOn: ["req"] }] },
        { key: "build", name: "製作", role: "dev", dependsOn: ["spec"], children: [{ key: "impl", name: "実装", durationDays: 5 }] },
        { key: "accept", name: "検収", milestone: true, dependsOn: ["build"] },
      ],
    })
    expect(items).toEqual([
      { key: "req", days: 3, load: 1, role: "pm", predecessors: [], order: 0 },
      { key: "rfq", days: 2, load: 0.5, role: "pm", predecessors: ["req"], order: 1 },
      { key: "impl", days: 5, load: 1, role: "dev", predecessors: ["req", "rfq"], order: 2 },
      { key: "accept", days: 1, load: 0, role: null, predecessors: ["impl"], order: 3 },
    ])
  })

  it("marks the items a split rule names", () => {
    const items = levelItemsFromSchedule({ items: [{ key: "a", name: "A", durationDays: 6 }] }, new Set(["a"]))
    expect(items[0].splittable).toBe(true)
  })
})

describe("WorkCalendar", () => {
  it("counts Monday–Friday from the first working day with skipWeekends", () => {
    const cal = new WorkCalendar("2026-11-07", true) // Saturday → Monday 11-09
    expect(cal.keyOf(0)).toBe("2026-11-09")
    expect(cal.keyOf(5)).toBe("2026-11-16")
    expect(cal.indexOf("2026-11-16")).toBe(5)
    expect(cal.indexOf("2026-11-14")).toBe(5) // a Saturday maps to the next working day
    expect(cal.indexOf("2026-11-06")).toBe(-1)
  })

  it("counts every day without skipWeekends", () => {
    const cal = new WorkCalendar("2026-11-07", false)
    expect(cal.keyOf(2)).toBe("2026-11-09")
    expect(cal.indexOf("2026-11-05")).toBe(-2)
  })
})
