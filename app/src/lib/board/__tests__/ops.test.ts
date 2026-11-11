import { describe, expect, it } from "vitest"
import { applyPatch, commit, initialState, undo, EMPTY_DOC } from "../doc"
import { resolveLine, type ElementMap } from "../geometry"
import { BOARD_LIMITS } from "../limits"
import { elementDataProblem, elementToData, type BoxElement, type LineElement } from "../model"
import {
  copyElements,
  deletePatch,
  lineEndPatch,
  movePatch,
  newBox,
  newBoxRect,
  newLine,
  nextZ,
  pastePatch,
  reorderPatch,
  resizePatch,
  stylePatch,
  textPatch,
  DEFAULT_BOX_SIZE,
} from "../ops"

function box(id: string, x: number, y: number, extra: Partial<BoxElement> = {}): BoxElement {
  return { id, type: "rect", x, y, w: 100, h: 100, z: 1, text: "", fill: "white", stroke: "ink", ...extra }
}

function arrow(id: string, start: LineElement["start"], end: LineElement["end"], z = 5): LineElement {
  return { id, type: "arrow", z, start, end, stroke: "ink" }
}

function map(...els: Array<BoxElement | LineElement>): ElementMap {
  return Object.fromEntries(els.map((el) => [el.id, el]))
}

function sequence(prefix: string) {
  let n = 0
  return () => `${prefix}-${String(++n).padStart(4, "0")}`
}

describe("create", () => {
  it("makes a box of each type with its default style, rounded to whole units", () => {
    const rect = newBox("rect", { x: 10.4, y: 20.6, w: 99.5, h: 40.2 }, "new-0001", 3)
    expect(rect).toEqual({ id: "new-0001", type: "rect", x: 10, y: 21, w: 100, h: 40, z: 3, text: "", fill: "white", stroke: "ink" })
    expect(newBox("sticky", { x: 0, y: 0, w: 10, h: 10 }, "new-0002", 1).fill).toBe("amber")
    expect(newBox("text", { x: 0, y: 0, w: 10, h: 10 }, "new-0003", 1).fill).toBe("none")
    expect(newBox("ellipse", { x: 0, y: 0, w: 10, h: 10 }, "new-0004", 1, { fill: "sky", stroke: "red" })).toMatchObject({ fill: "sky", stroke: "red" })
  })

  it("everything it creates passes the server's schema", () => {
    const b = newBox("rect", { x: 9e9, y: -9e9, w: 9e9, h: 0 }, "new-0001", 1)
    expect(elementDataProblem(elementToData(b))).toBeNull()
    expect(b.x).toBe(BOARD_LIMITS.coordinate)
    expect(b.w).toBe(BOARD_LIMITS.boxSize)
    expect(b.h).toBe(1)
    const l = newLine("arrow", { point: { x: 0.2, y: 0.7 }, attach: null }, { point: { x: 5, y: 5 }, attach: "box-000001" }, "new-0002", 2)
    expect(l).toEqual({ id: "new-0002", type: "arrow", z: 2, start: { x: 0, y: 1 }, end: { x: 5, y: 5, attach: "box-000001" }, stroke: "ink" })
    expect(elementDataProblem(elementToData(l))).toBeNull()
  })

  it("a click places the default size, a drag the dragged area", () => {
    expect(newBoxRect("sticky", { x: 10, y: 10 }, { x: 11, y: 12 })).toEqual({ x: 10, y: 10, ...DEFAULT_BOX_SIZE.sticky })
    expect(newBoxRect("rect", { x: 100, y: 100 }, { x: 40, y: 20 })).toEqual({ x: 40, y: 20, w: 60, h: 80 })
  })

  it("nextZ is above everything drawn", () => {
    expect(nextZ({})).toBe(1)
    expect(nextZ(map(box("a", 0, 0, { z: 7 }), box("b", 0, 0, { z: 3 })))).toBe(8)
  })
})

describe("move", () => {
  it("moves boxes and free lines", () => {
    const els = map(box("a", 10, 10), arrow("l", { x: 0, y: 0 }, { x: 50, y: 50 }))
    const patch = movePatch(els, ["a", "l"], 5, -3)
    expect(patch.a).toMatchObject({ x: 15, y: 7 })
    expect(patch.l).toMatchObject({ start: { x: 5, y: -3 }, end: { x: 55, y: 47 } })
  })

  it("moving a box does not change the arrow attached to it: the arrow follows by itself", () => {
    const els = map(box("a", 0, 0), arrow("l", { x: 50, y: 50, attach: "a" }, { x: 400, y: 50 }))
    const patch = movePatch(els, ["a"], 0, 200)
    expect(Object.keys(patch)).toEqual(["a"])
    const after = applyPatch({ elements: els, versions: {} }, patch).doc.elements
    expect(resolveLine(after.l as LineElement, after).a.y).toBeGreaterThan(200)
  })

  it("a selected line keeps the end attached to a box that is not moving", () => {
    const els = map(box("a", 0, 0), arrow("l", { x: 50, y: 50, attach: "a" }, { x: 400, y: 50 }))
    const patch = movePatch(els, ["l"], 10, 10)
    expect(patch.l).toMatchObject({ start: { x: 50, y: 50, attach: "a" }, end: { x: 410, y: 60 } })
  })

  it("no distance, no patch", () => {
    expect(movePatch(map(box("a", 0, 0)), ["a"], 0, 0)).toEqual({})
  })
})

describe("resize and line ends", () => {
  it("resizes a box by a handle", () => {
    const patch = resizePatch(map(box("a", 0, 0)), "a", "se", 50, -20)
    expect(patch.a).toMatchObject({ x: 0, y: 0, w: 150, h: 80 })
    expect(resizePatch(map(arrow("l", { x: 0, y: 0 }, { x: 1, y: 1 })), "l", "se", 5, 5)).toEqual({})
  })

  it("attaches a line end to a box and detaches it again", () => {
    const els = map(box("a", 0, 0), arrow("l", { x: 300, y: 300 }, { x: 400, y: 400 }))
    const attached = lineEndPatch(els, "l", "start", { x: 50, y: 50 }, "a")
    expect(attached.l).toMatchObject({ start: { x: 50, y: 50, attach: "a" } })
    const free = lineEndPatch({ ...els, l: attached.l as LineElement }, "l", "start", { x: 500, y: 0 }, null)
    expect((free.l as LineElement).start).toEqual({ x: 500, y: 0 })
  })

  it("does not attach to something that is not a box", () => {
    const els = map(arrow("l", { x: 0, y: 0 }, { x: 1, y: 1 }), arrow("m", { x: 0, y: 0 }, { x: 1, y: 1 }))
    expect((lineEndPatch(els, "l", "end", { x: 9, y: 9 }, "m").l as LineElement).end).toEqual({ x: 9, y: 9 })
    expect((lineEndPatch(els, "l", "end", { x: 9, y: 9 }, "l").l as LineElement).end).toEqual({ x: 9, y: 9 })
  })
})

describe("delete", () => {
  it("detaches the arrows of a deleted box where they were drawn; undo re-attaches them", () => {
    const els = map(box("a", 0, 0), box("b", 300, 0), arrow("l", { x: 0, y: 0, attach: "a" }, { x: 0, y: 0, attach: "b" }))
    const patch = deletePatch(els, ["a"])
    expect(patch.a).toBeNull()
    expect(patch.l).toMatchObject({ start: { x: 100, y: 50 }, end: { x: 0, y: 0, attach: "b" } })
    expect((patch.l as LineElement).start.attach).toBeUndefined()

    let state = initialState({ elements: els, versions: { a: 1, b: 1, l: 1 } })
    state = commit(state, patch)
    expect(state.doc.elements.a).toBeUndefined()
    state = undo(state)
    expect(state.doc.elements).toEqual(els)
  })

  it("deleting the arrow with its box needs no detaching", () => {
    const els = map(box("a", 0, 0), arrow("l", { x: 0, y: 0, attach: "a" }, { x: 500, y: 0 }))
    expect(deletePatch(els, ["a", "l"])).toEqual({ a: null, l: null })
  })

  it("ignores ids that are not there", () => {
    expect(deletePatch(map(box("a", 0, 0)), ["zzz"])).toEqual({})
  })
})

describe("copy / paste / duplicate", () => {
  it("pastes copies with new ids on top, shifted, attached to each other", () => {
    const els = map(box("a", 0, 0, { z: 1 }), box("b", 300, 0, { z: 2 }), arrow("l", { x: 0, y: 0, attach: "a" }, { x: 0, y: 0, attach: "b" }, 3))
    const clip = copyElements(els, ["l", "b", "a"])
    expect(clip.map((el) => el.id)).toEqual(["a", "b", "l"])

    const { patch, ids } = pastePatch(els, clip, sequence("copy"), { x: 16, y: 16 })
    expect(ids).toEqual(["copy-0001", "copy-0002", "copy-0003"])
    expect(patch["copy-0001"]).toMatchObject({ id: "copy-0001", type: "rect", x: 16, y: 16, z: 4 })
    expect(patch["copy-0002"]).toMatchObject({ x: 316, y: 16, z: 5 })
    expect(patch["copy-0003"]).toMatchObject({ z: 6, start: { attach: "copy-0001" }, end: { attach: "copy-0002" } })
    // The originals are untouched.
    expect(Object.keys(patch)).not.toContain("a")
  })

  it("a copied arrow whose box is not copied becomes free where it was drawn", () => {
    const els = map(box("a", 0, 0), arrow("l", { x: 0, y: 0, attach: "a" }, { x: 400, y: 50 }))
    const clip = copyElements(els, ["l"])
    expect(clip[0]).toMatchObject({ start: { x: 100, y: 50 }, end: { x: 400, y: 50 } })
    expect((clip[0] as LineElement).start.attach).toBeUndefined()
  })

  it("pasting twice from the same copy gives independent elements", () => {
    const els = map(box("a", 0, 0))
    const clip = copyElements(els, ["a"])
    const makeId = sequence("p")
    const first = pastePatch(els, clip, makeId, { x: 16, y: 16 })
    const second = pastePatch(applyPatch({ elements: els, versions: {} }, first.patch).doc.elements, clip, makeId, { x: 32, y: 32 })
    expect(first.ids).not.toEqual(second.ids)
    expect(second.patch[second.ids[0]]).toMatchObject({ x: 32, y: 32, z: 3 })
  })
})

describe("order, style, text", () => {
  const els = map(box("a", 0, 0, { z: 1 }), box("b", 0, 0, { z: 2 }), box("c", 0, 0, { z: 3 }))
  const order = (patch: ReturnType<typeof reorderPatch>) =>
    Object.values(applyPatch({ elements: els, versions: {} }, patch).doc.elements)
      .sort((x, y) => (x as BoxElement).z - (y as BoxElement).z)
      .map((el) => el.id)

  it("brings to the front and sends to the back, keeping the order among the selected", () => {
    expect(order(reorderPatch(els, ["a"], "front"))).toEqual(["b", "c", "a"])
    expect(order(reorderPatch(els, ["c"], "back"))).toEqual(["c", "a", "b"])
    expect(order(reorderPatch(els, ["a", "b"], "front"))).toEqual(["c", "a", "b"])
    expect(order(reorderPatch(els, ["b", "c"], "back"))).toEqual(["b", "c", "a"])
    expect(reorderPatch(els, ["a", "b", "c"], "front")).toEqual({})
    expect(reorderPatch(els, [], "front")).toEqual({})
  })

  it("sets fill on boxes and the outline on boxes and lines", () => {
    const mixed = map(box("a", 0, 0), arrow("l", { x: 0, y: 0 }, { x: 1, y: 1 }))
    const patch = stylePatch(mixed, ["a", "l"], { fill: "green", stroke: "red" })
    expect(patch.a).toMatchObject({ fill: "green", stroke: "red" })
    expect(patch.l).toMatchObject({ stroke: "red" })
    expect(patch.l).not.toHaveProperty("fill")
    expect(stylePatch(mixed, ["l"], { fill: "green" })).toEqual({})
  })

  it("sets the text of a box, cut at the limit", () => {
    expect(textPatch(els, "a", "hello").a).toMatchObject({ text: "hello" })
    const long = textPatch(els, "a", "x".repeat(BOARD_LIMITS.textLength + 10)).a as BoxElement
    expect(long.text).toHaveLength(BOARD_LIMITS.textLength)
    expect(textPatch(map(arrow("l", { x: 0, y: 0 }, { x: 1, y: 1 })), "l", "no")).toEqual({})
  })

  it("an operation on nothing known is an empty patch", () => {
    expect(applyPatch(EMPTY_DOC, movePatch({}, ["ghost"], 5, 5)).changed).toBe(false)
  })
})
