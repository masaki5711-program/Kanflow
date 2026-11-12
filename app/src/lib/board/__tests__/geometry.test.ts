import { describe, expect, it } from "vitest"
import {
  anchorPoint,
  anchorsOf,
  nearestAnchor,
  hitsElement,
  rotationOf,
  boundsOf,
  boxAt,
  distanceToSegment,
  elementBounds,
  elementsInRect,
  facingSide,
  hitBoxHandle,
  hitLineHandle,
  hitTest,
  lineGeometry,
  nearestSide,
  rectFromPoints,
  resizeRect,
  resolveLine,
  sidePoint,
  snapTarget,
  sortByZ,
  type ElementMap,
} from "../geometry"
import type { BoxElement, LineElement } from "../model"
import { fitViewport, panBy, stepZoom, toScreen, toSheet, wheelZoom, zoomAt, MAX_ZOOM, MIN_ZOOM } from "../viewport"

function box(id: string, x: number, y: number, w: number, h: number, extra: Partial<BoxElement> = {}): BoxElement {
  return { id, type: "rect", x, y, w, h, z: 1, text: "", fill: "white", stroke: "ink", ...extra }
}

function line(id: string, start: LineElement["start"], end: LineElement["end"], extra: Partial<LineElement> = {}): LineElement {
  return { id, type: "arrow", z: 5, start, end, stroke: "ink", ...extra }
}

function map(...els: Array<BoxElement | LineElement>): ElementMap {
  return Object.fromEntries(els.map((el) => [el.id, el]))
}

describe("side midpoints (where lines attach)", () => {
  const b = box("a", 0, 0, 100, 50)

  it("sidePoint is the middle of each side", () => {
    expect(sidePoint(b, "n")).toEqual({ x: 50, y: 0 })
    expect(sidePoint(b, "e")).toEqual({ x: 100, y: 25 })
    expect(sidePoint(b, "s")).toEqual({ x: 50, y: 50 })
    expect(sidePoint(b, "w")).toEqual({ x: 0, y: 25 })
  })

  it("facingSide uses the box's proportions", () => {
    expect(facingSide(b, { x: 300, y: 25 })).toBe("e")
    expect(facingSide(b, { x: -300, y: 40 })).toBe("w")
    expect(facingSide(b, { x: 50, y: -100 })).toBe("n")
    expect(facingSide(b, { x: 60, y: 200 })).toBe("s")
  })

  it("nearestSide picks the closest midpoint", () => {
    expect(nearestSide(b, { x: 95, y: 30 })).toBe("e")
    expect(nearestSide(b, { x: 48, y: 3 })).toBe("n")
  })

  it("snapTarget snaps a nearby point to the nearest attach place, skipping frames and excluded ids", () => {
    const frame = box("f", -500, -500, 2000, 2000, { type: "frame", z: 0 })
    const els = map(frame, b)
    expect(snapTarget(els, { x: 108, y: 10 }, 12)).toEqual({ id: "a", side: "e", at: 0.25, point: { x: 100, y: 12.5 } })
    expect(snapTarget(els, { x: 50, y: 49 }, 12)).toEqual({ id: "a", side: "s", at: 0.5, point: { x: 50, y: 50 } })
    expect(snapTarget(els, { x: 140, y: 10 }, 12)).toBeNull()
    expect(snapTarget(els, { x: 108, y: 10 }, 12, ["a"])).toBeNull()
  })

  it("a rectangle offers its corners, side middles and the points halfway between (16 places)", () => {
    const places = new Set(anchorsOf(b).map((a) => JSON.stringify(anchorPoint(b, a.side, a.at))))
    expect(places.size).toBe(16)
    expect(anchorPoint(b, "n", 0.25)).toEqual({ x: 25, y: 0 })
    expect(anchorPoint(b, "e", 1)).toEqual({ x: 100, y: 50 })
    // At a corner the side facing the point wins (the line leaves that way).
    expect(nearestAnchor(b, { x: 104, y: -10 })).toEqual({ side: "n", at: 1 })
    expect(nearestAnchor(b, { x: 120, y: -2 })).toEqual({ side: "e", at: 0 })
  })

  it("an ellipse offers a place every 45°; a library shape its side middles only", () => {
    const e = box("e", 0, 0, 100, 100, { type: "ellipse" })
    const key = (p: { x: number; y: number }) => `${Math.round(p.x * 10)}:${Math.round(p.y * 10)}`
    const places = new Set(anchorsOf(e).map((a) => key(anchorPoint(e, a.side, a.at))))
    expect(places.size).toBe(8)
    const ne = anchorPoint(e, "n", 1)
    expect(ne.x).toBeCloseTo(50 + 50 * Math.SQRT1_2)
    expect(ne.y).toBeCloseTo(50 - 50 * Math.SQRT1_2)
    // The same 45° point from the side next to it.
    expect(anchorPoint(e, "e", 0).x).toBeCloseTo(ne.x)
    const sw = anchorPoint(e, "s", 0)
    expect(sw.x).toBeCloseTo(50 - 50 * Math.SQRT1_2)
    expect(sw.y).toBeCloseTo(50 + 50 * Math.SQRT1_2)
    expect(anchorsOf(box("d", 0, 0, 80, 80, { type: "shape" }))).toHaveLength(4)
  })

  it("a turned box: its attach places, hit test and bounds turn with it", () => {
    const turned = box("r", 0, 0, 100, 50, { rotation: 90 })
    // Centre (50, 25); the top middle (50, 0) turned 90° clockwise lands right of the centre.
    const n = anchorPoint(turned, "n")
    expect(n.x).toBeCloseTo(75)
    expect(n.y).toBeCloseTo(25)
    // Upright it reaches x 0–100; turned, y -25–75 and x 25–75.
    expect(hitsElement(turned, { x: 50, y: 70 }, 0, map(turned))).toBe(true)
    expect(hitsElement(turned, { x: 5, y: 25 }, 0, map(turned))).toBe(false)
    const bounds = elementBounds(turned, map(turned)) as { x: number; y: number; w: number; h: number }
    expect(bounds.x).toBeCloseTo(25)
    expect(bounds.y).toBeCloseTo(-25)
    expect(bounds.w).toBeCloseTo(50)
    expect(bounds.h).toBeCloseTo(100)
    // A frame never turns.
    expect(rotationOf(box("f", 0, 0, 100, 50, { type: "frame", rotation: 45 }))).toBe(0)
  })

  it("an attached end with a place along its side is drawn there", () => {
    const target = box("t", 200, 0, 100, 50)
    const l = line("l", { x: 0, y: 0, attach: "a", side: "e", at: 0 }, { x: 0, y: 0, attach: "t", side: "w", at: 0.75 })
    expect(resolveLine(l, map(b, target, l))).toEqual({ a: { x: 100, y: 0 }, b: { x: 200, y: 37.5 } })
  })
})

describe("lineGeometry", () => {
  const a = box("a", 0, 0, 100, 100)
  const b = box("b", 300, 200, 100, 100)

  it("an attached end sits on its stored side's midpoint", () => {
    const l = line("l", { x: 0, y: 0, attach: "a", side: "s" }, { x: 0, y: 0, attach: "b", side: "n" })
    const g = lineGeometry(l, map(a, b, l))
    expect(g.a).toEqual({ x: 50, y: 100 })
    expect(g.b).toEqual({ x: 350, y: 200 })
  })

  it("routes an elbow line at right angles, leaving each box straight out of its side", () => {
    const l = line("l", { x: 0, y: 0, attach: "a", side: "e" }, { x: 0, y: 0, attach: "b", side: "w" }, { route: "elbow" })
    const g = lineGeometry(l, map(a, b, l))
    for (let i = 1; i < g.points.length; i++) {
      const p = g.points[i - 1]
      const q = g.points[i]
      expect(p.x === q.x || p.y === q.y).toBe(true)
    }
    // a → out of a's right side → across at mid-x → into b's left side (collinear stubs are merged)
    expect(g.points).toEqual([{ x: 100, y: 50 }, { x: 200, y: 50 }, { x: 200, y: 250 }, { x: 300, y: 250 }])
    expect(g.d.startsWith("M100 50")).toBe(true)
  })

  it("a curve starts and ends on the ends and its midpoint lies between them", () => {
    const l = line("l", { x: 0, y: 0, attach: "a", side: "e" }, { x: 0, y: 0, attach: "b", side: "w" }, { route: "curve" })
    const g = lineGeometry(l, map(a, b, l))
    expect(g.points[0]).toEqual({ x: 100, y: 50 })
    expect(g.points[g.points.length - 1]).toEqual({ x: 300, y: 250 })
    expect(g.mid.x).toBeGreaterThan(100)
    expect(g.mid.x).toBeLessThan(300)
    expect(g.d).toContain("C")
  })
})
describe("resolveLine (arrow attachment)", () => {
  it("draws a free line between its stored points", () => {
    const l = line("l", { x: 1, y: 2 }, { x: 30, y: 40 })
    expect(resolveLine(l, map(l))).toEqual({ a: { x: 1, y: 2 }, b: { x: 30, y: 40 } })
  })

  it("puts an attached end on the box outline, facing the other end", () => {
    const a = box("a", 0, 0, 100, 100)
    const l = line("l", { x: 50, y: 50, attach: "a" }, { x: 300, y: 50 })
    expect(resolveLine(l, map(a, l))).toEqual({ a: { x: 100, y: 50 }, b: { x: 300, y: 50 } })
  })

  it("follows the box when it moves, without the line changing", () => {
    const l = line("l", { x: 50, y: 50, attach: "a" }, { x: 300, y: 250 })
    const moved = box("a", 0, 200, 100, 100)
    expect(resolveLine(l, map(moved, l)).a).toEqual({ x: 100, y: 250 })
  })

  it("connects two boxes outline to outline", () => {
    const a = box("a", 0, 0, 100, 100)
    const b = box("b", 300, 0, 100, 100)
    const l = line("l", { x: 0, y: 0, attach: "a" }, { x: 0, y: 0, attach: "b" })
    expect(resolveLine(l, map(a, b, l))).toEqual({ a: { x: 100, y: 50 }, b: { x: 300, y: 50 } })
  })

  it("falls back to the stored point when the box is gone", () => {
    const l = line("l", { x: 7, y: 8, attach: "gone" }, { x: 30, y: 40 })
    expect(resolveLine(l, map(l)).a).toEqual({ x: 7, y: 8 })
  })
})

describe("bounds and order", () => {
  it("bounds of a box, a line and a selection", () => {
    const a = box("a", 10, 10, 100, 50)
    const l = line("l", { x: 200, y: 300 }, { x: 150, y: 20 })
    const els = map(a, l)
    expect(elementBounds(a, els)).toEqual({ x: 10, y: 10, w: 100, h: 50 })
    expect(elementBounds(l, els)).toEqual({ x: 150, y: 20, w: 50, h: 280 })
    expect(boundsOf(["a", "l"], els)).toEqual({ x: 10, y: 10, w: 190, h: 290 })
    expect(boundsOf([], els)).toBeNull()
    expect(boundsOf(["missing"], els)).toBeNull()
  })

  it("sorts back to front by z, then id", () => {
    const els = map(box("b", 0, 0, 1, 1, { z: 2 }), box("a", 0, 0, 1, 1, { z: 2 }), box("c", 0, 0, 1, 1, { z: 1 }))
    expect(sortByZ(els).map((el) => el.id)).toEqual(["c", "a", "b"])
  })

  it("rectFromPoints normalises a drag in any direction", () => {
    expect(rectFromPoints({ x: 50, y: 60 }, { x: 10, y: 20 })).toEqual({ x: 10, y: 20, w: 40, h: 40 })
  })
})

describe("hitTest", () => {
  it("picks the front-most element under the point", () => {
    const back = box("back", 0, 0, 100, 100, { z: 1 })
    const front = box("front", 50, 50, 100, 100, { z: 2 })
    const els = map(back, front)
    expect(hitTest(els, { x: 75, y: 75 }, 2)).toBe("front")
    expect(hitTest(els, { x: 10, y: 10 }, 2)).toBe("back")
    expect(hitTest(els, { x: 500, y: 500 }, 2)).toBeNull()
  })

  it("hits an ellipse inside its outline only", () => {
    const e = box("e", 0, 0, 100, 100, { type: "ellipse" })
    expect(hitTest(map(e), { x: 50, y: 50 }, 0)).toBe("e")
    expect(hitTest(map(e), { x: 3, y: 3 }, 0)).toBeNull()
  })

  it("hits a line within the tolerance", () => {
    const l = line("l", { x: 0, y: 0 }, { x: 100, y: 0 })
    expect(hitTest(map(l), { x: 50, y: 4 }, 5)).toBe("l")
    expect(hitTest(map(l), { x: 50, y: 9 }, 5)).toBeNull()
    expect(distanceToSegment({ x: -3, y: 4 }, { x: 0, y: 0 }, { x: 100, y: 0 })).toBe(5)
  })

  it("picks an empty frame by its outline, so what is inside stays reachable", () => {
    const frame = box("frame", 0, 0, 200, 200, { fill: "none", z: 9 })
    const inner = box("inner", 50, 50, 20, 20, { z: 1 })
    const els = map(frame, inner)
    expect(hitTest(els, { x: 60, y: 60 }, 3)).toBe("inner")
    expect(hitTest(els, { x: 120, y: 120 }, 3)).toBeNull()
    expect(hitTest(els, { x: 1, y: 100 }, 3)).toBe("frame")
    // With text in it, the whole frame is clickable.
    expect(hitTest(map({ ...frame, text: "a" }), { x: 120, y: 120 }, 3)).toBe("frame")
  })

  it("boxAt finds the box a line end is dropped on, skipping lines and excluded ids", () => {
    const a = box("a", 0, 0, 100, 100, { fill: "none" })
    const l = line("l", { x: 0, y: 0 }, { x: 100, y: 100 })
    const els = map(a, l)
    expect(boxAt(els, { x: 50, y: 50 })).toBe("a")
    expect(boxAt(els, { x: 50, y: 50 }, ["a"])).toBeNull()
    expect(boxAt(els, { x: 150, y: 50 })).toBeNull()
  })

  it("elementsInRect returns what the rubber band touches", () => {
    const a = box("a", 0, 0, 50, 50)
    const b = box("b", 200, 200, 50, 50)
    const l = line("l", { x: 60, y: 60 }, { x: 80, y: 80 })
    expect(elementsInRect(map(a, b, l), { x: 40, y: 40, w: 50, h: 50 }).sort()).toEqual(["a", "l"])
  })
})

describe("resize handles", () => {
  const rect = { x: 10, y: 20, w: 100, h: 50 }

  it("finds the handle under the point", () => {
    expect(hitBoxHandle(rect, { x: 11, y: 21 }, 4)).toBe("nw")
    expect(hitBoxHandle(rect, { x: 110, y: 70 }, 4)).toBe("se")
    expect(hitBoxHandle(rect, { x: 60, y: 20 }, 4)).toBe("n")
    expect(hitBoxHandle(rect, { x: 60, y: 45 }, 4)).toBeNull()
  })

  it("resizes from each side, keeping the opposite side", () => {
    expect(resizeRect(rect, "se", 20, 10)).toEqual({ x: 10, y: 20, w: 120, h: 60 })
    expect(resizeRect(rect, "nw", 20, 10)).toEqual({ x: 30, y: 30, w: 80, h: 40 })
    expect(resizeRect(rect, "e", 15, 999)).toEqual({ x: 10, y: 20, w: 115, h: 50 })
    expect(resizeRect(rect, "n", 999, -10)).toEqual({ x: 10, y: 10, w: 100, h: 60 })
  })

  it("never gets smaller than the minimum and never flips", () => {
    expect(resizeRect(rect, "se", -500, -500)).toEqual({ x: 10, y: 20, w: 8, h: 8 })
    expect(resizeRect(rect, "nw", 500, 500)).toEqual({ x: 102, y: 62, w: 8, h: 8 })
  })

  it("finds the ends of a line", () => {
    const l = line("l", { x: 0, y: 0 }, { x: 100, y: 0 })
    expect(hitLineHandle(l, map(l), { x: 2, y: 1 }, 5)).toBe("start")
    expect(hitLineHandle(l, map(l), { x: 99, y: 1 }, 5)).toBe("end")
    expect(hitLineHandle(l, map(l), { x: 50, y: 0 }, 5)).toBeNull()
  })
})

describe("viewport", () => {
  it("converts between screen and sheet", () => {
    const v = { x: 100, y: 50, zoom: 2 }
    expect(toSheet(v, { x: 300, y: 250 })).toEqual({ x: 100, y: 100 })
    expect(toScreen(v, { x: 100, y: 100 })).toEqual({ x: 300, y: 250 })
  })

  it("pans", () => {
    expect(panBy({ x: 1, y: 2, zoom: 1 }, 10, -5)).toEqual({ x: 11, y: -3, zoom: 1 })
  })

  it("zooms around the pointer: the sheet point under it does not move", () => {
    const v = { x: 40, y: 30, zoom: 1 }
    const anchor = { x: 200, y: 100 }
    const before = toSheet(v, anchor)
    const next = zoomAt(v, anchor, 2.5)
    expect(next.zoom).toBe(2.5)
    const after = toSheet(next, anchor)
    expect(after.x).toBeCloseTo(before.x)
    expect(after.y).toBeCloseTo(before.y)
  })

  it("keeps the zoom inside its limits", () => {
    expect(zoomAt({ x: 0, y: 0, zoom: 1 }, { x: 0, y: 0 }, 99).zoom).toBe(MAX_ZOOM)
    expect(zoomAt({ x: 0, y: 0, zoom: 1 }, { x: 0, y: 0 }, 0).zoom).toBe(MIN_ZOOM)
    expect(wheelZoom(1, -100000)).toBeLessThanOrEqual(MAX_ZOOM)
    expect(wheelZoom(1, 100)).toBeLessThan(1)
    expect(wheelZoom(1, -100)).toBeGreaterThan(1)
  })

  it("steps through the zoom levels", () => {
    expect(stepZoom(1, 1)).toBe(1.25)
    expect(stepZoom(1, -1)).toBe(0.75)
    expect(stepZoom(1.1, 1)).toBe(1.25)
    expect(stepZoom(MAX_ZOOM, 1)).toBe(MAX_ZOOM)
    expect(stepZoom(MIN_ZOOM, -1)).toBe(MIN_ZOOM)
  })

  it("fits the drawing into the canvas, never above 100 %", () => {
    const small = fitViewport({ x: 0, y: 0, w: 100, h: 100 }, { width: 800, height: 600 })
    expect(small).toEqual({ zoom: 1, x: 350, y: 250 })
    const large = fitViewport({ x: 0, y: 0, w: 2000, h: 1000 }, { width: 800, height: 600 }, 0)
    expect(large.zoom).toBeCloseTo(0.4)
    expect(toScreen(large, { x: 1000, y: 500 })).toEqual({ x: 400, y: 300 })
    expect(fitViewport(null, { width: 800, height: 600 })).toEqual({ x: 0, y: 0, zoom: 1 })
  })
})
