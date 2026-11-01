import { describe, expect, it } from "vitest"
import { baseScheduleSchema, planBaseSchedule, PlanScheduleError, type BaseSchedule, type BaseScheduleItem } from "../base-schedule"

const leaf = (key: string, durationDays?: number, extra: Partial<BaseScheduleItem> = {}): BaseScheduleItem => ({ key, name: key.toUpperCase(), durationDays, ...extra })
const code = (fn: () => unknown) => {
  try {
    fn()
  } catch (e) {
    return e instanceof PlanScheduleError ? e.code : "other"
  }
  return null
}

const SAMPLE: BaseSchedule = {
  items: [
    { key: "spec", name: "仕様", children: [leaf("req", 5), leaf("rfq", 3, { dependsOn: ["req"] })] },
    { key: "buy", name: "購入", children: [leaf("order", 2, { dependsOn: ["rfq"] }), leaf("deliver", 10, { dependsOn: ["order"] })] },
    leaf("accept", 1, { milestone: true, dependsOn: ["deliver"] }),
  ],
}

describe("planBaseSchedule", () => {
  it("places leaves from the start date following dependencies and derives parent spans", () => {
    const p = planBaseSchedule(SAMPLE, "2026-11-02")
    const by = Object.fromEntries(p.rows.map((r) => [r.key, r]))
    expect([by.req.plannedStart, by.req.plannedEnd]).toEqual(["2026-11-02", "2026-11-06"])
    expect([by.rfq.plannedStart, by.rfq.plannedEnd]).toEqual(["2026-11-07", "2026-11-09"])
    expect([by.order.plannedStart, by.order.plannedEnd]).toEqual(["2026-11-10", "2026-11-11"])
    expect([by.deliver.plannedStart, by.deliver.plannedEnd]).toEqual(["2026-11-12", "2026-11-21"])
    expect([by.accept.plannedStart, by.accept.plannedEnd]).toEqual(["2026-11-22", "2026-11-22"])
    expect([by.spec.plannedStart, by.spec.plannedEnd]).toEqual(["2026-11-02", "2026-11-09"])
    expect([p.plannedStart, p.plannedEnd]).toEqual(["2026-11-02", "2026-11-22"])
  })
  it("lists parents before children with parentKey and sibling positions", () => {
    const rows = planBaseSchedule(SAMPLE, "2026-11-02").rows
    expect(rows.map((r) => r.key)).toEqual(["spec", "req", "rfq", "buy", "order", "deliver", "accept"])
    expect(rows[2]).toMatchObject({ parentKey: "spec", siblingIndex: 1, depth: 2, dependsOn: ["req"] })
    expect(rows[6]).toMatchObject({ isMilestone: true, parentKey: null })
  })
  it("counts only weekdays with skipWeekends", () => {
    const p = planBaseSchedule({ ...SAMPLE, skipWeekends: true }, "2026-11-02") // Monday
    const req = p.rows.find((r) => r.key === "req")!
    expect([req.plannedStart, req.plannedEnd]).toEqual(["2026-11-02", "2026-11-06"])
    expect(p.rows.find((r) => r.key === "rfq")!.plannedStart).toBe("2026-11-09")
  })
  it("rejects an invalid start date", () => {
    expect(code(() => planBaseSchedule(SAMPLE, "2026-13-40"))).toBe("INVALID_DATE")
  })
  it("rejects a dependency cycle, an unknown key, a self link and an ancestor link", () => {
    const cyc = { items: [leaf("a", 1, { dependsOn: ["b"] }), leaf("b", 1, { dependsOn: ["a"] })] }
    expect(code(() => planBaseSchedule(cyc, "2026-11-02"))).toBe("PLAN_SCHEDULE_INVALID")
    expect(code(() => planBaseSchedule({ items: [leaf("a", 1, { dependsOn: ["zz"] })] }, "2026-11-02"))).toBe("PLAN_SCHEDULE_INVALID")
    expect(code(() => planBaseSchedule({ items: [leaf("a", 1, { dependsOn: ["a"] })] }, "2026-11-02"))).toBe("PLAN_SCHEDULE_INVALID")
    expect(code(() => planBaseSchedule({ items: [{ key: "p", name: "p", children: [leaf("c", 1, { dependsOn: ["p"] })] }] }, "2026-11-02"))).toBe("PLAN_SCHEDULE_INVALID")
  })
  it("rejects duplicate keys", () => {
    expect(code(() => planBaseSchedule({ items: [leaf("a", 1), leaf("a", 2)] }, "2026-11-02"))).toBe("PLAN_SCHEDULE_INVALID")
  })
  it("accepts exactly 500 items and rejects 501", () => {
    const many = (n: number): BaseSchedule => ({ items: Array.from({ length: n }, (_, i) => leaf(`k${i}`, 1)) })
    expect(planBaseSchedule(many(500), "2026-11-02").rows).toHaveLength(500)
    expect(code(() => planBaseSchedule(many(501), "2026-11-02"))).toBe("PLAN_SCHEDULE_TOO_LARGE")
    expect(baseScheduleSchema.safeParse(many(501)).success).toBe(false)
  })
  it("rejects nesting deeper than 5 levels", () => {
    const deep = (n: number): BaseScheduleItem => ({ key: `d${n}`, name: "x", children: n > 1 ? [deep(n - 1)] : undefined })
    expect(planBaseSchedule({ items: [deep(5)] }, "2026-11-02").rows).toHaveLength(5)
    expect(code(() => planBaseSchedule({ items: [deep(6)] }, "2026-11-02"))).toBe("PLAN_SCHEDULE_TOO_DEEP")
  })
})

describe("baseScheduleSchema", () => {
  it("validates keys, durations and names", () => {
    expect(baseScheduleSchema.safeParse(SAMPLE).success).toBe(true)
    expect(baseScheduleSchema.safeParse({ items: [{ key: "bad key", name: "x" }] }).success).toBe(false)
    expect(baseScheduleSchema.safeParse({ items: [{ key: "a", name: "x", durationDays: 0 }] }).success).toBe(false)
    expect(baseScheduleSchema.safeParse({ items: [] }).success).toBe(false)
  })
})
