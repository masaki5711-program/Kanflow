import { describe, expect, it } from "vitest"
import {
  LONG_PRESS_MS,
  barKeyAction,
  gridKeyAction,
  pressEnd,
  pressMove,
  pressStart,
  pressTimer,
  shiftRange,
} from "../lib/interaction"
import {
  ancestorIds,
  applyUpdates,
  buildFlatTree,
  descendantIds,
  dropItem,
  filterVisibleIds,
  indentItem,
  moveSibling,
  outdentItem,
  parentIds,
} from "../lib/tree"
import { mkItem } from "./fixtures"

const items = [
  mkItem({ id: "A", sortOrder: 1 }),
  mkItem({ id: "A1", parentId: "A", sortOrder: 1 }),
  mkItem({ id: "A2", parentId: "A", sortOrder: 2 }),
  mkItem({ id: "B", sortOrder: 2 }),
  mkItem({ id: "M", sortOrder: 3, isMilestone: true }),
]
const ids = (rows: { item: { id: string } }[]) => rows.map((r) => r.item.id)

describe("tree", () => {
  it("flattens depth-first, honours collapsed and visible sets", () => {
    const rows = buildFlatTree(items, new Set())
    expect(ids(rows)).toEqual(["A", "A1", "A2", "B", "M"])
    expect(rows[1]).toMatchObject({ depth: 1, hasChildren: false })
    expect(rows[0].hasChildren).toBe(true)
    expect(ids(buildFlatTree(items, new Set(["A"])))).toEqual(["A", "B", "M"])
    expect(ids(buildFlatTree(items, new Set(), new Set(["A", "A2"])))).toEqual(["A", "A2"])
  })

  it("descendants, ancestors, parents and filter keep ancestors", () => {
    expect(descendantIds(items, "A")).toEqual(["A1", "A2"])
    expect(ancestorIds(items, "A2")).toEqual(["A"])
    expect(parentIds(items)).toEqual(new Set(["A"]))
    expect(filterVisibleIds(items, (i) => i.id === "A2")).toEqual(new Set(["A2", "A"]))
  })

  it("moveSibling renumbers the group; edges are no-ops", () => {
    expect(moveSibling(items, "A1", "down")).toEqual([
      { id: "A2", parentId: "A", sortOrder: 1 },
      { id: "A1", parentId: "A", sortOrder: 2 },
    ])
    expect(moveSibling(items, "A", "up")).toBeNull()
    expect(moveSibling(items, "M", "down")).toBeNull()
    expect(moveSibling(items, "zz", "down")).toBeNull()
  })

  it("indent under the previous sibling (not under a milestone); outdent next to the parent", () => {
    expect(indentItem(items, "A2")).toEqual([{ id: "A2", parentId: "A1", sortOrder: 1 }])
    expect(indentItem(items, "B")).toEqual([{ id: "B", parentId: "A", sortOrder: 3 }])
    expect(indentItem(items, "A")).toBeNull()
    expect(indentItem([...items, mkItem({ id: "Z", sortOrder: 4 })], "Z")).toBeNull()
    expect(outdentItem(items, "A1")).toEqual([
      { id: "A1", parentId: null, sortOrder: 2 },
      { id: "B", parentId: null, sortOrder: 3 },
      { id: "M", parentId: null, sortOrder: 4 },
    ])
    expect(outdentItem(items, "B")).toBeNull()
  })

  it("dropItem moves before/after a target and refuses its own subtree", () => {
    expect(dropItem(items, "M", "A", "before")).toEqual([
      { id: "M", parentId: null, sortOrder: 1 },
      { id: "A", parentId: null, sortOrder: 2 },
      { id: "B", parentId: null, sortOrder: 3 },
    ])
    expect(dropItem(items, "B", "A1", "after")).toEqual([{ id: "B", parentId: "A", sortOrder: 2 }, { id: "A2", parentId: "A", sortOrder: 3 }])
    expect(dropItem(items, "A", "A1", "after")).toBeNull()
    expect(dropItem(items, "A", "A", "after")).toBeNull()
    expect(dropItem(items, "A1", "A2", "before")).toBeNull()
  })

  it("applyUpdates returns new objects for changed rows only", () => {
    const next = applyUpdates(items, [{ id: "B", parentId: "A", sortOrder: 9 }])
    expect(next.find((i) => i.id === "B")).toMatchObject({ parentId: "A", sortOrder: 9 })
    expect(next[0]).toBe(items[0])
    expect(items[3].parentId).toBeNull()
  })
})

describe("keyboard contracts", () => {
  it("bar keys per kind", () => {
    expect(barKeyAction("Enter", false, "summary")).toEqual({ kind: "open" })
    expect(barKeyAction(" ", false, "leaf")).toEqual({ kind: "open" })
    expect(barKeyAction("ArrowRight", false, "leaf")).toEqual({ kind: "move", deltaDays: 1 })
    expect(barKeyAction("ArrowLeft", true, "leaf")).toEqual({ kind: "resize", deltaDays: -1 })
    expect(barKeyAction("ArrowLeft", true, "milestone")).toEqual({ kind: "move", deltaDays: -1 })
    expect(barKeyAction("ArrowLeft", false, "summary")).toBeNull()
    expect(barKeyAction("x", false, "leaf")).toBeNull()
  })

  it("shiftRange moves or resizes but never ends before the start", () => {
    expect(shiftRange("2026-10-01", "2026-10-03", "move", 2)).toEqual({ start: "2026-10-03", end: "2026-10-05" })
    expect(shiftRange("2026-10-01", "2026-10-03", "resize", -2)).toEqual({ start: "2026-10-01", end: "2026-10-01" })
    expect(shiftRange("2026-10-01", "2026-10-01", "resize", -1)).toBeNull()
  })

  it("grid keys: Alt+arrows reorder/indent, F2 rename, Enter open", () => {
    expect(gridKeyAction({ key: "ArrowUp", altKey: true })).toBe("moveUp")
    expect(gridKeyAction({ key: "ArrowDown", altKey: true })).toBe("moveDown")
    expect(gridKeyAction({ key: "ArrowRight", altKey: true })).toBe("indent")
    expect(gridKeyAction({ key: "ArrowLeft", altKey: true })).toBe("outdent")
    expect(gridKeyAction({ key: "x", altKey: true })).toBeNull()
    expect(gridKeyAction({ key: "F2", altKey: false })).toBe("rename")
    expect(gridKeyAction({ key: "Enter", altKey: false })).toBe("open")
    expect(gridKeyAction({ key: "Enter", altKey: false, shiftKey: true })).toBeNull()
    expect(gridKeyAction({ key: "ArrowUp", altKey: true, ctrlKey: true })).toBeNull()
    expect(gridKeyAction({ key: "a", altKey: false })).toBeNull()
  })
})

describe("press recognizer (long-press for touch)", () => {
  it("mouse: a small move stays a click, a larger one drags", () => {
    let s = pressStart(0, 0, 0, "mouse")
    s = pressMove(s, 2, 0, 10)
    expect(pressEnd(s)).toBe("click")
    s = pressMove(s, 10, 0, 20)
    expect(s.phase).toBe("dragging")
    expect(pressEnd(s)).toBe("drop")
    expect(pressTimer(s, 1000)).toBe(s)
  })

  it("touch: moving before 300ms cancels (the page scrolls)", () => {
    let s = pressStart(0, 0, 0, "touch")
    s = pressMove(s, 3, 0, 50)
    expect(s.phase).toBe("pending")
    s = pressMove(s, 30, 0, 100)
    expect(s.phase).toBe("cancelled")
    expect(pressEnd(s)).toBe("none")
    expect(pressMove(s, 40, 0, 400)).toBe(s)
  })

  it("touch: holding still for 300ms arms the drag; a quick tap is a click", () => {
    const s = pressStart(0, 0, 0, "touch")
    expect(pressTimer(s, LONG_PRESS_MS - 1).phase).toBe("pending")
    const armed = pressTimer(s, LONG_PRESS_MS)
    expect(armed.phase).toBe("dragging")
    expect(pressMove(s, 30, 0, LONG_PRESS_MS + 5).phase).toBe("dragging")
    expect(pressEnd(s)).toBe("click")
  })
})
