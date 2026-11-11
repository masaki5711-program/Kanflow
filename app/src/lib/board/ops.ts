import type { Patch } from "./doc"
import { attachedBox, boxRect, resizeRect, resolveLine, sortByZ, type BoxHandle, type ElementMap, type LineHandle, type Point, type Rect } from "./geometry"
import { BOARD_LIMITS } from "./limits"
import {
  isBox,
  isKnown,
  isLine,
  type BoardElement,
  type BoxElement,
  type BoxType,
  type FillKey,
  type KnownElement,
  type LineElement,
  type LineEnd,
  type LineType,
  type StrokeKey,
} from "./model"

/**
 * Every editing operation of the ボード editor as a pure function: elements in, a `Patch` out (doc.ts
 * applies it and records the undo step). Coordinates are rounded to whole sheet units and kept inside the
 * limits the server accepts, so an operation can never produce an element the save would refuse.
 */

function coord(n: number): number {
  return Math.max(-BOARD_LIMITS.coordinate, Math.min(BOARD_LIMITS.coordinate, Math.round(n)))
}

function size(n: number): number {
  return Math.max(1, Math.min(BOARD_LIMITS.boxSize, Math.round(n)))
}

// ---------------------------------------------------------------------------
// Create
// ---------------------------------------------------------------------------

/** Fill and outline a new element of each type starts with. */
export const DEFAULT_STYLE: Readonly<Record<BoxType, { fill: FillKey; stroke: StrokeKey }>> = {
  rect: { fill: "white", stroke: "ink" },
  ellipse: { fill: "white", stroke: "ink" },
  text: { fill: "none", stroke: "ink" },
  sticky: { fill: "amber", stroke: "ink" },
}

/** Size of a box placed with a click (no drag). */
export const DEFAULT_BOX_SIZE: Readonly<Record<BoxType, { w: number; h: number }>> = {
  rect: { w: 160, h: 100 },
  ellipse: { w: 160, h: 100 },
  text: { w: 200, h: 40 },
  sticky: { w: 160, h: 160 },
}

/** A drag shorter than this (sheet units) counts as a click. */
export const CLICK_SLOP = 4

/** z of the next element placed on top. */
export function nextZ(elements: ElementMap): number {
  let max = 0
  for (const el of Object.values(elements)) if (el.type !== "unknown") max = Math.max(max, el.z)
  return Math.min(BOARD_LIMITS.counter, max + 1)
}

export function newBox(type: BoxType, rect: Rect, id: string, z: number, style: Partial<{ fill: FillKey; stroke: StrokeKey }> = {}): BoxElement {
  return {
    id,
    type,
    x: coord(rect.x),
    y: coord(rect.y),
    w: size(rect.w),
    h: size(rect.h),
    z,
    text: "",
    fill: style.fill ?? DEFAULT_STYLE[type].fill,
    stroke: style.stroke ?? DEFAULT_STYLE[type].stroke,
  }
}

/** The rectangle of a new box: the dragged area, or the type's default size at the click. */
export function newBoxRect(type: BoxType, from: Point, to: Point): Rect {
  const w = Math.abs(to.x - from.x)
  const h = Math.abs(to.y - from.y)
  if (w < CLICK_SLOP && h < CLICK_SLOP) return { x: from.x, y: from.y, ...DEFAULT_BOX_SIZE[type] }
  return { x: Math.min(from.x, to.x), y: Math.min(from.y, to.y), w: Math.max(w, 1), h: Math.max(h, 1) }
}

function lineEnd(point: Point, attach: string | null): LineEnd {
  return attach ? { x: coord(point.x), y: coord(point.y), attach } : { x: coord(point.x), y: coord(point.y) }
}

export function newLine(
  type: LineType,
  start: { point: Point; attach: string | null },
  end: { point: Point; attach: string | null },
  id: string,
  z: number,
  stroke: StrokeKey = "ink",
): LineElement {
  return { id, type, z, start: lineEnd(start.point, start.attach), end: lineEnd(end.point, end.attach), stroke }
}

// ---------------------------------------------------------------------------
// Move / resize
// ---------------------------------------------------------------------------

/**
 * Moves the elements by (dx, dy). A line end attached to a box that is not moving stays attached (the
 * line follows its box, not the drag); free ends and ends whose box moves too are shifted.
 */
export function movePatch(elements: ElementMap, ids: readonly string[], dx: number, dy: number): Patch {
  const patch: Record<string, BoardElement | null> = {}
  if (dx === 0 && dy === 0) return patch
  const moving = new Set(ids)
  const shift = (end: LineEnd): LineEnd => {
    const box = attachedBox(end, elements)
    if (box && !moving.has(box.id)) return end
    return { ...end, x: coord(end.x + dx), y: coord(end.y + dy) }
  }
  for (const id of ids) {
    const el = elements[id]
    if (isBox(el)) patch[id] = { ...el, x: coord(el.x + dx), y: coord(el.y + dy) }
    else if (isLine(el)) patch[id] = { ...el, start: shift(el.start), end: shift(el.end) }
  }
  return patch
}

/** Resizes one box by dragging a handle by (dx, dy). */
export function resizePatch(elements: ElementMap, id: string, handle: BoxHandle, dx: number, dy: number): Patch {
  const el = elements[id]
  if (!isBox(el)) return {}
  const rect = resizeRect(boxRect(el), handle, dx, dy)
  return { [id]: { ...el, x: coord(rect.x), y: coord(rect.y), w: size(rect.w), h: size(rect.h) } }
}

/** Puts one end of a line at `point`, attached to the box `attach` (null = free). */
export function lineEndPatch(elements: ElementMap, id: string, which: LineHandle, point: Point, attach: string | null): Patch {
  const el = elements[id]
  if (!isLine(el)) return {}
  const target = attach && attach !== id && isBox(elements[attach]) ? attach : null
  return { [id]: { ...el, [which]: lineEnd(point, target) } }
}

// ---------------------------------------------------------------------------
// Delete / copy / paste
// ---------------------------------------------------------------------------

/**
 * Deletes the elements. Lines that stay but were attached to a deleted box are detached at the point where
 * they were drawn, so they do not jump (and undo re-attaches them: they are part of the same patch).
 */
export function deletePatch(elements: ElementMap, ids: readonly string[]): Patch {
  const patch: Record<string, BoardElement | null> = {}
  const removed = new Set(ids.filter((id) => isKnown(elements[id])))
  if (removed.size === 0) return patch
  for (const id of removed) patch[id] = null
  for (const el of Object.values(elements)) {
    if (!isLine(el) || removed.has(el.id)) continue
    const startGone = !!el.start.attach && removed.has(el.start.attach)
    const endGone = !!el.end.attach && removed.has(el.end.attach)
    if (!startGone && !endGone) continue
    const { a, b } = resolveLine(el, elements)
    patch[el.id] = {
      ...el,
      start: startGone ? lineEnd(a, null) : el.start,
      end: endGone ? lineEnd(b, null) : el.end,
    }
  }
  return patch
}

/**
 * What Ctrl+C keeps: the selected elements, back to front. A line end attached to a box that is not copied
 * becomes a free end at the point where it was drawn.
 */
export function copyElements(elements: ElementMap, ids: readonly string[]): KnownElement[] {
  const selected = new Set(ids)
  const copies: KnownElement[] = []
  for (const el of sortByZ(elements)) {
    if (!selected.has(el.id) || !isKnown(el)) continue
    if (isBox(el)) {
      copies.push({ ...el })
      continue
    }
    const { a, b } = resolveLine(el, elements)
    const keep = (end: LineEnd, drawn: Point): LineEnd => (end.attach && selected.has(end.attach) && isBox(elements[end.attach]) ? { ...end } : lineEnd(drawn, null))
    copies.push({ ...el, start: keep(el.start, a), end: keep(el.end, b) })
  }
  return copies
}

/**
 * Pastes copied elements with new ids, shifted by `offset` and placed on top. Attachments between the
 * pasted elements point at the new copies. Returns the patch and the new ids (the new selection).
 */
export function pastePatch(elements: ElementMap, clip: readonly KnownElement[], makeId: () => string, offset: Point): { patch: Patch; ids: string[] } {
  const patch: Record<string, BoardElement | null> = {}
  const idMap = new Map<string, string>()
  for (const el of clip) idMap.set(el.id, makeId())
  let z = nextZ(elements)
  const ids: string[] = []
  const moveEnd = (end: LineEnd): LineEnd => {
    const attach = end.attach ? (idMap.get(end.attach) ?? null) : null
    return lineEnd({ x: end.x + offset.x, y: end.y + offset.y }, attach)
  }
  for (const el of clip) {
    const id = idMap.get(el.id) as string
    ids.push(id)
    if (isBox(el)) patch[id] = { ...el, id, z, x: coord(el.x + offset.x), y: coord(el.y + offset.y) }
    else patch[id] = { ...el, id, z, start: moveEnd(el.start), end: moveEnd(el.end) }
    z = Math.min(BOARD_LIMITS.counter, z + 1)
  }
  return { patch, ids }
}

/** How far a duplicate / paste is placed from its source. */
export const PASTE_OFFSET: Point = { x: 16, y: 16 }

// ---------------------------------------------------------------------------
// Order, style, text
// ---------------------------------------------------------------------------

/** Brings the elements to the front, or sends them to the back, keeping their order among themselves. */
export function reorderPatch(elements: ElementMap, ids: readonly string[], to: "front" | "back"): Patch {
  const patch: Record<string, BoardElement | null> = {}
  const selected = new Set(ids)
  const ordered = sortByZ(elements).filter(isKnown)
  const picked = ordered.filter((el) => selected.has(el.id))
  const rest = ordered.filter((el) => !selected.has(el.id))
  if (picked.length === 0 || rest.length === 0) return patch
  if (to === "front") {
    let z = rest[rest.length - 1].z
    for (const el of picked) {
      z = Math.min(BOARD_LIMITS.counter, z + 1)
      patch[el.id] = { ...el, z }
    }
  } else {
    let z = rest[0].z - picked.length
    for (const el of picked) {
      patch[el.id] = { ...el, z: Math.max(-BOARD_LIMITS.counter, z) }
      z += 1
    }
  }
  return patch
}

/** Sets the fill (boxes only) and / or the outline colour of the elements. */
export function stylePatch(elements: ElementMap, ids: readonly string[], style: Partial<{ fill: FillKey; stroke: StrokeKey }>): Patch {
  const patch: Record<string, BoardElement | null> = {}
  for (const id of ids) {
    const el = elements[id]
    if (isBox(el)) patch[id] = { ...el, ...(style.fill ? { fill: style.fill } : {}), ...(style.stroke ? { stroke: style.stroke } : {}) }
    else if (isLine(el) && style.stroke) patch[id] = { ...el, stroke: style.stroke }
  }
  return patch
}

/** Sets the text of a box (cut at the length the server accepts). */
export function textPatch(elements: ElementMap, id: string, text: string): Patch {
  const el = elements[id]
  if (!isBox(el)) return {}
  return { [id]: { ...el, text: text.slice(0, BOARD_LIMITS.textLength) } }
}
