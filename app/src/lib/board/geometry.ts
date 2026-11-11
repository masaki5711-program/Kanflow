import { isBox, isLine, type BoardElement, type BoxElement, type LineElement, type LineEnd } from "./model"

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

/**
 * Where a line arriving from `toward` meets the outline of the box: on the ray from the box's centre
 * towards that point. The centre itself when `toward` is the centre.
 */
export function anchorPoint(box: BoxElement, toward: Point): Point {
  const c = rectCenter(boxRect(box))
  const dx = toward.x - c.x
  const dy = toward.y - c.y
  if (dx === 0 && dy === 0) return c
  const hw = box.w / 2
  const hh = box.h / 2
  const t =
    box.type === "ellipse"
      ? 1 / Math.sqrt((dx * dx) / (hw * hw) + (dy * dy) / (hh * hh))
      : Math.min(dx !== 0 ? hw / Math.abs(dx) : Infinity, dy !== 0 ? hh / Math.abs(dy) : Infinity)
  return { x: c.x + dx * t, y: c.y + dy * t }
}

/** The box a line end is attached to, when it still exists. */
export function attachedBox(end: LineEnd, elements: ElementMap): BoxElement | null {
  const target = end.attach ? elements[end.attach] : undefined
  return isBox(target) ? target : null
}

/**
 * The two points a line is drawn between. An attached end sits on the outline of its box, facing the other
 * end (so the line follows the box when it moves); a free end, or one whose box is gone, is its stored point.
 */
export function resolveLine(line: LineElement, elements: ElementMap): { a: Point; b: Point } {
  const startBox = attachedBox(line.start, elements)
  const endBox = attachedBox(line.end, elements)
  const startRef = startBox ? rectCenter(boxRect(startBox)) : { x: line.start.x, y: line.start.y }
  const endRef = endBox ? rectCenter(boxRect(endBox)) : { x: line.end.x, y: line.end.y }
  return {
    a: startBox ? anchorPoint(startBox, endRef) : startRef,
    b: endBox ? anchorPoint(endBox, startRef) : endRef,
  }
}

// ---------------------------------------------------------------------------
// Bounds, order, hit tests
// ---------------------------------------------------------------------------

/** Bounding rectangle of a drawn element; null for a type this build does not draw. */
export function elementBounds(el: BoardElement, elements: ElementMap): Rect | null {
  if (isBox(el)) return boxRect(el)
  if (isLine(el)) {
    const { a, b } = resolveLine(el, elements)
    return rectFromPoints(a, b)
  }
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
    const { a, b } = resolveLine(el, elements)
    return distanceToSegment(p, a, b) <= tolerance
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
  // An empty frame is picked by its outline only, so what lies inside it stays reachable.
  return !pointInRect(p, { x: rect.x + tolerance, y: rect.y + tolerance, w: rect.w - 2 * tolerance, h: rect.h - 2 * tolerance })
}

/** A shape with no fill and no text: only its outline is there to click. */
function isHollow(el: BoxElement): boolean {
  return (el.type === "rect" || el.type === "ellipse") && el.fill === "none" && el.text === ""
}

/** The front-most element at the point, or null. */
export function hitTest(elements: ElementMap, p: Point, tolerance: number): string | null {
  const ordered = sortByZ(elements)
  for (let i = ordered.length - 1; i >= 0; i--) {
    if (hitsElement(ordered[i], p, tolerance, elements)) return ordered[i].id
  }
  return null
}

/** The front-most box under the point (the whole box counts): what a line end dropped here attaches to. */
export function boxAt(elements: ElementMap, p: Point, exclude: readonly string[] = []): string | null {
  const ordered = sortByZ(elements)
  for (let i = ordered.length - 1; i >= 0; i--) {
    const el = ordered[i]
    if (isBox(el) && !exclude.includes(el.id) && pointInRect(p, boxRect(el))) return el.id
  }
  return null
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
