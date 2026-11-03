import { describe, expect, it } from "vitest"
import { planBaseSchedule, PlanScheduleError, type BaseSchedule, type BaseScheduleItem } from "@/lib/plan-schedule/base-schedule"
import { applyLessonRules } from "../apply"

const START = "2026-11-02"
const leaf = (key: string, durationDays?: number, extra: Partial<BaseScheduleItem> = {}): BaseScheduleItem => ({ key, name: key.toUpperCase(), durationDays, ...extra })

/** 10 leaves → at most 2 added items (20 %). */
const TEMPLATE: BaseSchedule = {
  items: [
    { key: "spec", name: "仕様", children: [leaf("req", 5, { formerKeys: ["requirements"] }), leaf("rfq", 3, { dependsOn: ["req"] })] },
    {
      key: "buy",
      name: "購入",
      children: [leaf("order", 2, { dependsOn: ["rfq"], role: "procurement" }), leaf("deliver", 10, { dependsOn: ["order"], load: 0 })],
    },
    { key: "build", name: "製作", children: [leaf("assemble", 8, { dependsOn: ["deliver"], role: "mech" }), leaf("wire", 4, { dependsOn: ["assemble"] })] },
    leaf("test", 6, { dependsOn: ["wire"], role: "qa" }),
    leaf("docs", 3, { dependsOn: ["test"] }),
    leaf("train", 2, { dependsOn: ["docs"] }),
    leaf("accept", 1, { milestone: true, dependsOn: ["train"] }),
  ],
}

/** 50 leaves in a chain → at most 10 added items. */
const BIG: BaseSchedule = { items: Array.from({ length: 50 }, (_, i) => leaf(`k${i}`, 4, i > 0 ? { dependsOn: [`k${i - 1}`] } : {})) }
/** 200 leaves → the 30-item cap binds before 20 % (40). */
const HUGE: BaseSchedule = { items: Array.from({ length: 200 }, (_, i) => leaf(`h${i}`, 2)) }

let seq = 0
const rule = (kind: string, params: object, extra: object = {}) => ({ id: `r${String(++seq).padStart(3, "0")}`, state: "confirmed", kind, params, ...extra })
const apply = (rules: unknown[], template: BaseSchedule = TEMPLATE) => applyLessonRules(template, rules, { startDate: START })

function find(items: readonly BaseScheduleItem[], key: string): BaseScheduleItem | undefined {
  for (const item of items) {
    if (item.key === key) return item
    const hit = find(item.children ?? [], key)
    if (hit) return hit
  }
  return undefined
}
const keysOf = (items: readonly BaseScheduleItem[]): string[] => items.flatMap((i) => [i.key, ...keysOf(i.children ?? [])])

describe("applyLessonRules — plan 12 §3.4", () => {
  it("draft_rule_never_changes_plan", () => {
    const drafts = [
      rule("scale_duration", { key: "test", factor: 2 }, { state: "draft" }),
      rule("add_buffer", { afterKey: "deliver", days: 5 }, { state: "retired" }),
      rule("split", { key: "assemble", parts: 2 }, { state: "draft" }),
    ]
    const result = apply(drafts)
    expect(result.schedule).toEqual(TEMPLATE)
    expect(result.applied).toEqual([])
    expect(result.rejected).toEqual([])
    expect(result.scaleFactors).toEqual({})
  })

  it("rule_creating_cycle_is_rejected_with_reason", () => {
    const cyc = rule("add_dependency", { from: "test", to: "req" })
    const result = apply([cyc])
    expect(result.applied).toEqual([])
    expect(result.rejected).toEqual([expect.objectContaining({ ruleId: cyc.id, kind: "add_dependency", reason: "cycle" })])
    expect(result.schedule).toEqual(TEMPLATE)
  })

  it("added_items_capped (20 % of the template's leaves)", () => {
    const rules = [rule("add_buffer", { afterKey: "deliver", days: 3 }), rule("add_buffer", { afterKey: "test", days: 2 }), rule("add_buffer", { afterKey: "docs", days: 1 })]
    const result = apply(rules)
    expect(result.applied).toEqual([rules[0].id, rules[1].id])
    expect(result.rejected).toEqual([expect.objectContaining({ ruleId: rules[2].id, reason: "too_many_added_items" })])
  })

  it("added_items_capped (at most 30 even when 20 % is more)", () => {
    const rules = Array.from({ length: 31 }, (_, i) => rule("add_buffer", { afterKey: `h${i}`, days: 1 }))
    const result = apply(rules, HUGE)
    expect(result.applied).toHaveLength(30)
    expect(result.rejected).toEqual([expect.objectContaining({ reason: "too_many_added_items" })])
  })

  it("added_items_capped counts split parts beyond the first", () => {
    const result = apply([rule("split", { key: "assemble", parts: 3 }), rule("add_buffer", { afterKey: "test", days: 2 })])
    expect(result.applied).toHaveLength(1)
    expect(result.rejected[0]).toMatchObject({ kind: "add_buffer", reason: "too_many_added_items" })
  })

  it("scale_product_bounded", () => {
    const a = rule("scale_duration", { key: "test", factor: 2 })
    const b = rule("scale_duration", { key: "test", factor: 1.5 })
    const c = rule("scale_duration", { key: "test", factor: 1.1 })
    const result = apply([a, b, c])
    expect(result.applied).toEqual([a.id, b.id])
    expect(result.scaleFactors).toEqual({ test: 3 })
    expect(result.rejected).toEqual([expect.objectContaining({ ruleId: c.id, reason: "scale_out_of_bounds" })])
    const low = apply([rule("scale_duration", { key: "test", factor: 0.6 }), rule("scale_duration", { key: "test", factor: 0.6 })])
    expect(low.scaleFactors).toEqual({ test: 0.6 })
    expect(low.rejected[0].reason).toBe("scale_out_of_bounds")
  })

  it("scale_duration records the factor and leaves durationDays unchanged (E2 multiplies it into r50)", () => {
    const result = apply([rule("scale_duration", { key: "test", factor: 1.5 })])
    expect(find(result.schedule.items, "test")?.durationDays).toBe(6)
    expect(result.scaleFactors).toEqual({ test: 1.5 })
  })

  it("rules_apply_in_fixed_order", () => {
    // Given in reverse order: the buffer goes after the LAST split part and the scale reaches every part.
    const scale = rule("scale_duration", { key: "assemble", factor: 1.2 }, { id: "a-scale" })
    const buffer = rule("add_buffer", { afterKey: "assemble", days: 2 }, { id: "b-buffer" })
    const sp = rule("split", { key: "assemble", parts: 2 }, { id: "c-split" })
    const result = apply([scale, buffer, sp])
    expect(result.applied).toEqual(["c-split", "b-buffer", "a-scale"])
    const build = find(result.schedule.items, "build")
    expect(build?.children?.map((c) => c.key)).toEqual(["assemble_p1", "assemble_p2", "assemble_p2_buf1", "wire"])
    expect(result.scaleFactors).toEqual({ assemble_p1: 1.2, assemble_p2: 1.2 })
  })

  it("rules_apply_in_fixed_order: same kind sorted by id, regardless of input order", () => {
    const z = rule("add_buffer", { afterKey: "k5", days: 1 }, { id: "z" })
    const a = rule("add_buffer", { afterKey: "k5", days: 2 }, { id: "a" })
    const result = apply([z, a], BIG)
    expect(result.applied).toEqual(["a", "z"])
    // a goes in first (k5_buf1, 2 days), z then sits between k5 and k5_buf1.
    expect(find(result.schedule.items, "k5_buf1")).toMatchObject({ durationDays: 2, dependsOn: ["k5_buf2"] })
    expect(find(result.schedule.items, "k5_buf2")).toMatchObject({ durationDays: 1, dependsOn: ["k5"] })
  })

  it("same input, same output; the input is not mutated", () => {
    const rules = [rule("split", { key: "test", parts: 3 }), rule("add_prerequisite", { beforeKey: "assemble", newKey: "jig", name: "治具の確認", durationDays: 2 })]
    const before = structuredClone(TEMPLATE)
    const rulesBefore = structuredClone(rules)
    const one = apply(rules)
    const two = apply(rules)
    expect(one).toEqual(two)
    expect(TEMPLATE).toEqual(before)
    expect(rules).toEqual(rulesBefore)
    expect(one.schedule).not.toBe(TEMPLATE)
  })

  it("throws PlanScheduleError when the template itself does not load", () => {
    const broken: BaseSchedule = { items: [leaf("a", 1, { dependsOn: ["missing"] })] }
    expect(() => applyLessonRules(broken, [], { startDate: START })).toThrow(PlanScheduleError)
  })
})

describe("add_prerequisite", () => {
  it("inserts a sibling right before the item, inheriting its predecessors; the item then depends on it", () => {
    const r = rule("add_prerequisite", { beforeKey: "assemble", newKey: "jig", name: "治具の確認", durationDays: 2, role: "mech", load: 0.5 })
    const result = apply([r])
    expect(result.applied).toEqual([r.id])
    expect(find(result.schedule.items, "build")?.children?.map((c) => c.key)).toEqual(["jig", "assemble", "wire"])
    expect(find(result.schedule.items, "jig")).toEqual({ key: "jig", name: "治具の確認", durationDays: 2, dependsOn: ["deliver"], role: "mech", load: 0.5 })
    expect(find(result.schedule.items, "assemble")?.dependsOn).toEqual(["deliver", "jig"])
    expect(result.addedBy).toEqual({ jig: r.id })
    const rows = Object.fromEntries(planBaseSchedule(result.schedule, START).rows.map((row) => [row.key, row]))
    expect(rows.assemble.plannedStart > rows.jig.plannedEnd).toBe(true)
  })

  it("works without predecessors and accepts a former key", () => {
    const result = apply([rule("add_prerequisite", { beforeKey: "requirements", newKey: "kickoff", name: "キックオフ", durationDays: 1 })])
    expect(find(result.schedule.items, "kickoff")).toEqual({ key: "kickoff", name: "キックオフ", durationDays: 1 })
    expect(find(result.schedule.items, "req")?.dependsOn).toEqual(["kickoff"])
  })

  it("refuses a new key already in use (including a former key)", () => {
    expect(apply([rule("add_prerequisite", { beforeKey: "test", newKey: "docs", name: "x", durationDays: 1 })]).rejected[0].reason).toBe("key_conflict")
    expect(apply([rule("add_prerequisite", { beforeKey: "test", newKey: "requirements", name: "x", durationDays: 1 })]).rejected[0].reason).toBe("key_conflict")
  })

  it("refuses an unknown target", () => {
    expect(apply([rule("add_prerequisite", { beforeKey: "nope", newKey: "x", name: "x", durationDays: 1 })]).rejected[0].reason).toBe("unknown_key")
  })
})

describe("add_dependency", () => {
  it("adds a finish-to-start dependency", () => {
    const result = apply([rule("add_dependency", { from: "order", to: "docs" })])
    expect(find(result.schedule.items, "docs")?.dependsOn).toEqual(["test", "order"])
  })

  it.each([
    ["self", { from: "test", to: "test" }],
    ["hierarchy", { from: "build", to: "wire" }],
    ["existing", { from: "wire", to: "test" }],
    ["unknown_key", { from: "nope", to: "test" }],
  ])("refuses %s", (reason, params) => {
    expect(apply([rule("add_dependency", params)]).rejected[0].reason).toBe(reason)
  })

  it("maps former keys to current keys", () => {
    const result = apply([rule("add_dependency", { from: "requirements", to: "docs" })])
    expect(find(result.schedule.items, "docs")?.dependsOn).toEqual(["test", "req"])
  })
})

describe("split", () => {
  it("turns a leaf into a chain of parts and rewires predecessors and successors", () => {
    const r = rule("split", { key: "assemble", parts: 3 })
    const result = apply([r])
    const build = find(result.schedule.items, "build")
    expect(build?.children?.map((c) => [c.key, c.durationDays, c.dependsOn])).toEqual([
      ["assemble_p1", 3, ["deliver"]],
      ["assemble_p2", 3, ["assemble_p1"]],
      ["assemble_p3", 2, ["assemble_p2"]],
      ["wire", 4, ["assemble_p3"]],
    ])
    expect(find(result.schedule.items, "assemble_p2")).toMatchObject({ name: "ASSEMBLE (2/3)", role: "mech" })
    expect(result.derivedFrom).toEqual({ assemble_p1: "assemble", assemble_p2: "assemble", assemble_p3: "assemble" })
    expect(result.addedBy).toEqual({ assemble_p2: r.id, assemble_p3: r.id })
  })

  it("drops the former keys of the split leaf but later rules can still name it by them", () => {
    const result = apply([rule("split", { key: "req", parts: 2 }), rule("scale_duration", { key: "requirements", factor: 1.5 })])
    expect(find(result.schedule.items, "req_p1")?.formerKeys).toBeUndefined()
    expect(find(result.schedule.items, "rfq")?.dependsOn).toEqual(["req_p2"])
    expect(result.scaleFactors).toEqual({ req_p1: 1.5, req_p2: 1.5 })
  })

  it("refuses too few days per part, a parent, a milestone and an unknown key", () => {
    expect(apply([rule("split", { key: "wire", parts: 3 })]).rejected[0].reason).toBe("split_too_short")
    expect(apply([rule("split", { key: "build", parts: 2 })]).rejected[0].reason).toBe("not_a_leaf")
    expect(apply([rule("split", { key: "accept", parts: 2 })]).rejected[0].reason).toBe("milestone")
    expect(apply([rule("split", { key: "gone", parts: 2 })]).rejected[0].reason).toBe("unknown_key")
  })

  it("treats a missing duration as one day", () => {
    const t: BaseSchedule = { items: Array.from({ length: 10 }, (_, i) => leaf(`n${i}`)) }
    expect(apply([rule("split", { key: "n0", parts: 2 })], t).rejected[0].reason).toBe("split_too_short")
  })

  it("refuses part keys that collide with existing keys", () => {
    const t: BaseSchedule = { items: [leaf("a", 10), leaf("a_p2", 1), ...Array.from({ length: 8 }, (_, i) => leaf(`x${i}`, 1))] }
    expect(apply([rule("split", { key: "a", parts: 2 })], t).rejected[0].reason).toBe("key_conflict")
  })

  it("shortens long keys so the part keys fit 40 characters", () => {
    const long = "k".repeat(40)
    const t: BaseSchedule = { items: [leaf(long, 10), ...Array.from({ length: 9 }, (_, i) => leaf(`x${i}`, 1))] }
    const result = apply([rule("split", { key: long, parts: 2 })], t)
    expect(result.applied).toHaveLength(1)
    expect(keysOf(result.schedule.items).filter((k) => k.endsWith("_p1") || k.endsWith("_p2")).every((k) => k.length === 40)).toBe(true)
  })

  it("redirects dependencies on the split leaf held by items in another branch of the tree", () => {
    const result = apply([rule("split", { key: "deliver", parts: 2 })])
    expect(find(result.schedule.items, "assemble")?.dependsOn).toEqual(["deliver_p2"])
    expect(find(result.schedule.items, "deliver_p1")).toMatchObject({ durationDays: 5, dependsOn: ["order"], load: 0 })
  })
})

describe("add_buffer", () => {
  it("inserts a load-0 leaf after the item and moves its successors onto the buffer", () => {
    const r = rule("add_buffer", { afterKey: "deliver", days: 5 })
    const result = apply([r])
    expect(find(result.schedule.items, "buy")?.children?.map((c) => c.key)).toEqual(["order", "deliver", "deliver_buf1"])
    expect(find(result.schedule.items, "deliver_buf1")).toEqual({ key: "deliver_buf1", name: "バッファ: DELIVER", durationDays: 5, dependsOn: ["deliver"], load: 0 })
    expect(find(result.schedule.items, "assemble")?.dependsOn).toEqual(["deliver_buf1"])
    expect(result.addedBy).toEqual({ deliver_buf1: r.id })
  })

  it("can follow a parent and uses custom names", () => {
    const result = applyLessonRules(TEMPLATE, [rule("add_buffer", { afterKey: "build", days: 2 })], { startDate: START, bufferName: (n) => `Buffer ${n}` })
    expect(result.schedule.items.map((i) => i.key)).toEqual(["spec", "buy", "build", "build_buf1", "test", "docs", "train", "accept"])
    expect(find(result.schedule.items, "build_buf1")?.name).toBe("Buffer 製作")
  })

  it("refuses an unknown key", () => {
    expect(apply([rule("add_buffer", { afterKey: "nope", days: 2 })]).rejected[0].reason).toBe("unknown_key")
  })
})

describe("scale_duration", () => {
  it("refuses a parent, a milestone and an unknown key", () => {
    expect(apply([rule("scale_duration", { key: "build", factor: 1.2 })]).rejected[0].reason).toBe("not_a_leaf")
    expect(apply([rule("scale_duration", { key: "accept", factor: 1.2 })]).rejected[0].reason).toBe("milestone")
    expect(apply([rule("scale_duration", { key: "nope", factor: 1.2 })]).rejected[0].reason).toBe("unknown_key")
  })
})

describe("cap_parallel", () => {
  it("does not change the tree and keeps the smaller cap per role", () => {
    const result = apply([rule("cap_parallel", { role: "qa", max: 3 }), rule("cap_parallel", { role: "qa", max: 2 }), rule("cap_parallel", { role: "mech", max: 1 })])
    expect(result.schedule).toEqual(TEMPLATE)
    expect(result.constraints.capParallel).toEqual({ qa: 2, mech: 1 })
    expect(result.applied).toHaveLength(3)
  })
})

describe("validation and invalid input", () => {
  it("rejects a confirmed rule with invalid params as invalid_params and keeps going", () => {
    const bad = { id: "bad", state: "confirmed", kind: "scale_duration", params: { key: "test", factor: 9 } }
    const good = rule("scale_duration", { key: "docs", factor: 1.2 })
    const result = apply([bad, good, null, { state: "confirmed", kind: "nope" }])
    expect(result.applied).toEqual([good.id])
    expect(result.rejected.map((r) => [r.ruleId, r.reason])).toEqual([
      ["bad", "invalid_params"],
      ["", "invalid_params"],
    ])
  })

  it("rejects a rule that would push the schedule past 5 levels", () => {
    const deep: BaseSchedule = {
      items: [
        { key: "l1", name: "1", children: [{ key: "l2", name: "2", children: [{ key: "l3", name: "3", children: [{ key: "l4", name: "4", children: [leaf("l5", 10)] }] }] }] },
        ...Array.from({ length: 9 }, (_, i) => leaf(`x${i}`, 1)),
      ],
    }
    // Siblings stay at the same depth, so a split at level 5 is fine.
    expect(apply([rule("split", { key: "l5", parts: 2 })], deep).applied).toHaveLength(1)
  })

  it("rejects a rule that would exceed 500 items with schedule_too_large", () => {
    const full: BaseSchedule = { items: Array.from({ length: 500 }, (_, i) => leaf(`f${i}`, 4)) }
    expect(apply([rule("add_buffer", { afterKey: "f0", days: 1 })], full).rejected[0].reason).toBe("schedule_too_large")
  })

  it("rejects a rule that would give an item more than 50 dependencies", () => {
    const fan: BaseSchedule = { items: [...Array.from({ length: 50 }, (_, i) => leaf(`s${i}`, 1)), leaf("sink", 1, { dependsOn: Array.from({ length: 50 }, (_, i) => `s${i}`) }), leaf("extra", 1)] }
    expect(apply([rule("add_dependency", { from: "extra", to: "sink" })], fan).rejected[0].reason).toBe("schedule_invalid")
  })

  it("a rejected rule keeps the schedule from before it for the next rules", () => {
    const cyc = rule("add_dependency", { from: "train", to: "req" })
    const ok = rule("add_dependency", { from: "order", to: "docs" })
    const result = apply([cyc, ok])
    expect(result.rejected.map((r) => r.ruleId)).toEqual([cyc.id])
    expect(find(result.schedule.items, "req")?.dependsOn).toBeUndefined()
    expect(find(result.schedule.items, "docs")?.dependsOn).toEqual(["test", "order"])
  })
})
