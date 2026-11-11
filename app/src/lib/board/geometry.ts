import { isBox, isLine, SIDES, type BoardElement, type BoxElement, type LineElement, type LineEnd, type Side } from "./model"

/**
 * Geometry of the ボード editor in sheet ("world") coordinates: bounds, hit tests, resize handles and where
 * a line meets the box it is attached to. Pure functions; the React layer only converts pointer positions
 * (viewport.ts) and calls these.
 */

export interface Point {
  x: number
  y: number
}

export interface Rect {
  x: number
  y: number
  w: number
  h: number
}

export type ElementMap = Readonly<Record<string, BoardElement>>

/** Smallest width / height a box can be resized to. */
export const MIN_BOX_SIZE = 8

export function boxRect(el: BoxElement): Rect {
  return { x: el.x, y: el.y, w: el.w, h: el.h }
}

export function rectCenter(r: Rect): Point {
  return { x: r.x + r.w / 2, y: r.y + r.h / 2 }
}

export function rectFromPoints(a: Point, b: Point): Rect {
  return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(a.x - b.x), h: Math.abs(a.y - b.y) }
}

export function rectsIntersect(a: Rect, b: Rect): boolean {
  return a.x <= b.x + b.w && b.x <= a.x + a.w && a.y <= b.y + b.h && b.y <= a.y + a.h
}

export function pointInRect(p: Point, r: Rect, tolerance = 0): boolean {
  return p.x >= r.x - tolerance && p.x <= r.x + r.w + tolerance && p.y >= r.y - tolerance && p.y <= r.y + r.h + tolerance
}

export function unionRects(rects: readonly Rect[]): Rect | null {
  if (rects.length === 0) return null
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const r of rects) {
    minX = Math.min(minX, r.x)
    minY = Math.min(minY, r.y)
    maxX = Math.max(maxX, r.x + r.w)
    maxY = Math.max(maxY, r.y + r.h)
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY }
}

export function distanceToSegment(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const lengthSq = dx * dx + dy * dy
  if (lengthSq === 0) return Math.hypot(p.x - a.x, p.y - a.y)
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lengthSq))
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy))
}

// ---------------------------------------------------------------------------
// Lines and what they are attached to
// ---------------------------------------------------------------------------

/** Outward direction of each side. */
export const SIDE_DIR: Readonly<Record<Side, Point>> = { n: { x: 0, y: -1 }, e: { x: 1, y: 0 }, s: { x: 0, y: 1 }, w: { x: -1, y: 0 } }

/** The middle of one side of a box (for an ellipse: its top / right / bottom / left point — the same place). */
export function sidePoint(box: BoxElement, side: Side): Point {
  const { x, y, w, h } = box
  switch (side) {
    case "n":
      return { x: x + w / 2, y }
    case "e":
      return { x: x + w, y: y + h / 2 }
    case "s":
      return { x: x + w / 2, y: y + h }
    case "w":
      return { x, y: y + h / 2 }
  }
}

/** The side that faces `toward` (measured against the box's own proportions, so a wide box still uses its ends). */
export function facingSide(box: BoxElement, toward: Point): Side {
  const c = rectCenter(boxRect(box))
  const dx = (toward.x - c.x) / Math.max(box.w / 2, 1)
  const dy = (toward.y - c.y) / Math.max(box.h / 2, 1)
  if (Math.abs(dx) >= Math.abs(dy)) return dx >= 0 ? "e" : "w"
  return dy >= 0 ? "s" : "n"
}

/** The side whose middle is closest to the point: where a dropped line end attaches. */
export function nearestSide(box: BoxElement, p: Point): Side {
  let best: Side = "n"
  let bestDistance = Infinity
  for (const side of SIDES) {
    const m = sidePoint(box, side)
    const distance = Math.hypot(p.x - m.x, p.y - m.y)
    if (distance < bestDistance) {
      best = side
      bestDistance = distance
    }
  }
  return best
}

/** The box a line end is attached to, when it still exists. */
export function attachedBox(end: LineEnd, elements: ElementMap): BoxElement | null {
  const target = end.attach ? elements[end.attach] : undefined
  return isBox(target) ? target : null
}

/** One resolved end of a line: where it is drawn, and the outward direction of its side (null for a free end). */
export interface ResolvedEnd {
  point: Point
  dir: Point | null
}

/**
 * Where each end of a line is drawn. An attached end sits on the middle of a side of its box: the side it was
 * dropped on, or (when none was stored) the side facing the other end — so the line follows the box when it
 * moves. A free end, or one whose box is gone, is its stored point.
 */
export function resolveEnds(line: LineElement, elements: ElementMap): { a: ResolvedEnd; b: ResolvedEnd } {
  const startBox = attachedBox(line.start, elements)
  const endBox = attachedBox(line.end, elements)
  const startRef = startBox ? rectCenter(boxRect(startBox)) : { x: line.start.x, y: line.start.y }
  const endRef = endBox ? rectCenter(boxRect(endBox)) : { x: line.end.x, y: line.end.y }
  const resolve = (end: LineEnd, box: BoxElement | null, other: Point): ResolvedEnd => {
    if (!box) return { point: { x: end.x, y: end.y }, dir: null }
    const side = end.side ?? facingSide(box, other)
    return { point: sidePoint(box, side), dir: SIDE_DIR[side] }
  }
  return { a: resolve(line.start, startBox, endRef), b: resolve(line.end, endBox, startRef) }
}

/** The two points a line is drawn between (see resolveEnds). */
export function resolveLine(line: LineElement, elements: ElementMap): { a: Point; b: Point } {
  const { a, b } = resolveEnds(line, elements)
  return { a: a.point, b: b.point }
}

/** How far an elbow line leaves a box straight out before it turns. */
const ELBOW_GAP = 20
/** Points a curve is sampled into for hit tests and bounds. */
const CURVE_SAMPLES = 24

/** The axis direction from `from` towards `to` (for a free end of an elbow or a curve). */
function axisToward(from: Point, to: Point): Point {
  const dx = to.x - from.x
  const dy = to.y - from.y
  if (Math.abs(dx) >= Math.abs(dy)) return { x: dx >= 0 ? 1 : -1, y: 0 }
  return { x: 0, y: dy >= 0 ? 1 : -1 }
}

const add = (p: Point, d: Point, k: number): Point => ({ x: p.x + d.x * k, y: p.y + d.y * k })

/** Drops repeated points and points in the middle of a straight run. */
function simplify(points: Point[]): Point[] {
  const out: Point[] = []
  for (const p of points) {
    const last = out[out.length - 1]
    if (last && last.x === p.x && last.y === p.y) continue
    const before = out[out.length - 2]
    if (before && last && ((before.x === last.x && last.x === p.x) || (before.y === last.y && last.y === p.y))) out[out.length - 1] = p
    else out.push(p)
  }
  return out
}

/** Right-angled route between two ends, leaving and entering each box straight out of its side. */
function elbowPoints(a: Point, da: Point, b: Point, db: Point): Point[] {
  const p1 = add(a, da, ELBOW_GAP)
  const p2 = add(b, db, ELBOW_GAP)
  const horizontalA = da.x !== 0
  const horizontalB = db.x !== 0
  let middle: Point[]
  if (horizontalA && horizontalB) {
    const mx = (p1.x + p2.x) / 2
    middle = [{ x: mx, y: p1.y }, { x: mx, y: p2.y }]
  } else if (!horizontalA && !horizontalB) {
    const my = (p1.y + p2.y) / 2
    middle = [{ x: p1.x, y: my }, { x: p2.x, y: my }]
  } else if (horizontalA) {
    middle = [{ x: p2.x, y: p1.y }]
  } else {
    middle = [{ x: p1.x, y: p2.y }]
  }
  return simplify([a, p1, ...middle, p2, b])
}

function cubicAt(p0: Point, p1: Point, p2: Point, p3: Point, t: number): Point {
  const u = 1 - t
  return {
    x: u * u * u * p0.x + 3 * u * u * t * p1.x + 3 * u * t * t * p2.x + t * t * t * p3.x,
    y: u * u * u * p0.y + 3 * u * u * t * p1.y + 3 * u * t * t * p2.y + t * t * t * p3.y,
  }
}

/** Everything needed to draw and pick a line. */
export interface LineGeometry {
  a: Point
  b: Point
  /** SVG path data. */
  d: string
  /** The drawn route as a polyline (a curve sampled): hit tests, bounds, the label's place. */
  points: Point[]
  /** Where the arrow heads point from: the route's neighbour of each end. */
  startFrom: Point
  endFrom: Point
  /** The middle of the route (by length): where the label sits. */
  mid: Point
}

function midpointOf(points: readonly Point[]): Point {
  let total = 0
  for (let i = 1; i < points.length; i++) total += Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y)
  let left = total / 2
  for (let i = 1; i < points.length; i++) {
    const length = Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y)
    if (left <= length && length > 0) {
      const t = left / length
      return { x: points[i - 1].x + (points[i].x - points[i - 1].x) * t, y: points[i - 1].y + (points[i].y - points[i - 1].y) * t }
    }
    left -= length
  }
  return points[0] ?? { x: 0, y: 0 }
}

const fmt = (n: number) => Math.round(n * 100) / 100

/** The route of a line: straight, right-angled (elbow) or curved, between its resolved ends. */
export function lineGeometry(line: LineElement, elements: ElementMap, route: "straight" | "elbow" | "curve" = line.route ?? "straight"): LineGeometry {
  const { a: ra, b: rb } = resolveEnds(line, elements)
  const a = ra.point
  const b = rb.point
  if (route === "straight" || (a.x === b.x && a.y === b.y)) {
    return { a, b, d: `M${fmt(a.x)} ${fmt(a.y)}L${fmt(b.x)} ${fmt(b.y)}`, points: [a, b], startFrom: b, endFrom: a, mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } }
  }
  const da = ra.dir ?? axisToward(a, b)
  const db = rb.dir ?? axisToward(b, a)
  if (route === "elbow") {
    const points = elbowPoints(a, da, b, db)
    const d = points.map((p, i) => `${i === 0 ? "M" : "L"}${fmt(p.x)} ${fmt(p.y)}`).join("")
    return { a, b, d, points, startFrom: points[1] ?? b, endFrom: points[points.length - 2] ?? a, mid: midpointOf(points) }
  }
  const k = Math.max(40, Math.hypot(b.x - a.x, b.y - a.y) * 0.4)
  const c1 = add(a, da, k)
  const c2 = add(b, db, k)
  const points = Array.from({ length: CURVE_SAMPLES + 1 }, (_, i) => cubicAt(a, c1, c2, b, i / CURVE_SAMPLES))
  return {
    a,
    b,
    d: `M${fmt(a.x)} ${fmt(a.y)}C${fmt(c1.x)} ${fmt(c1.y)} ${fmt(c2.x)} ${fmt(c2.y)} ${fmt(b.x)} ${fmt(b.y)}`,
    points,
    startFrom: c1,
    endFrom: c2,
    mid: cubicAt(a, c1, c2, b, 0.5),
  }
}

function distanceToPolyline(p: Point, points: readonly Point[]): number {
  let best = Infinity
  for (let i = 1; i < points.length; i++) best = Math.min(best, distanceToSegment(p, points[i - 1], points[i]))
  return points.length === 1 ? Math.hypot(p.x - points[0].x, p.y - points[0].y) : best
}

function boundsOfPoints(points: readonly Point[]): Rect {
  return unionRects(points.map((p) => ({ x: p.x, y: p.y, w: 0, h: 0 }))) ?? { x: 0, y: 0, w: 0, h: 0 }
}

// ---------------------------------------------------------------------------
// Bounds, order, hit tests
// ---------------------------------------------------------------------------

/** Bounding rectangle of a drawn element; null for a type this build does not draw. */
export function elementBounds(el: BoardElement, elements: ElementMap): Rect | null {
  if (isBox(el)) return boxRect(el)
  if (isLine(el)) return boundsOfPoints(lineGeometry(el, elements).points)
  return null
}

export function boundsOf(ids: readonly string[], elements: ElementMap): Rect | null {
  const rects: Rect[] = []
  for (const id of ids) {
    const el = elements[id]
    const rect = el ? elementBounds(el, elements) : null
    if (rect) rects.push(rect)
  }
  return unionRects(rects)
}

function zOf(el: BoardElement): number {
  return el.type === "unknown" ? 0 : el.z
}

/** Drawing order: back to front (z, then id so the order is stable). */
export function sortByZ(elements: ElementMap): BoardElement[] {
  return Object.values(elements).sort((a, b) => zOf(a) - zOf(b) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
}

/** Does the point touch the element? `tolerance` is the slack in sheet units (a few screen pixels). */
export function hitsElement(el: BoardElement, p: Point, tolerance: number, elements: ElementMap): boolean {
  if (isLine(el)) {
    const geometry = lineGeometry(el, elements)
    if (distanceToPolyline(p, geometry.points) <= tolerance) return true
    // A label is part of the line: clicking its text picks the line.
    return !!el.label && Math.abs(p.x - geometry.mid.x) <= Math.max(24, el.label.length * 4) && Math.abs(p.y - geometry.mid.y) <= 12
  }
  if (!isBox(el)) return false
  const rect = boxRect(el)
  if (el.type === "ellipse") {
    const c = rectCenter(rect)
    const rx = el.w / 2 + tolerance
    const ry = el.h / 2 + tolerance
    const inside = ((p.x - c.x) / rx) ** 2 + ((p.y - c.y) / ry) ** 2 <= 1
    if (!inside || !isHollow(el)) return inside
    const ix = el.w / 2 - tolerance
    const iy = el.h / 2 - tolerance
    return ix <= 0 || iy <= 0 || ((p.x - c.x) / ix) ** 2 + ((p.y - c.y) / iy) ** 2 >= 1
  }
  if (!pointInRect(p, rect, tolerance)) return false
  if (!isHollow(el)) return true
  if (el.type === "frame" && p.y <= rect.y + FRAME_TITLE_HEIGHT) return true
  // An empty frame is picked by its outline only, so what lies inside it stays reachable.
  return !pointInRect(p, { x: rect.x + tolerance, y: rect.y + tolerance, w: rect.w - 2 * tolerance, h: rect.h - 2 * tolerance })
}

/**
 * A shape with no fill and no text: only its outline is there to click. A frame is picked by its outline and its
 * title bar only, so what lies in it stays reachable.
 */
function isHollow(el: BoxElement): boolean {
  if (el.type === "frame") return true
  return (el.type === "rect" || el.type === "ellipse") && el.fill === "none" && el.text === ""
}

/** Height of a frame's title bar (sheet units): the part of a frame that picks it besides its outline. */
export const FRAME_TITLE_HEIGHT = 28

/** The front-most element at the point, or null. */
export function hitTest(elements: ElementMap, p: Point, tolerance: number): string | null {
  const ordered = sortByZ(elements)
  for (let i = ordered.length - 1; i >= 0; i--) {
    if (hitsElement(ordered[i], p, tolerance, elements)) return ordered[i].id
  }
  return null
}

/**
 * The front-most box under the point, or within `reach` of its outline: what a line end dropped here attaches to.
 * Frames are skipped (a line drawn inside a frame connects the shapes in it, not the frame).
 */
export function boxAt(elements: ElementMap, p: Point, exclude: readonly string[] = [], reach = 0): string | null {
  const ordered = sortByZ(elements)
  for (let i = ordered.length - 1; i >= 0; i--) {
    const el = ordered[i]
    if (isBox(el) && el.type !== "frame" && !exclude.includes(el.id) && pointInRect(p, boxRect(el), reach)) return el.id
  }
  return null
}

/** Where a line end near a box snaps to: that box and the side whose middle is closest. */
export interface SnapTarget {
  id: string
  side: Side
  point: Point
}

export function snapTarget(elements: ElementMap, p: Point, reach: number, exclude: readonly string[] = []): SnapTarget | null {
  const id = boxAt(elements, p, exclude, reach)
  const box = id ? elements[id] : undefined
  if (!id || !isBox(box)) return null
  const side = nearestSide(box, p)
  return { id, side, point: sidePoint(box, side) }
}

/** Rubber band: every drawn element whose bounds touch the rectangle, back to front. */
export function elementsInRect(elements: ElementMap, rect: Rect): string[] {
  return sortByZ(elements)
    .filter((el) => {
      const bounds = elementBounds(el, elements)
      return bounds !== null && rectsIntersect(bounds, rect)
    })
    .map((el) => el.id)
}

// ---------------------------------------------------------------------------
// Resize handles
// ---------------------------------------------------------------------------

export const BOX_HANDLES = ["nw", "n", "ne", "e", "se", "s", "sw", "w"] as const
export type BoxHandle = (typeof BOX_HANDLES)[number]
export type LineHandle = "start" | "end"

export function boxHandlePoints(r: Rect): Record<BoxHandle, Point> {
  const cx = r.x + r.w / 2
  const cy = r.y + r.h / 2
  const right = r.x + r.w
  const bottom = r.y + r.h
  return {
    nw: { x: r.x, y: r.y },
    n: { x: cx, y: r.y },
    ne: { x: right, y: r.y },
    e: { x: right, y: cy },
    se: { x: right, y: bottom },
    s: { x: cx, y: bottom },
    sw: { x: r.x, y: bottom },
    w: { x: r.x, y: cy },
  }
}

/** The handle of the rectangle under the point, or null. */
export function hitBoxHandle(r: Rect, p: Point, tolerance: number): BoxHandle | null {
  const points = boxHandlePoints(r)
  for (const handle of BOX_HANDLES) {
    const h = points[handle]
    if (Math.abs(p.x - h.x) <= tolerance && Math.abs(p.y - h.y) <= tolerance) return handle
  }
  return null
}

/** The end of the line under the point, or null. */
export function hitLineHandle(line: LineElement, elements: ElementMap, p: Point, tolerance: number): LineHandle | null {
  const { a, b } = resolveLine(line, elements)
  if (Math.hypot(p.x - b.x, p.y - b.y) <= tolerance) return "end"
  if (Math.hypot(p.x - a.x, p.y - a.y) <= tolerance) return "start"
  return null
}

/**
 * The rectangle after dragging one handle by (dx, dy). The opposite side stays where it is; the box never
 * gets smaller than MIN_BOX_SIZE and never flips.
 */
export function resizeRect(r: Rect, handle: BoxHandle, dx: number, dy: number, min = MIN_BOX_SIZE): Rect {
  let { x, y, w, h } = r
  if (handle.includes("w")) {
    const nextX = Math.min(r.x + dx, r.x + r.w - min)
    w = r.x + r.w - nextX
    x = nextX
  } else if (handle.includes("e")) {
    w = Math.max(min, r.w + dx)
  }
  if (handle.includes("n")) {
    const nextY = Math.min(r.y + dy, r.y + r.h - min)
    h = r.y + r.h - nextY
    y = nextY
  } else if (handle.includes("s")) {
    h = Math.max(min, r.h + dy)
  }
  return { x, y, w, h }
}
