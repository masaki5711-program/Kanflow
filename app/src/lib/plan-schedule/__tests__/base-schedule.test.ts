import { describe, expect, it } from "vitest"
import { BASE_SCHEDULE_MAX_FORMER_KEYS, BASE_SCHEDULE_ROLE_MAX, baseScheduleSchema, keyAliases, planBaseSchedule, PlanScheduleError, type BaseSchedule, type BaseScheduleItem } from "../base-schedule"

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

describe("role / load / formerKeys (plan 12 E0)", () => {
  it("old_schedule_without_role_and_load_still_loads", () => {
    // A schedule.yml written before E0: no role, no load, no formerKeys anywhere.
    const parsed = baseScheduleSchema.parse(SAMPLE)
    expect(parsed).toEqual(SAMPLE) // nothing is injected (the stored content and its hash stay as given)
    expect(planBaseSchedule(parsed, "2026-11-02").rows).toHaveLength(7)
  })

  it("accepts role, load (0..1) and formerKeys within their limits", () => {
    const ok = { items: [leaf("a", 2, { role: "procurement", load: 0.5, formerKeys: ["old-a", "older_a"] }), leaf("b", 1, { load: 0 }), leaf("c", 1, { load: 1 })] }
    expect(baseScheduleSchema.safeParse(ok).success).toBe(true)
    expect(planBaseSchedule(ok, "2026-11-02").rows).toHaveLength(3)
  })

  it.each([
    ["load above 1", { load: 1.5 }],
    ["negative load", { load: -0.1 }],
    ["non-finite load", { load: Number.NaN }],
    ["role with spaces", { role: "lead engineer" }],
    ["role too long", { role: "r".repeat(BASE_SCHEDULE_ROLE_MAX + 1) }],
    ["bad former key", { formerKeys: ["bad key"] }],
    ["too many former keys", { formerKeys: Array.from({ length: BASE_SCHEDULE_MAX_FORMER_KEYS + 1 }, (_, i) => `f${i}`) }],
  ])("rejects %s", (_label, extra) => {
    expect(baseScheduleSchema.safeParse({ items: [leaf("a", 1, extra as Partial<BaseScheduleItem>)] }).success).toBe(false)
  })

  it("former_keys_map_to_current_key", () => {
    const s: BaseSchedule = {
      items: [{ key: "spec", name: "仕様", formerKeys: ["specification"], children: [leaf("req", 5, { formerKeys: ["requirements", "reqs"] })] }, leaf("accept", 1)],
    }
    const aliases = keyAliases(s)
    expect(aliases.get("requirements")).toBe("req")
    expect(aliases.get("reqs")).toBe("req")
    expect(aliases.get("specification")).toBe("spec")
    expect(aliases.get("req")).toBe("req") // a current key maps to itself
    expect(aliases.get("accept")).toBe("accept")
    expect(aliases.get("nope")).toBeUndefined()
    expect(planBaseSchedule(s, "2026-11-02").rows.map((r) => r.key)).toEqual(["spec", "req", "accept"])
  })

  it("former keys must not collide with a current key, another item's former key, or repeat", () => {
    const withCurrent = { items: [leaf("a", 1, { formerKeys: ["b"] }), leaf("b", 1)] }
    const withOther = { items: [leaf("a", 1, { formerKeys: ["x"] }), leaf("b", 1, { formerKeys: ["x"] })] }
    const repeated = { items: [leaf("a", 1, { formerKeys: ["x", "x"] })] }
    const ownKey = { items: [leaf("a", 1, { formerKeys: ["a"] })] }
    for (const s of [withCurrent, withOther, repeated, ownKey]) {
      expect(code(() => planBaseSchedule(s, "2026-11-02"))).toBe("PLAN_SCHEDULE_INVALID")
      expect(code(() => keyAliases(s))).toBe("PLAN_SCHEDULE_INVALID")
    }
  })

  it("a dependency may not name a former key (dependsOn uses current keys only)", () => {
    const s = { items: [leaf("a", 1, { formerKeys: ["old"] }), leaf("b", 1, { dependsOn: ["old"] })] }
    expect(code(() => planBaseSchedule(s, "2026-11-02"))).toBe("PLAN_SCHEDULE_INVALID")
  })
})
