import { describe, expect, it } from "vitest"
import type { BaseSchedule, BaseScheduleItem } from "@/lib/plan-schedule/base-schedule"
import { applyLessonRules } from "../apply"

const START = "2026-11-02"
const leaf = (key: string, durationDays?: number, extra: Partial<BaseScheduleItem> = {}): BaseScheduleItem => ({ key, name: key.toUpperCase(), durationDays, ...extra })

/** Same 10-leaf template as apply.test.ts (→ at most 2 added items). */
const TEMPLATE: BaseSchedule = {
  items: [
    { key: "spec", name: "仕様", children: [leaf("req", 5, { formerKeys: ["requirements"] }), leaf("rfq", 3, { dependsOn: ["req"] })] },
    { key: "buy", name: "購入", children: [leaf("order", 2, { dependsOn: ["rfq"], role: "procurement" }), leaf("deliver", 10, { dependsOn: ["order"], load: 0 })] },
    { key: "build", name: "製作", children: [leaf("assemble", 8, { dependsOn: ["deliver"], role: "mech" }), leaf("wire", 4, { dependsOn: ["assemble"] })] },
    leaf("test", 6, { dependsOn: ["wire"], role: "qa" }),
    leaf("docs", 3, { dependsOn: ["test"] }),
    leaf("train", 2, { dependsOn: ["docs"] }),
    leaf("accept", 1, { milestone: true, dependsOn: ["train"] }),
  ],
}

let seq = 0
const rule = (kind: string, params: object, extra: object = {}) => ({ id: `v${String(++seq).padStart(3, "0")}`, state: "confirmed", kind, params, ...extra })
const apply = (rules: unknown[], template: BaseSchedule = TEMPLATE) => applyLessonRules(template, rules, { startDate: START })
const reasons = (r: ReturnType<typeof apply>) => r.rejected.map((x) => x.reason)

function find(items: readonly BaseScheduleItem[], key: string): BaseScheduleItem | undefined {
  for (const item of items) {
    if (item.key === key) return item
    const hit = find(item.children ?? [], key)
    if (hit) return hit
  }
  return undefined
}
const chain = (n: number, prefix = "c"): BaseScheduleItem[] => Array.from({ length: n }, (_, i) => leaf(`${prefix}${i}`, 4, i > 0 ? { dependsOn: [`${prefix}${i - 1}`] } : {}))

describe("review fixes — prototype keys (H1/H2)", () => {
  const PROTO_KEYS = ["constructor", "toString", "valueOf", "hasOwnProperty"]

  it.each(PROTO_KEYS)("a rule naming a missing %s is rejected as unknown_key", (key) => {
    const result = apply([rule("scale_duration", { key, factor: 1.2 }), rule("add_buffer", { afterKey: key, days: 1 }), rule("split", { key, parts: 2 }), rule("add_dependency", { from: key, to: "docs" })])
    expect(result.applied).toEqual([])
    expect(reasons(result).sort()).toEqual(["unknown_key", "unknown_key", "unknown_key", "unknown_key"])
    expect(Object.hasOwn(result.scaleFactors, key)).toBe(false)
  })

  it("__proto__ as a rule target is rejected as invalid_params", () => {
    expect(reasons(apply([rule("scale_duration", { key: "__proto__", factor: 1.2 })]))).toEqual(["invalid_params"])
  })

  it.each(PROTO_KEYS)("%s as a real schedule key works for every kind", (key) => {
    const t: BaseSchedule = { items: [leaf(key, 8, { role: key }), ...chain(9, "z"), leaf("tail", 4, { dependsOn: [key] })] }
    const result = apply(
      [rule("split", { key, parts: 2 }), rule("add_buffer", { afterKey: key, days: 1 }), rule("scale_duration", { key, factor: 1.5 }), rule("scale_duration", { key, factor: 1.5 }), rule("cap_parallel", { role: key, max: 2 })],
      t
    )
    expect(result.rejected).toEqual([])
    expect(result.scaleFactors).toEqual({ [`${key}_p1`]: 2.25, [`${key}_p2`]: 2.25 })
    expect(result.derivedFrom[`${key}_p2`]).toBe(key)
    expect(Object.hasOwn(result.addedBy, `${key}_p2_buf1`)).toBe(true)
    expect(Object.hasOwn(result.constraints.capParallel, key)).toBe(true)
    expect(result.constraints.capParallel[key]).toBe(2)
    expect(find(result.schedule.items, "tail")?.dependsOn).toEqual([`${key}_p2_buf1`])
  })

  it("__proto__ as a real schedule key: other rules still work and nothing lands on a prototype", () => {
    const t: BaseSchedule = { items: [leaf("__proto__", 8), ...chain(9)] }
    const result = apply([rule("split", { key: "c0", parts: 2 })], t)
    expect(result.applied).toHaveLength(1)
    expect(Object.getPrototypeOf(result.derivedFrom)).toBe(Object.prototype)
    expect(Object.hasOwn(result.derivedFrom, "__proto__")).toBe(false)
  })
})

describe("review fixes — bounds (M2, L1, L5)", () => {
  it("M2: at most 30 add_dependency per proposal", () => {
    const t: BaseSchedule = { items: Array.from({ length: 40 }, (_, i) => leaf(`d${i}`, 1)) }
    const result = apply(
      Array.from({ length: 31 }, (_, i) => rule("add_dependency", { from: `d${i}`, to: `d${i + 1}` })),
      t
    )
    expect(result.applied).toHaveLength(30)
    expect(reasons(result)).toEqual(["too_many_dependencies"])
  })

  it("M2: a rule that moves the end later than the template span × 3.0 is rejected with end_date_bound", () => {
    // Siblings are placed one after another: 2 × 10 + 13 × 1 = 33 days, bound 99. Buffers of 30 + 30 give 93; a third 123.
    const t: BaseSchedule = { items: [leaf("a", 10), leaf("b", 10), ...Array.from({ length: 13 }, (_, i) => leaf(`p${i}`, 1))] }
    const result = apply([rule("add_buffer", { afterKey: "b", days: 30 }, { id: "x1" }), rule("add_buffer", { afterKey: "b", days: 30 }, { id: "x2" }), rule("add_buffer", { afterKey: "a", days: 30 }, { id: "x3" })], t)
    expect(result.applied).toEqual(["x1", "x2"])
    expect(result.rejected).toEqual([expect.objectContaining({ ruleId: "x3", reason: "end_date_bound" })])
  })

  it("L1: the stored product never exceeds 3.0 and accumulates without drift", () => {
    const r = apply([1.1, 1.1, 1.1, 3 / (1.1 * 1.1 * 1.1)].map((factor) => rule("scale_duration", { key: "test", factor })))
    expect(r.applied).toHaveLength(4)
    expect(r.scaleFactors.test).toBeLessThanOrEqual(3)
    expect(r.scaleFactors.test).toBeCloseTo(3, 9)
    expect(reasons(apply([rule("scale_duration", { key: "test", factor: 3 }), rule("scale_duration", { key: "test", factor: 1.0000001 })]))).toEqual(["scale_out_of_bounds"])
    expect(reasons(apply([rule("scale_duration", { key: "test", factor: 0.5 }), rule("scale_duration", { key: "test", factor: 0.9999999 })]))).toEqual(["scale_out_of_bounds"])
  })

  it("products exactly 0.5 and 0.5 × 2 × 0.5 are allowed; below 0.5 is not", () => {
    expect(apply([rule("scale_duration", { key: "test", factor: 0.5 })]).scaleFactors).toEqual({ test: 0.5 })
    const r = apply([0.5, 2, 0.5].map((factor) => rule("scale_duration", { key: "test", factor })))
    expect(r.scaleFactors).toEqual({ test: 0.5 })
    expect(r.rejected).toEqual([])
    expect(reasons(apply([rule("scale_duration", { key: "test", factor: 0.5 }), rule("scale_duration", { key: "test", factor: 0.99 })]))).toEqual(["scale_out_of_bounds"])
  })

  it("factors carry to split parts (scale runs after split, so the original key reaches every part)", () => {
    const r = apply([rule("scale_duration", { key: "assemble", factor: 0.8 }), rule("split", { key: "assemble", parts: 2 })])
    expect(r.scaleFactors).toEqual({ assemble_p1: 0.8, assemble_p2: 0.8 })
  })

  it("L5: a template too small for any addition says so", () => {
    expect(reasons(apply([rule("add_buffer", { afterKey: "a", days: 1 })], { items: [leaf("a", 4), leaf("b", 4)] }))).toEqual(["template_too_small_to_add"])
  })

  it.each([
    [9, 1],
    [14, 2],
    [149, 29],
    [150, 30],
    [160, 30],
  ])("20%% cap: %i leaves allow %i additions (milestones count as leaves, parents never)", (n, allowed) => {
    const t: BaseSchedule = { items: [{ key: "phase", name: "P", children: Array.from({ length: n - 1 }, (_, i) => leaf(`x${i}`, 1)) }, leaf("ms", 1, { milestone: true })] }
    const result = apply(
      Array.from({ length: allowed + 1 }, (_, i) => rule("add_buffer", { afterKey: `x${i}`, days: 1 })),
      t
    )
    expect(result.applied).toHaveLength(allowed)
    expect(reasons(result)).toEqual(["too_many_added_items"])
  })
})

describe("review fixes — split bookkeeping (M3, L3)", () => {
  it("M3: a buffer key never reuses a name a split consumed", () => {
    const t: BaseSchedule = { items: [leaf("b", 4), leaf("b_buf1", 8), ...chain(13)] }
    const res = apply([rule("split", { key: "b_buf1", parts: 2 }), rule("add_buffer", { afterKey: "b", days: 1 })], t)
    expect(res.rejected).toEqual([])
    expect(find(res.schedule.items, "b_buf1")).toBeUndefined()
    expect(find(res.schedule.items, "b_buf2")).toMatchObject({ dependsOn: ["b"] })
  })

  it("M3: a former key consumed by a split stays taken for buffer keys", () => {
    const t: BaseSchedule = { items: [leaf("b", 4), leaf("q", 8, { formerKeys: ["b_buf1"] }), ...chain(13)] }
    const res = apply([rule("split", { key: "q", parts: 2 }), rule("add_buffer", { afterKey: "b", days: 1 })], t)
    expect(res.rejected).toEqual([])
    expect(find(res.schedule.items, "b_buf2")).toBeDefined()
  })

  it("L3: splitting an already split key is rejected as already_split", () => {
    const result = apply([rule("split", { key: "assemble", parts: 2 }, { id: "s1" }), rule("split", { key: "assemble", parts: 2 }, { id: "s2" })])
    expect(result.rejected).toEqual([expect.objectContaining({ ruleId: "s2", reason: "already_split" })])
  })

  it("a part can be split again and the original key then reaches all pieces", () => {
    const t: BaseSchedule = { items: [leaf("big", 12), ...chain(20)] }
    const result = apply([rule("split", { key: "big", parts: 2 }, { id: "s1" }), rule("split", { key: "big_p1", parts: 2 }, { id: "s2" }), rule("scale_duration", { key: "big", factor: 1.2 })], t)
    expect(result.rejected).toEqual([])
    expect(Object.keys(result.scaleFactors).sort()).toEqual(["big_p1_p1", "big_p1_p2", "big_p2"])
    expect(result.derivedFrom.big_p1_p2).toBe("big")
  })

  it("a rejected split leaves no partial derivedFrom / addedBy / scaleFactors", () => {
    const result = apply([rule("split", { key: "wire", parts: 3 })])
    expect([result.derivedFrom, result.addedBy, result.scaleFactors]).toEqual([{}, {}, {}])
  })

  it("former keys reach split parts for add_buffer; add_dependency on a former key follows a later split", () => {
    const result = apply([rule("split", { key: "req", parts: 2 }), rule("add_buffer", { afterKey: "requirements", days: 1 })])
    expect(find(result.schedule.items, "req_p2_buf1")).toMatchObject({ dependsOn: ["req_p2"] })
    expect(find(result.schedule.items, "rfq")?.dependsOn).toEqual(["req_p2_buf1"])
    const dep = apply([rule("add_dependency", { from: "requirements", to: "docs" }), rule("split", { key: "req", parts: 2 })])
    expect(find(dep.schedule.items, "docs")?.dependsOn).toEqual(["test", "req_p2"])
  })
})

describe("review fixes — duplicates and dependency gaps (L2, test gaps)", () => {
  it("L2: a second rule with the same id is rejected as duplicate_id", () => {
    const result = apply([rule("scale_duration", { key: "test", factor: 1.2 }, { id: "same" }), rule("add_buffer", { afterKey: "docs", days: 1 }, { id: "same" })])
    expect(result.applied).toEqual(["same"])
    expect(result.rejected).toEqual([expect.objectContaining({ ruleId: "same", kind: "add_buffer", reason: "duplicate_id" })])
  })

  it("cycle via split rewiring is rejected (a part's successor may not precede it)", () => {
    // Dependencies run before splits, so the attempt on a part happens in a follow-up proposal on the split schedule.
    const first = apply([rule("split", { key: "assemble", parts: 2 })])
    expect(reasons(apply([rule("add_dependency", { from: "wire", to: "assemble_p1" })], first.schedule))).toEqual(["cycle"])
  })

  it("self and ancestor dependencies are rejected", () => {
    expect(reasons(apply([rule("add_dependency", { from: "build", to: "build" })]))).toEqual(["self"])
    expect(reasons(apply([rule("add_dependency", { from: "assemble", to: "build" })]))).toEqual(["hierarchy"])
  })

  it("a cycle through a prerequisite's inherited predecessors is rejected", () => {
    // jig inherits deliver (→ order → ...), so order depending on jig closes deliver → jig → order → deliver.
    const result = apply([rule("add_prerequisite", { beforeKey: "assemble", newKey: "jig", name: "治具", durationDays: 1 }), rule("add_dependency", { from: "jig", to: "order" })])
    expect(result.applied).toHaveLength(1)
    expect(reasons(result)).toEqual(["cycle"])
  })

  it("a cycle named through a former key is rejected", () => {
    expect(reasons(apply([rule("add_dependency", { from: "docs", to: "requirements" })]))).toEqual(["cycle"])
  })

  it("ordering matters: add_prerequisite runs before add_dependency (swapping them would leave the key unknown)", () => {
    const dep = rule("add_dependency", { from: "jig", to: "docs" }, { id: "a" })
    const pre = rule("add_prerequisite", { beforeKey: "assemble", newKey: "jig", name: "治具", durationDays: 1 }, { id: "b" })
    const result = apply([dep, pre])
    expect(result.applied).toEqual(["b", "a"])
    expect(find(result.schedule.items, "docs")?.dependsOn).toEqual(["test", "jig"])
  })

  it("cap_parallel returns a plain role → max record", () => {
    expect(apply([rule("cap_parallel", { role: "qa", max: 4 })]).constraints).toEqual({ capParallel: { qa: 4 } })
  })
})
