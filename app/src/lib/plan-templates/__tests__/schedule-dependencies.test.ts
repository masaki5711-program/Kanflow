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
const dep = (predecessorId: string, successorId: string) => ({ predecessorId, successorId })

describe("scheduleFrom with dependencies", () => {
  it("starts a successor the day after its predecessor ends, beside the leaves placed in between", () => {
    const nodes = [n("a", { sortOrder: 1, durationDays: 5 }), n("b", { sortOrder: 2, durationDays: 3 }), n("c", { sortOrder: 3, durationDays: 2 })]
    expect(scheduleFrom(nodes, null, "2026-01-01", { dependencies: [dep("a", "c")] })).toEqual([
      { id: "a", plannedStart: "2026-01-01", plannedEnd: "2026-01-05" },
      { id: "b", plannedStart: "2026-01-06", plannedEnd: "2026-01-08" },
      // c waits for a only: it runs beside b.
      { id: "c", plannedStart: "2026-01-06", plannedEnd: "2026-01-07" },
    ])
  })

  it("waits for the latest of several predecessors", () => {
    const nodes = [n("a", { sortOrder: 1, durationDays: 2 }), n("b", { sortOrder: 2, durationDays: 6 }), n("c", { sortOrder: 3, durationDays: 1 })]
    const out = scheduleFrom(nodes, null, "2026-01-01", { dependencies: [dep("a", "c"), dep("b", "c")] })
    expect(out.find((o) => o.id === "c")).toEqual({ id: "c", plannedStart: "2026-01-09", plannedEnd: "2026-01-09" })
  })

  it("places a successor listed before its predecessor after it", () => {
    const nodes = [n("late", { sortOrder: 1, durationDays: 1 }), n("first", { sortOrder: 2, durationDays: 4 })]
    const out = scheduleFrom(nodes, null, "2026-01-01", { dependencies: [dep("first", "late")] })
    expect(out.find((o) => o.id === "first")).toEqual({ id: "first", plannedStart: "2026-01-01", plannedEnd: "2026-01-04" })
    expect(out.find((o) => o.id === "late")).toEqual({ id: "late", plannedStart: "2026-01-05", plannedEnd: "2026-01-05" })
  })

  it("treats a dependency on a parent as one on all of its leaves", () => {
    const nodes = [
      n("p", { sortOrder: 1 }),
      n("p1", { parentId: "p", sortOrder: 1, durationDays: 2 }),
      n("p2", { parentId: "p", sortOrder: 2, durationDays: 3 }),
      n("q", { sortOrder: 2 }),
      n("q1", { parentId: "q", sortOrder: 1, durationDays: 1 }),
    ]
    const out = scheduleFrom(nodes, null, "2026-01-01", { dependencies: [dep("p", "q")] })
    expect(out.find((o) => o.id === "q1")).toEqual({ id: "q1", plannedStart: "2026-01-06", plannedEnd: "2026-01-06" })
  })

  it("keeps the dated end of a predecessor that already has dates", () => {
    const nodes = [n("a", { sortOrder: 1, plannedStart: "2026-02-01", plannedEnd: "2026-02-10" }), n("b", { sortOrder: 2, durationDays: 2 })]
    const out = scheduleFrom(nodes, null, "2026-01-01", { dependencies: [dep("a", "b")] })
    expect(out).toEqual([{ id: "b", plannedStart: "2026-02-11", plannedEnd: "2026-02-12" }])
  })

  it("does not hang on a cycle and still dates every leaf", () => {
    const nodes = [n("a", { sortOrder: 1, durationDays: 1 }), n("b", { sortOrder: 2, durationDays: 1 })]
    const out = scheduleFrom(nodes, null, "2026-01-01", { dependencies: [dep("a", "b"), dep("b", "a")] })
    expect(out.map((o) => o.id).toSorted()).toEqual(["a", "b"])
  })

  it("is unchanged when no dependency is given", () => {
    const nodes = [n("a", { sortOrder: 1, durationDays: 3 }), n("b", { sortOrder: 2, durationDays: 2 })]
    expect(scheduleFrom(nodes, null, "2026-01-01", { dependencies: [] })).toEqual(scheduleFrom(nodes, null, "2026-01-01"))
  })
})

describe("scheduleFrom dependency edge cases", () => {
  it("never places a dependent leaf before the start date", () => {
    const nodes = [n("a", { sortOrder: 1, plannedStart: "2025-12-01", plannedEnd: "2025-12-05" }), n("b", { sortOrder: 2, durationDays: 1 })]
    expect(scheduleFrom(nodes, null, "2026-01-01", { dependencies: [dep("a", "b")] })).toEqual([{ id: "b", plannedStart: "2026-01-01", plannedEnd: "2026-01-01" }])
  })

  it("inside a cycle releases the leaf waiting for the fewest others, keeping valid dependencies of leaves outside it", () => {
    const nodes = [n("a", { sortOrder: 1, durationDays: 1 }), n("l", { sortOrder: 2, durationDays: 1 }), n("x", { sortOrder: 3, durationDays: 1 })]
    const out = scheduleFrom(nodes, null, "2026-01-01", { dependencies: [dep("l", "a"), dep("l", "x"), dep("x", "l")] })
    const start = (id: string) => out.find((o) => o.id === id)?.plannedStart as string
    expect(out).toHaveLength(3)
    expect(start("a") > start("l")).toBe(true)
  })
})
