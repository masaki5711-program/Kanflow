import { describe, expect, it } from "vitest"
import { planShift, slipDays, type ShiftNode } from "../plan-shift"

function node(id: string, start: string | null, end: string | null, extra: Partial<ShiftNode> = {}): ShiftNode {
  return { id, parentId: null, plannedStart: start, plannedEnd: end, actualStart: null, actualEnd: null, status: "not_started", ...extra }
}

describe("slipDays", () => {
  it("is actual end - planned end when the item finished", () => {
    expect(slipDays(node("a", "2026-11-02", "2026-11-06", { actualStart: "2026-11-02", actualEnd: "2026-11-10" }))).toBe(4)
    expect(slipDays(node("a", "2026-11-02", "2026-11-06", { actualEnd: "2026-11-05" }))).toBe(-1)
  })
  it("falls back to actual start - planned start while it is still running", () => {
    expect(slipDays(node("a", "2026-11-02", "2026-11-06", { actualStart: "2026-11-05" }))).toBe(3)
  })
  it("is null without an actual date or a planned counterpart", () => {
    expect(slipDays(node("a", "2026-11-02", "2026-11-06"))).toBeNull()
    expect(slipDays(node("a", null, null, { actualEnd: "2026-11-05" }))).toBeNull()
  })
})

describe("planShift", () => {
  const nodes = [
    node("A", "2026-11-02", "2026-11-06"),
    node("B", "2026-11-09", "2026-11-13"),
    node("C", "2026-11-16", "2026-11-20"),
    node("D", "2026-11-09", "2026-11-10"),
    node("X", "2026-10-01", "2026-10-05"),
  ]
  const deps = [
    { predecessorId: "A", successorId: "B" },
    { predecessorId: "B", successorId: "C" },
  ]

  it("dependents: moves the transitive successors only, by the delta", () => {
    const r = planShift(nodes, deps, "A", "dependents", 3)
    expect(r.moved.map((m) => [m.id, m.newStart, m.newEnd])).toEqual([
      ["B", "2026-11-12", "2026-11-16"],
      ["C", "2026-11-19", "2026-11-23"],
    ])
  })

  it("later: moves every dated item that starts after the source ends (not earlier ones)", () => {
    const r = planShift(nodes, deps, "A", "later", -2)
    expect(r.moved.map((m) => m.id).sort()).toEqual(["B", "C", "D"])
    expect(r.moved.find((m) => m.id === "B")).toMatchObject({ newStart: "2026-11-07", newEnd: "2026-11-11" })
  })

  it("never moves finished or started items, nor undated ones; reports why", () => {
    const list = [
      ...nodes.filter((n) => n.id !== "B" && n.id !== "C"),
      node("B", "2026-11-09", "2026-11-13", { actualStart: "2026-11-09" }),
      node("C", "2026-11-16", "2026-11-20", { status: "done" }),
      node("U", null, null),
    ]
    const r = planShift(list, [...deps, { predecessorId: "A", successorId: "U" }], "A", "dependents", 2)
    expect(r.moved).toEqual([])
    expect(r.skipped.map((s) => [s.id, s.reason]).sort()).toEqual([["B", "started"], ["C", "done"], ["U", "undated"]])
  })

  it("a successor that is a parent moves its leaf children; the parent itself is derived", () => {
    const tree = [
      node("A", "2026-11-02", "2026-11-06"),
      node("P", "2026-11-09", "2026-11-20"),
      node("P1", "2026-11-09", "2026-11-13", { parentId: "P" }),
      node("P2", "2026-11-16", "2026-11-20", { parentId: "P" }),
    ]
    const r = planShift(tree, [{ predecessorId: "A", successorId: "P" }], "A", "dependents", 1)
    expect(r.moved.map((m) => m.id)).toEqual(["P1", "P2"])
  })

  it("never moves the source's own subtree or ancestors; delta 0 moves nothing", () => {
    const tree = [
      node("P", "2026-11-02", "2026-11-20"),
      node("A", "2026-11-02", "2026-11-06", { parentId: "P" }),
      node("B", "2026-11-09", "2026-11-13", { parentId: "P" }),
    ]
    const r = planShift(tree, [], "A", "later", 2)
    expect(r.moved.map((m) => m.id)).toEqual(["B"])
    expect(planShift(tree, [], "A", "later", 0).moved).toEqual([])
  })
})
