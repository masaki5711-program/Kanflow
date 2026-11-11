import { boundsOf, elementBounds, type ElementMap, type Point, type Rect } from "./geometry"
import { isBox } from "./model"

/**
 * Smart guides: while shapes are dragged, their left / centre / right edges and top / middle / bottom edges catch
 * the same edges of the other shapes nearby, and a guide line shows what they line up with. Pure.
 */

/** A guide line to draw (sheet units): vertical at `x` from y1 to y2, or horizontal at `y` from x1 to x2. */
export type Guide = { axis: "x"; x: number; y1: number; y2: number } | { axis: "y"; y: number; x1: number; x2: number }

export interface GuidedMove {
  /** The move adjusted so the dragged shapes line up. */
  d: Point
  guides: Guide[]
}

const xs = (r: Rect) => [r.x, r.x + r.w / 2, r.x + r.w]
const ys = (r: Rect) => [r.y, r.y + r.h / 2, r.y + r.h]

/**
 * The move (dx, dy) of the elements `ids`, adjusted to line them up with another box when one of their edges or
 * centres comes within `tolerance` (sheet units). Boxes far away (beyond `reach` of the dragged bounds) are not
 * considered, so a large sheet stays fast.
 */
export function guidedMove(elements: ElementMap, ids: readonly string[], dx: number, dy: number, tolerance: number, reach = 2000): GuidedMove {
  const start = boundsOf([...ids], elements)
  if (!start) return { d: { x: dx, y: dy }, guides: [] }
  const moved: Rect = { x: start.x + dx, y: start.y + dy, w: start.w, h: start.h }
  const moving = new Set(ids)
  const others: Rect[] = []
  for (const el of Object.values(elements)) {
    if (!isBox(el) || moving.has(el.id)) continue
    const r = elementBounds(el, elements)
    if (!r) continue
    if (r.x > moved.x + moved.w + reach || r.x + r.w < moved.x - reach || r.y > moved.y + moved.h + reach || r.y + r.h < moved.y - reach) continue
    others.push(r)
  }
  let bestX: { delta: number; at: number } | null = null
  let bestY: { delta: number; at: number } | null = null
  for (const r of others) {
    for (const target of xs(r)) {
      for (const edge of xs(moved)) {
        const delta = target - edge
        if (Math.abs(delta) <= tolerance && (!bestX || Math.abs(delta) < Math.abs(bestX.delta))) bestX = { delta, at: target }
      }
    }
    for (const target of ys(r)) {
      for (const edge of ys(moved)) {
        const delta = target - edge
        if (Math.abs(delta) <= tolerance && (!bestY || Math.abs(delta) < Math.abs(bestY.delta))) bestY = { delta, at: target }
      }
    }
  }
  const d = { x: dx + (bestX?.delta ?? 0), y: dy + (bestY?.delta ?? 0) }
  const final: Rect = { x: start.x + d.x, y: start.y + d.y, w: start.w, h: start.h }
  const guides: Guide[] = []
  if (bestX) {
    // The guide runs over every box sharing that line, and the dragged one.
    const touching = others.filter((r) => xs(r).some((v) => Math.abs(v - (bestX as { at: number }).at) < 0.5))
    const top = Math.min(final.y, ...touching.map((r) => r.y))
    const bottom = Math.max(final.y + final.h, ...touching.map((r) => r.y + r.h))
    guides.push({ axis: "x", x: bestX.at, y1: top, y2: bottom })
  }
  if (bestY) {
    const touching = others.filter((r) => ys(r).some((v) => Math.abs(v - (bestY as { at: number }).at) < 0.5))
    const left = Math.min(final.x, ...touching.map((r) => r.x))
    const right = Math.max(final.x + final.w, ...touching.map((r) => r.x + r.w))
    guides.push({ axis: "y", y: bestY.at, x1: left, x2: right })
  }
  return { d, guides }
}
