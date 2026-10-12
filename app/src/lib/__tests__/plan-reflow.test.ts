import { describe, expect, it } from "vitest"
import { planReflow } from "../plan-reflow"
import type { ShiftNode } from "../plan-shift"

function node(id: string, start: string | null, end: string | null, extra: Partial<ShiftNode> = {}): ShiftNode {
  return { id, parentId: null, plannedStart: start, plannedEnd: end, actualStart: null, actualEnd: null, status: "not_started", ...extra }
}
const dep = (predecessorId: string, successorId: string) => ({ predecessorId, successorId })
const datesOf = (r: ReturnType<typeof planReflow>, id: string) => r.moved.find((m) => m.id === id)

describe("planReflow", () => {
  it("treats a same-day start as a violation and moves the successor to the next day", () => {
    const r = planReflow([node("P", "2026-11-02", "2026-11-06"), node("S", "2026-11-06", "2026-11-10")], [dep("P", "S")])
    expect(datesOf(r, "S")).toMatchObject({ newStart: "2026-11-07", newEnd: "2026-11-11" })
  })

  it("lands on the next business day when asked", () => {
    const r = planReflow([node("P", "2026-11-02", "2026-11-06"), node("S", "2026-11-06", "2026-11-10")], [dep("P", "S")], { businessDays: true })
    expect(datesOf(r, "S")).toMatchObject({ newStart: "2026-11-09", newEnd: "2026-11-13" })
  })

  it("leaves a successor that already starts after the predecessor ends", () => {
    const r = planReflow([node("P", "2026-11-02", "2026-11-06"), node("S", "2026-11-07", "2026-11-10")], [dep("P", "S")])
    expect(r).toEqual({ moved: [], skipped: [] })
  })

  it("cascades along a chain regardless of the dependency order", () => {
    const nodes = [node("A", "2026-11-02", "2026-11-04"), node("B", "2026-11-03", "2026-11-05"), node("C", "2026-11-04", "2026-11-06")]
    const r = planReflow(nodes, [dep("B", "C"), dep("A", "B")])
    expect(datesOf(r, "B")).toMatchObject({ newStart: "2026-11-05", newEnd: "2026-11-07" })
    expect(datesOf(r, "C")).toMatchObject({ newStart: "2026-11-08", newEnd: "2026-11-10" })
  })

  it("takes the larger shift when two predecessors constrain a leaf", () => {
    const nodes = [node("A", "2026-11-02", "2026-11-04"), node("B", "2026-11-02", "2026-11-10"), node("S", "2026-11-03", "2026-11-04")]
    const r = planReflow(nodes, [dep("A", "S"), dep("B", "S")])
    expect(datesOf(r, "S")).toMatchObject({ newStart: "2026-11-11", newEnd: "2026-11-12" })
  })

  it("uses the latest leaf end of a parent predecessor and moves a parent successor's leaves together", () => {
    const nodes = [
      node("P", "2026-11-02", "2026-11-09"),
      node("p1", "2026-11-02", "2026-11-03", { parentId: "P" }),
      node("p2", "2026-11-05", "2026-11-09", { parentId: "P" }),
      node("S", "2026-11-04", "2026-11-12"),
      node("s1", "2026-11-04", "2026-11-06", { parentId: "S" }),
      node("s2", "2026-11-10", "2026-11-12", { parentId: "S" }),
    ]
    const r = planReflow(nodes, [dep("P", "S")])
    expect(r.moved.map((m) => m.id)).toEqual(["s1", "s2"])
    expect(datesOf(r, "s1")).toMatchObject({ newStart: "2026-11-10", newEnd: "2026-11-12" })
    expect(datesOf(r, "s2")).toMatchObject({ newStart: "2026-11-16", newEnd: "2026-11-18" })
  })

  it("follows leaves of a predecessor parent that are moved by their own dependency", () => {
    const nodes = [
      node("X", "2026-11-02", "2026-11-10"),
      node("P", "2026-11-02", "2026-11-04"),
      node("p1", "2026-11-02", "2026-11-04", { parentId: "P" }),
      node("S", "2026-11-05", "2026-11-06"),
    ]
    const r = planReflow(nodes, [dep("P", "S"), dep("X", "p1")])
    expect(datesOf(r, "p1")).toMatchObject({ newStart: "2026-11-11", newEnd: "2026-11-13" })
    expect(datesOf(r, "S")).toMatchObject({ newStart: "2026-11-14", newEnd: "2026-11-15" })
  })

  it("never moves done or started leaves (reported) or undated leaves", () => {
    const nodes = [
      node("P", "2026-11-02", "2026-11-10"),
      node("d", "2026-11-03", "2026-11-04", { status: "done" }),
      node("s", "2026-11-03", "2026-11-04", { actualStart: "2026-11-03" }),
      node("u", null, null),
      node("m", "2026-11-03", "2026-11-03"),
    ]
    const r = planReflow(
      [...nodes.slice(0, 1), ...nodes.slice(1).map((n) => ({ ...n }))],
      ["d", "s", "u", "m"].map((id) => dep("P", id))
    )
    expect(r.moved).toEqual([{ id: "m", plannedStart: "2026-11-03", plannedEnd: "2026-11-03", newStart: "2026-11-11", newEnd: "2026-11-11" }])
    expect(r.skipped).toEqual([
      { id: "d", reason: "done" },
      { id: "s", reason: "started" },
    ])
  })

  it("ignores dependencies inside a cycle and self dependencies", () => {
    const nodes = [node("A", "2026-11-02", "2026-11-04"), node("B", "2026-11-02", "2026-11-04"), node("C", "2026-11-02", "2026-11-04")]
    expect(planReflow(nodes, [dep("A", "B"), dep("B", "A"), dep("C", "C")])).toEqual({ moved: [], skipped: [] })
  })

  it("does not change anything when the predecessor is undated", () => {
    expect(planReflow([node("P", null, null), node("S", "2026-11-02", "2026-11-03")], [dep("P", "S")]).moved).toEqual([])
  })

  it("ignores dependencies between a row and its own ancestor / descendant", () => {
    const nodes = [node("P", "2026-11-02", "2026-11-06"), node("c", "2026-11-02", "2026-11-06", { parentId: "P" })]
    expect(planReflow(nodes, [dep("P", "c"), dep("c", "P")])).toEqual({ moved: [], skipped: [] })
  })

  it("reports undated leaves only when their successor actually violates", () => {
    const nodes = [node("P", "2026-11-02", "2026-11-06"), node("S", "2026-11-10", "2026-11-12"), node("u", null, null, { parentId: "S" }), node("d", "2026-11-10", "2026-11-12", { parentId: "S" })]
    expect(planReflow(nodes, [dep("P", "S")]).skipped).toEqual([])
    const late = [node("P", "2026-11-02", "2026-11-12"), node("S", "2026-11-10", "2026-11-12"), node("u", null, null, { parentId: "S" }), node("d", "2026-11-10", "2026-11-12", { parentId: "S" })]
    expect(planReflow(late, [dep("P", "S")]).skipped).toEqual([{ id: "u", reason: "undated" }])
  })
})
