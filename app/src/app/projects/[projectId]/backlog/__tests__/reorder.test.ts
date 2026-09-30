import { describe, expect, it } from "vitest"
import {
  applyVisibleMove,
  autoScrollDelta,
  dragReducer,
  insertionIndex,
  moveItem,
  previewIds,
  type DragSession,
} from "../reorder"
import { toggleSelection } from "../selection"

const IDS = ["a", "b", "c", "d"] as const

function picked(itemId = "b", mode: DragSession["mode"] = "keyboard"): DragSession {
  const s = dragReducer(null, { type: "pick", mode, section: "ready", itemId, ids: IDS })
  if (!s) throw new Error("not picked")
  return s
}

describe("moveItem", () => {
  it("moves without mutating and clamps the target", () => {
    const list = ["a", "b", "c"]
    expect(moveItem(list, 0, 2)).toEqual(["b", "c", "a"])
    expect(moveItem(list, 2, 0)).toEqual(["c", "a", "b"])
    expect(moveItem(list, 1, 99)).toEqual(["a", "c", "b"])
    expect(moveItem(list, 1, -5)).toEqual(["b", "a", "c"])
    expect(list).toEqual(["a", "b", "c"])
  })

  it("returns a copy for an unknown source index", () => {
    const list = ["a"]
    const out = moveItem(list, 3, 0)
    expect(out).toEqual(["a"])
    expect(out).not.toBe(list)
  })
})

describe("dragReducer", () => {
  it("picks an item at its current index", () => {
    expect(picked()).toEqual({ mode: "keyboard", section: "ready", itemId: "b", ids: IDS, from: 1, to: 1 })
  })

  it("ignores a pick of an item that is not in the list", () => {
    expect(dragReducer(null, { type: "pick", mode: "pointer", section: "ready", itemId: "zz", ids: IDS })).toBeNull()
  })

  it("moves by delta within bounds (keyboard ↑/↓)", () => {
    let s = picked()
    s = dragReducer(s, { type: "move", delta: 1 }) as DragSession
    s = dragReducer(s, { type: "move", delta: 1 }) as DragSession
    expect(s.to).toBe(3)
    expect((dragReducer(s, { type: "move", delta: 1 }) as DragSession).to).toBe(3)
    expect((dragReducer(picked("a"), { type: "move", delta: -1 }) as DragSession).to).toBe(0)
  })

  it("follows the pointer insertion index (clamped)", () => {
    const s = dragReducer(picked("a", "pointer"), { type: "over", index: 10 }) as DragSession
    expect(s.to).toBe(3)
    expect((dragReducer(s, { type: "over", index: 1 }) as DragSession).to).toBe(1)
  })

  it("drop and cancel end the session; actions without a session are no-ops", () => {
    expect(dragReducer(picked(), { type: "drop" })).toBeNull()
    expect(dragReducer(picked(), { type: "cancel" })).toBeNull()
    expect(dragReducer(null, { type: "move", delta: 1 })).toBeNull()
    expect(dragReducer(null, { type: "over", index: 1 })).toBeNull()
  })

  it("keeps the same state object when nothing changes", () => {
    const s = picked("a")
    expect(dragReducer(s, { type: "move", delta: -1 })).toBe(s)
    expect(dragReducer(s, { type: "over", index: 0 })).toBe(s)
  })

  it("previews the order while dragging", () => {
    const s = dragReducer(picked("a"), { type: "move", delta: 2 }) as DragSession
    expect(previewIds(s)).toEqual(["b", "c", "a", "d"])
  })
})

describe("applyVisibleMove", () => {
  const full = ["a", "b", "c", "d", "e"].map((id) => ({ id }))

  it("moves within the full list when nothing is hidden", () => {
    expect(applyVisibleMove(full, ["a", "b", "c", "d", "e"], "e", 0).map((i) => i.id)).toEqual(["e", "a", "b", "c", "d"])
  })

  it("keeps hidden items in their slots while a filter is active", () => {
    // visible: a, c, e (b, d hidden) — move e to the top of the visible list
    expect(applyVisibleMove(full, ["a", "c", "e"], "e", 0).map((i) => i.id)).toEqual(["e", "b", "a", "d", "c"])
    // swapping visible neighbours equals the old up/down behaviour
    expect(applyVisibleMove(full.slice(0, 3), ["a", "c"], "c", 0).map((i) => i.id)).toEqual(["c", "b", "a"])
  })

  it("returns a copy of the list for an unknown item", () => {
    const out = applyVisibleMove(full, ["a"], "zz", 0)
    expect(out.map((i) => i.id)).toEqual(["a", "b", "c", "d", "e"])
    expect(out).not.toBe(full)
  })
})

describe("insertionIndex", () => {
  it("counts the rows whose midpoint lies above the pointer", () => {
    const mids = [10, 30, 50]
    expect(insertionIndex(mids, 0)).toBe(0)
    expect(insertionIndex(mids, 20)).toBe(1)
    expect(insertionIndex(mids, 49)).toBe(2)
    expect(insertionIndex(mids, 200)).toBe(3)
  })
})

describe("autoScrollDelta", () => {
  it("scrolls up near the top, down near the bottom, faster closer to the edge", () => {
    expect(autoScrollDelta(400, 800)).toBe(0)
    expect(autoScrollDelta(0, 800)).toBeLessThan(autoScrollDelta(40, 800))
    expect(autoScrollDelta(40, 800)).toBeLessThan(0)
    expect(autoScrollDelta(790, 800)).toBeGreaterThan(autoScrollDelta(740, 800))
    expect(autoScrollDelta(740, 800)).toBeGreaterThan(0)
    expect(autoScrollDelta(-100, 800)).toBe(-20)
  })
})

describe("toggleSelection", () => {
  const order = ["a", "b", "c", "d", "e"]

  it("toggles a single item and moves the anchor", () => {
    const one = toggleSelection(new Set(), order, "b", null, false)
    expect([...one.selected]).toEqual(["b"])
    expect(one.anchor).toBe("b")
    const none = toggleSelection(one.selected, order, "b", "b", false)
    expect(none.selected.size).toBe(0)
  })

  it("shift-click selects the range from the anchor (either direction) and keeps the anchor", () => {
    const down = toggleSelection(new Set(["b"]), order, "d", "b", true)
    expect([...down.selected].sort()).toEqual(["b", "c", "d"])
    expect(down.anchor).toBe("b")
    const up = toggleSelection(new Set(["d"]), order, "a", "d", true)
    expect([...up.selected].sort()).toEqual(["a", "b", "c", "d"])
  })

  it("shift-click on a selected item deselects the range", () => {
    const out = toggleSelection(new Set(["a", "b", "c", "e"]), order, "c", "a", true)
    expect([...out.selected]).toEqual(["e"])
  })

  it("falls back to a single toggle when the anchor is gone, never mutating the input", () => {
    const input = new Set(["a"])
    const out = toggleSelection(input, order, "c", "zz", true)
    expect([...out.selected].sort()).toEqual(["a", "c"])
    expect([...input]).toEqual(["a"])
  })
})
