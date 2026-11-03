import { describe, expect, it } from "vitest"
import { scheduleFrom, type ScheduleNode } from "../schedule"

const n = (id: string, over: Partial<ScheduleNode> = {}): ScheduleNode => ({
  id,
  parentId: null,
  sortOrder: 1,
  isMilestone: false,
  durationDays: null,
  plannedStart: null,
  plannedEnd: null,
  ...over,
})

describe("scheduleFrom with notBefore (plan 12 E4)", () => {
  it("not_before_respected_by_server_recompute: a levelled start is never pulled earlier", () => {
    const nodes = [n("a", { sortOrder: 1, durationDays: 2 }), n("b", { sortOrder: 2, durationDays: 2 })]
    const out = scheduleFrom(nodes, null, "2026-11-02", { skipWeekends: true, notBefore: new Map([["a", "2026-11-04"]]) })
    // a would start Mon 11-02; levelling put it on Wed 11-04.
    expect(out.find((o) => o.id === "a")).toEqual({ id: "a", plannedStart: "2026-11-04", plannedEnd: "2026-11-05" })
    // The followers move with it (the cursor follows a's end).
    expect(out.find((o) => o.id === "b")?.plannedStart).toBe("2026-11-06")
  })

  it("a notBefore earlier than what the dependencies allow does not move a leaf earlier", () => {
    const nodes = [n("a", { sortOrder: 1, durationDays: 3 }), n("b", { sortOrder: 2, durationDays: 1 })]
    const out = scheduleFrom(nodes, null, "2026-11-02", { dependencies: [{ predecessorId: "a", successorId: "b" }], notBefore: new Map([["b", "2026-10-01"]]) })
    expect(out.find((o) => o.id === "b")?.plannedStart).toBe("2026-11-05")
  })

  it("independent leaves levelled in parallel stay parallel (they do not follow the cursor)", () => {
    const nodes = [n("a", { sortOrder: 1, durationDays: 3 }), n("b", { sortOrder: 2, durationDays: 3 }), n("c", { sortOrder: 3, durationDays: 1 })]
    const notBefore = new Map([
      ["a", "2026-11-02"],
      ["b", "2026-11-02"],
    ])
    const out = scheduleFrom(nodes, null, "2026-11-02", { skipWeekends: true, notBefore })
    expect(out.find((o) => o.id === "a")).toEqual({ id: "a", plannedStart: "2026-11-02", plannedEnd: "2026-11-04" })
    expect(out.find((o) => o.id === "b")).toEqual({ id: "b", plannedStart: "2026-11-02", plannedEnd: "2026-11-04" })
    // A leaf without a notBefore still follows the others.
    expect(out.find((o) => o.id === "c")?.plannedStart).toBe("2026-11-05")
  })

  it("a weekend notBefore moves to the next weekday when weekends are skipped", () => {
    const nodes = [n("a", { sortOrder: 1, durationDays: 1 })]
    expect(scheduleFrom(nodes, null, "2026-11-02", { skipWeekends: true, notBefore: new Map([["a", "2026-11-07"]]) })).toEqual([{ id: "a", plannedStart: "2026-11-09", plannedEnd: "2026-11-09" }])
  })

  it("ignores an invalid notBefore", () => {
    const nodes = [n("a", { sortOrder: 1, durationDays: 1 })]
    expect(scheduleFrom(nodes, null, "2026-11-02", { notBefore: new Map([["a", "2026-02-30"]]) })).toEqual([{ id: "a", plannedStart: "2026-11-02", plannedEnd: "2026-11-02" }])
  })
})
