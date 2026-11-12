import type { Patch } from "./doc"
import { attachedBox, boxRect, canRotate, rectCenter, resizeRect, resolveLine, rotateAround, rotationOf, sortByZ, toWorld, type BoxHandle, type ElementMap, type LineHandle, type Point, type Rect } from "./geometry"
import { BOARD_LIMITS } from "./limits"
import { normalizeRuns, runsFor, runsText, truncateRuns } from "./rich"
import { SHAPE_SIZE, type ShapeKind } from "./shapes"
import type { TextSlot } from "./style"
import {
  elementJsonLimit,
  isBox,
  isHttpUrl,
  isKnown,
  isLine,
  type BoardElement,
  type BoxElement,
  type BoxType,
  type Dash,
  type FillKey,
  type FontFamily,
  type HAlign,
  type KnownElement,
  type LineElement,
  type LineEnd,
  type LineRoute,
  type LineType,
  type Side,
  type StrokeKey,
  type TextRun,
  type TextRuns,
  type VAlign,
} from "./model"

/**
 * Every editing operation of the ボード editor as a pure function: elements in, a `Patch` out (doc.ts
 * applies it and records the undo step). Coordinates are rounded to whole sheet units and kept inside the
 * limits the server accepts, so an operation can never produce an element the save would refuse. A locked
 * element is never changed by any operation except unlocking it.
 */

function coord(n: number): number {
  return Math.max(-BOARD_LIMITS.coordinate, Math.min(BOARD_LIMITS.coordinate, Math.round(n)))
}

function size(n: number): number {
  return Math.max(1, Math.min(BOARD_LIMITS.boxSize, Math.round(n)))
}

const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n))

/** The ids that may be changed (known, not locked). */
export function unlocked(elements: ElementMap, ids: readonly string[]): string[] {
  return ids.filter((id) => {
    const el = elements[id]
    return isKnown(el) && !el.locked
  })
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
  image: { fill: "none", stroke: "gray" },
  table: { fill: "white", stroke: "gray" },
  frame: { fill: "none", stroke: "gray" },
  shape: { fill: "white", stroke: "ink" },
  timer: { fill: "white", stroke: "blue" },
}

/** Size of a box placed with a click (no drag). */
export const DEFAULT_BOX_SIZE: Readonly<Record<BoxType, { w: number; h: number }>> = {
  rect: { w: 160, h: 100 },
  ellipse: { w: 160, h: 100 },
  text: { w: 200, h: 40 },
  sticky: { w: 160, h: 160 },
  image: { w: 240, h: 160 },
  table: { w: 360, h: 96 },
  frame: { w: 640, h: 420 },
  shape: { w: 140, h: 100 },
  timer: { w: 220, h: 120 },
}

/** A box of the shape library, `kind` centred on `center`. */
export function newShape(kind: ShapeKind, center: Point, id: string, z: number): BoxElement {
  const s = SHAPE_SIZE[kind]
  return { ...newBox("shape", { x: center.x - s.w / 2, y: center.y - s.h / 2, w: s.w, h: s.h }, id, z), shape: kind }
}

/** A timer of `minutes`, stopped, centred on `center`. */
export function newTimer(minutes: number, center: Point, id: string, z: number): BoxElement {
  const s = DEFAULT_BOX_SIZE.timer
  return { ...newBox("timer", { x: center.x - s.w / 2, y: center.y - s.h / 2, w: s.w, h: s.h }, id, z), durationSec: clamp(Math.round(minutes * 60), 10, BOARD_LIMITS.timerMaxSec) }
}

/** Rows and columns of a table placed with the table tool. */
export const NEW_TABLE = { rows: 3, cols: 3 }

/** A drag shorter than this (sheet units) counts as a click. */
export const CLICK_SLOP = 4

/** z of the next element placed on top. */
export function nextZ(elements: ElementMap): number {
  let max = 0
  for (const el of Object.values(elements)) if (el.type !== "unknown") max = Math.max(max, el.z)
  return Math.min(BOARD_LIMITS.counter, max + 1)
}

/** z below everything (frames go behind what they hold). */
export function bottomZ(elements: ElementMap): number {
  let min = 0
  for (const el of Object.values(elements)) if (el.type !== "unknown") min = Math.min(min, el.z)
  return Math.max(-BOARD_LIMITS.counter, min - 1)
}

/** Splits `total` into `count` whole parts. */
function split(total: number, count: number): number[] {
  const part = Math.max(BOARD_LIMITS.tableCellMin, Math.floor(total / count))
  return Array.from({ length: count }, () => part)
}

export function newBox(type: BoxType, rect: Rect, id: string, z: number, style: Partial<{ fill: FillKey; stroke: StrokeKey }> = {}): BoxElement {
  const box: BoxElement = {
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
  if (type === "table") {
    const colWidths = split(box.w, NEW_TABLE.cols)
    const rowHeights = split(box.h, NEW_TABLE.rows)
    return withTableSize({ ...box, colWidths, rowHeights, cells: rowHeights.map(() => colWidths.map(() => "")) })
  }
  return box
}

/** The rectangle of a new box: the dragged area, or the type's default size at the click. */
export function newBoxRect(type: BoxType, from: Point, to: Point): Rect {
  const w = Math.abs(to.x - from.x)
  const h = Math.abs(to.y - from.y)
  if (w < CLICK_SLOP && h < CLICK_SLOP) return { x: from.x, y: from.y, ...DEFAULT_BOX_SIZE[type] }
  return { x: Math.min(from.x, to.x), y: Math.min(from.y, to.y), w: Math.max(w, 1), h: Math.max(h, 1) }
}

/** An image box for a stored board file, fitted inside `max` (sheet units) with its proportions kept. */
export function newImage(fileId: string, natural: { width: number; height: number }, center: Point, id: string, z: number, max = 480): BoxElement {
  const scale = Math.min(1, max / Math.max(natural.width, natural.height, 1))
  const w = Math.max(16, natural.width * scale)
  const h = Math.max(16, natural.height * scale)
  return { ...newBox("image", { x: center.x - w / 2, y: center.y - h / 2, w, h }, id, z), fileId }
}

/**
 * The end of a line where it is drawn; attached ends name the box, the side and where along it they sit (`along`
 * 0–1, stored only when it is not the middle).
 */
export function lineEnd(point: Point, attach: string | null, side: Side | null = null, along: number | null = null): LineEnd {
  const drawn = { x: coord(point.x), y: coord(point.y) }
  if (!attach) return drawn
  if (!side) return { ...drawn, attach }
  return along !== null && along !== 0.5 ? { ...drawn, attach, side, at: Math.max(0, Math.min(1, along)) } : { ...drawn, attach, side }
}

export interface LineEndInput {
  point: Point
  attach: string | null
  side?: Side | null
  /** Along the side (0–1; absent = the middle). */
  at?: number | null
}

export function newLine(type: LineType, start: LineEndInput, end: LineEndInput, id: string, z: number, stroke: StrokeKey = "ink"): LineElement {
  return {
    id,
    type,
    z,
    start: lineEnd(start.point, start.attach, start.side ?? null, start.at ?? null),
    end: lineEnd(end.point, end.attach, end.side ?? null, end.at ?? null),
    stroke,
  }
}

// ---------------------------------------------------------------------------
// Move / resize / snap
// ---------------------------------------------------------------------------

/** The value on the grid closest to `n` (grid ≤ 0: unchanged). */
export function snap(n: number, grid: number): number {
  return grid > 0 ? Math.round(n / grid) * grid : n
}

/**
 * The move (dx, dy) adjusted so the moved elements' top-left corner lands on the grid. Without a grid the
 * move is as given.
 */
export function snapMove(elements: ElementMap, ids: readonly string[], dx: number, dy: number, grid: number): Point {
  if (grid <= 0) return { x: dx, y: dy }
  let minX = Infinity
  let minY = Infinity
  for (const id of ids) {
    const el = elements[id]
    if (isBox(el)) {
      minX = Math.min(minX, el.x)
      minY = Math.min(minY, el.y)
    }
  }
  if (!Number.isFinite(minX)) return { x: snap(dx, grid), y: snap(dy, grid) }
  return { x: snap(minX + dx, grid) - minX, y: snap(minY + dy, grid) - minY }
}

/**
 * Frames carry what lies inside them: the ids plus every unlocked element whose bounds are wholly inside one of
 * the frames among the ids (a line when both its ends are inside).
 */
export function withFrameContents(elements: ElementMap, ids: readonly string[]): string[] {
  const frames = ids.map((id) => elements[id]).filter((el): el is BoxElement => isBox(el) && el.type === "frame" && !el.locked)
  if (frames.length === 0) return [...ids]
  const out = new Set(ids)
  const insideAny = (p: Point, frame: BoxElement) => p.x >= frame.x && p.y >= frame.y && p.x <= frame.x + frame.w && p.y <= frame.y + frame.h
  for (const el of Object.values(elements)) {
    if (!isKnown(el) || el.locked || out.has(el.id)) continue
    for (const frame of frames) {
      if (frame.id === el.id) continue
      let inside: boolean
      if (isBox(el)) inside = insideAny({ x: el.x, y: el.y }, frame) && insideAny({ x: el.x + el.w, y: el.y + el.h }, frame)
      else {
        const { a, b } = resolveLine(el, elements)
        inside = insideAny(a, frame) && insideAny(b, frame)
      }
      if (inside) {
        out.add(el.id)
        break
      }
    }
  }
  return [...out]
}

/**
 * Moves the elements by (dx, dy). A line end attached to a box that is not moving stays attached (the
 * line follows its box, not the drag); free ends and ends whose box moves too are shifted. Locked elements stay.
 */
export function movePatch(elements: ElementMap, ids: readonly string[], dx: number, dy: number): Patch {
  const patch: Record<string, BoardElement | null> = {}
  if (dx === 0 && dy === 0) return patch
  const free = unlocked(elements, ids)
  const moving = new Set(free)
  const shift = (end: LineEnd): LineEnd => {
    const box = attachedBox(end, elements)
    if (box && !moving.has(box.id)) return end
    return { ...end, x: coord(end.x + dx), y: coord(end.y + dy) }
  }
  for (const id of free) {
    const el = elements[id]
    if (isBox(el)) patch[id] = { ...el, x: coord(el.x + dx), y: coord(el.y + dy) }
    else if (isLine(el)) patch[id] = { ...el, start: shift(el.start), end: shift(el.end) }
  }
  return patch
}

/** A table's w / h from its column widths and row heights. */
function withTableSize(el: BoxElement): BoxElement {
  if (!el.colWidths || !el.rowHeights) return el
  return { ...el, w: size(el.colWidths.reduce((a, b) => a + b, 0)), h: size(el.rowHeights.reduce((a, b) => a + b, 0)) }
}

/** Scales a table's columns and rows to a new outer size (each at least the smallest cell). */
function scaleTable(el: BoxElement, w: number, h: number): BoxElement {
  if (!el.colWidths || !el.rowHeights) return { ...el, w, h }
  const sx = w / Math.max(1, el.w)
  const sy = h / Math.max(1, el.h)
  const colWidths = el.colWidths.map((c) => Math.max(BOARD_LIMITS.tableCellMin, Math.round(c * sx)))
  const rowHeights = el.rowHeights.map((r) => Math.max(BOARD_LIMITS.tableCellMin, Math.round(r * sy)))
  return withTableSize({ ...el, colWidths, rowHeights })
}

/** Resizes one box by dragging a handle by (dx, dy). `keepRatio` (Shift, images) keeps its proportions. */
export function resizePatch(elements: ElementMap, id: string, handle: BoxHandle, sheetDx: number, sheetDy: number, keepRatio = false): Patch {
  const el = elements[id]
  if (!isBox(el) || el.locked) return {}
  // A turned box is resized in its own upright frame: the pointer's move is turned back first.
  const turn = rotationOf(el)
  const { x: dx, y: dy } = rotateAround({ x: sheetDx, y: sheetDy }, { x: 0, y: 0 }, -turn)
  let rect = resizeRect(boxRect(el), handle, dx, dy)
  if (keepRatio && el.w > 0 && el.h > 0) {
    const ratio = el.w / el.h
    const corner = handle.length === 2
    const w = corner ? Math.max(rect.w, rect.h * ratio) : handle === "n" || handle === "s" ? rect.h * ratio : rect.w
    const h = w / ratio
    const x = handle.includes("w") ? el.x + el.w - w : handle === "n" || handle === "s" ? el.x + (el.w - w) / 2 : el.x
    const y = handle.includes("n") ? el.y + el.h - h : handle === "e" || handle === "w" ? el.y + (el.h - h) / 2 : el.y
    rect = { x, y, w, h }
  }
  if (turn !== 0) {
    // Keep the side opposite the handle where it is drawn: the new centre is the upright one turned about the old.
    const center = toWorld(el, rectCenter(rect))
    rect = { ...rect, x: center.x - rect.w / 2, y: center.y - rect.h / 2 }
  }
  const moved = { ...el, x: coord(rect.x), y: coord(rect.y) }
  return { [id]: el.type === "table" ? scaleTable(moved, size(rect.w), size(rect.h)) : { ...moved, w: size(rect.w), h: size(rect.h) } }
}

/** Turns the boxes that can turn (not locked) to `deg` (absolute) or by `deg` (relative), normalized to [0, 360). */
export function rotatePatch(elements: ElementMap, ids: readonly string[], deg: number, relative = false): Patch {
  const patch: Record<string, BoardElement> = {}
  for (const id of unlocked(elements, ids)) {
    const el = elements[id]
    if (!isBox(el) || !canRotate(el)) continue
    let next = Math.round(((relative ? rotationOf(el) + deg : deg) % 360) * 10) / 10
    if (next < 0) next += 360
    if (next >= 360) next -= 360
    if (next === rotationOf(el)) continue
    const turned: BoxElement = { ...el }
    if (next === 0) delete turned.rotation
    else turned.rotation = next
    patch[id] = turned
  }
  return patch
}

/** Puts one end of a line at `point`, attached to the box `attach` on `side` (null = free). */
export function lineEndPatch(elements: ElementMap, id: string, which: LineHandle, point: Point, attach: string | null, side: Side | null = null, along: number | null = null): Patch {
  const el = elements[id]
  if (!isLine(el) || el.locked) return {}
  const target = attach && attach !== id && isBox(elements[attach]) ? attach : null
  return { [id]: { ...el, [which]: lineEnd(point, target, target ? side : null, target ? along : null) } }
}

// ---------------------------------------------------------------------------
// Delete / copy / paste
// ---------------------------------------------------------------------------

/**
 * Deletes the elements (locked ones stay). The lines connected to a deleted box go with it (a mind-map child
 * takes its branch line along; undo brings both back: they are part of the same patch). A locked line stays,
 * detached at the point where it was drawn so it does not jump.
 */
export function deletePatch(elements: ElementMap, ids: readonly string[]): Patch {
  const patch: Record<string, BoardElement | null> = {}
  const removed = new Set(unlocked(elements, ids))
  if (removed.size === 0) return patch
  const boxesGone = [...removed].filter((id) => isBox(elements[id]))
  for (const el of Object.values(elements)) {
    if (!isLine(el) || el.locked || removed.has(el.id)) continue
    if ((el.start.attach && boxesGone.includes(el.start.attach)) || (el.end.attach && boxesGone.includes(el.end.attach))) removed.add(el.id)
  }
  for (const id of removed) patch[id] = null
  // A group left with one member is no group any more.
  const left = new Map<string, KnownElement[]>()
  for (const el of Object.values(elements)) {
    if (isKnown(el) && el.groupId && !removed.has(el.id)) left.set(el.groupId, [...(left.get(el.groupId) ?? []), el])
  }
  const touched = new Set([...removed].map((id) => (elements[id] as KnownElement).groupId).filter(Boolean))
  for (const [group, rest] of left) {
    if (!touched.has(group) || rest.length !== 1) continue
    const alone = { ...rest[0] }
    delete alone.groupId
    patch[alone.id] = alone
  }
  for (const el of Object.values(elements)) {
    if (!isLine(el) || removed.has(el.id)) continue
    const startGone = !!el.start.attach && removed.has(el.start.attach)
    const endGone = !!el.end.attach && removed.has(el.end.attach)
    if (!startGone && !endGone) continue
    const { a, b } = resolveLine(el, elements)
    // On top of what the patch already holds for it (it may have left its group above).
    const base = (patch[el.id] as LineElement | undefined) ?? el
    patch[el.id] = {
      ...base,
      start: startGone ? lineEnd(a, null) : el.start,
      end: endGone ? lineEnd(b, null) : el.end,
    }
  }
  return patch
}

/** An element without its lock (copies are never locked). */
function withoutLock<T extends KnownElement>(el: T): T {
  if (!el.locked) return { ...el }
  const copy = { ...el }
  delete copy.locked
  return copy
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
      copies.push(withoutLock(el))
      continue
    }
    const { a, b } = resolveLine(el, elements)
    const keep = (end: LineEnd, drawn: Point): LineEnd => (end.attach && selected.has(end.attach) && isBox(elements[end.attach]) ? { ...end } : lineEnd(drawn, null))
    copies.push({ ...withoutLock(el), start: keep(el.start, a), end: keep(el.end, b) })
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
  // A pasted group is a new group (not joined to the one copied); a group with one member left is no group.
  const groupMap = new Map<string, string>()
  const groupSize = new Map<string, number>()
  for (const el of clip) if (el.groupId) groupSize.set(el.groupId, (groupSize.get(el.groupId) ?? 0) + 1)
  for (const [group, count] of groupSize) if (count > 1) groupMap.set(group, makeId())
  let z = nextZ(elements)
  const ids: string[] = []
  const moveEnd = (end: LineEnd): LineEnd => {
    const attach = end.attach ? (idMap.get(end.attach) ?? null) : null
    return lineEnd({ x: end.x + offset.x, y: end.y + offset.y }, attach, attach ? (end.side ?? null) : null, attach ? (end.at ?? null) : null)
  }
  const regroup = <T extends KnownElement>(el: T): T => {
    const next = { ...el }
    const group = el.groupId ? groupMap.get(el.groupId) : undefined
    if (group) next.groupId = group
    else delete next.groupId
    return next
  }
  for (const el of clip) {
    const id = idMap.get(el.id) as string
    ids.push(id)
    if (isBox(el)) patch[id] = { ...regroup(el), id, z, x: coord(el.x + offset.x), y: coord(el.y + offset.y) }
    else patch[id] = { ...regroup(el), id, z, start: moveEnd(el.start), end: moveEnd(el.end) }
    z = Math.min(BOARD_LIMITS.counter, z + 1)
  }
  return { patch, ids }
}

/** How far a duplicate / paste is placed from its source. */
export const PASTE_OFFSET: Point = { x: 16, y: 16 }

// ---------------------------------------------------------------------------
// Order, format, text, link, lock
// ---------------------------------------------------------------------------

/** Brings the elements to the front, or sends them to the back, keeping their order among themselves. */
export function reorderPatch(elements: ElementMap, ids: readonly string[], to: "front" | "back"): Patch {
  const patch: Record<string, BoardElement | null> = {}
  const selected = new Set(unlocked(elements, ids))
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

/** Every format setting the editor offers; each applies to the elements it fits (boxes, lines, or both). */
export interface FormatChange {
  fill: FillKey
  stroke: StrokeKey
  /** Boxes. */
  fontSize: number
  fontFamily: FontFamily
  bold: boolean
  italic: boolean
  underline: boolean
  textColor: StrokeKey
  align: HAlign
  valign: VAlign
  /** Boxes (outline) and lines. */
  strokeWidth: number
  dash: Dash
  /** Lines. */
  route: LineRoute
  arrowStart: boolean
  arrowEnd: boolean
}

const BOX_KEYS = ["fill", "fontSize", "fontFamily", "bold", "italic", "underline", "textColor", "align", "valign"] as const
const LINE_KEYS = ["route", "arrowStart", "arrowEnd"] as const
const BOTH_KEYS = ["stroke", "strokeWidth", "dash"] as const

/** Sets format settings on the elements they fit (locked ones stay as they are). */
export function formatPatch(elements: ElementMap, ids: readonly string[], change: Partial<FormatChange>): Patch {
  const patch: Record<string, BoardElement | null> = {}
  const pick = (keys: readonly (keyof FormatChange)[]) => {
    const out: Record<string, unknown> = {}
    for (const key of keys) if (change[key] !== undefined) out[key] = change[key]
    return out
  }
  const boxPart = pick([...BOX_KEYS, ...BOTH_KEYS])
  const linePart = pick([...LINE_KEYS, ...BOTH_KEYS])
  if (typeof boxPart.fontSize === "number") boxPart.fontSize = clamp(Math.round(boxPart.fontSize), BOARD_LIMITS.fontSizeMin, BOARD_LIMITS.fontSizeMax)
  if (typeof boxPart.strokeWidth === "number") boxPart.strokeWidth = clamp(boxPart.strokeWidth, 0, BOARD_LIMITS.strokeWidthMax)
  if (typeof linePart.strokeWidth === "number") linePart.strokeWidth = clamp(linePart.strokeWidth, BOARD_LIMITS.lineWidthMin, BOARD_LIMITS.strokeWidthMax)
  for (const id of unlocked(elements, ids)) {
    const el = elements[id]
    if (isBox(el) && Object.keys(boxPart).length > 0) patch[id] = { ...el, ...boxPart }
    else if (isLine(el) && Object.keys(linePart).length > 0) patch[id] = { ...el, ...linePart }
  }
  return patch
}

/** Sets the fill (boxes only) and / or the outline colour of the elements. */
export function stylePatch(elements: ElementMap, ids: readonly string[], style: Partial<{ fill: FillKey; stroke: StrokeKey }>): Patch {
  return formatPatch(elements, ids, style)
}

/**
 * Plain text and runs cut to `max` characters; the runs are kept only when they add up to the text and something
 * in them is formatted.
 */
function textAndRuns(text: string, runs: readonly TextRun[] | null | undefined, max: number): { text: string; runs: TextRuns | null } {
  const plain = text.slice(0, max)
  if (!runs || runsText(runs) !== text) return { text: plain, runs: null }
  return { text: plain, runs: normalizeRuns(truncateRuns(runs, max)) }
}

/**
 * The element as the server accepts it: when its formatting makes it larger than the limit, first the runs of the
 * text just written go, then every other format run of it (the plain texts always stay).
 */
function withinJsonLimit(el: BoxElement, drop: (el: BoxElement) => BoxElement): BoxElement {
  const limit = elementJsonLimit(el.type)
  if (JSON.stringify(el).length <= limit) return el
  const first = drop(el)
  if (JSON.stringify(first).length <= limit) return first
  const plain = { ...first }
  delete plain.runs
  delete plain.bodyRuns
  delete plain.cellRuns
  return plain
}

/** True when the element lost format runs it was given (too large to store): the editor says so. */
export function formatDropped(given: readonly TextRun[] | null | undefined, stored: BoxElement | undefined, slot: TextSlot): boolean {
  if (!given || !stored || !normalizeRuns(given)) return false
  return slotContent(stored, slot).runs === null
}

/** Sets the text of a box (cut at the length the server accepts) and its format runs (none: all in the box's format). */
export function textPatch(elements: ElementMap, id: string, text: string, runs?: readonly TextRun[] | null): Patch {
  const el = elements[id]
  if (!isBox(el) || el.locked) return {}
  const value = textAndRuns(text, runs, BOARD_LIMITS.textLength)
  const next: BoxElement = { ...el, text: value.text }
  if (value.runs) next.runs = value.runs
  else delete next.runs
  return {
    [id]: withinJsonLimit(next, (big) => {
      const plain = { ...big }
      delete plain.runs
      return plain
    }),
  }
}

/** Sets the body text of a frame (what is written below its title) and its runs. */
export function bodyPatch(elements: ElementMap, id: string, text: string, runs?: readonly TextRun[] | null): Patch {
  const el = elements[id]
  if (!isBox(el) || el.type !== "frame" || el.locked) return {}
  const value = textAndRuns(text, runs, BOARD_LIMITS.textLength)
  const next: BoxElement = { ...el }
  if (value.text) next.body = value.text
  else delete next.body
  if (value.text && value.runs) next.bodyRuns = value.runs
  else delete next.bodyRuns
  return {
    [id]: withinJsonLimit(next, (big) => {
      const plain = { ...big }
      delete plain.bodyRuns
      return plain
    }),
  }
}

/** The text and runs of one text slot of a box (its text, a frame's body, a table cell). */
export function slotContent(el: BoxElement, slot: TextSlot): { text: string; runs: TextRuns | null } {
  if (slot.kind === "body") return { text: el.body ?? "", runs: runsFor(el.body ?? "", el.bodyRuns) }
  if (slot.kind === "cell") {
    const text = el.cells?.[slot.row]?.[slot.col] ?? ""
    return { text, runs: runsFor(text, el.cellRuns?.[slot.row]?.[slot.col]) }
  }
  return { text: el.text, runs: runsFor(el.text, el.runs) }
}

/** Sets the label on a line (empty = none). */
export function labelPatch(elements: ElementMap, id: string, label: string): Patch {
  const el = elements[id]
  if (!isLine(el) || el.locked) return {}
  const text = label.replace(/\s+/g, " ").trim().slice(0, BOARD_LIMITS.labelLength)
  const next: LineElement = { ...el }
  if (text) next.label = text
  else delete next.label
  return { [id]: next }
}

/** Sets (an http(s) address) or removes (null / empty) the link of the elements. Anything else changes nothing. */
export function linkPatch(elements: ElementMap, ids: readonly string[], link: string | null): Patch {
  const patch: Record<string, BoardElement | null> = {}
  const value = link?.trim() ?? ""
  if (value !== "" && (!isHttpUrl(value) || value.length > BOARD_LIMITS.linkLength)) return patch
  for (const id of unlocked(elements, ids)) {
    const next = { ...(elements[id] as KnownElement) }
    if (value) next.link = value
    else delete next.link
    patch[id] = next
  }
  return patch
}

/** Locks or unlocks the elements. */
export function lockPatch(elements: ElementMap, ids: readonly string[], locked: boolean): Patch {
  const patch: Record<string, BoardElement | null> = {}
  for (const id of ids) {
    const el = elements[id]
    if (!isKnown(el)) continue
    const next = { ...el }
    if (locked) next.locked = true
    else delete next.locked
    patch[id] = next
  }
  return patch
}

// ---------------------------------------------------------------------------
// Align / distribute
// ---------------------------------------------------------------------------

export type AlignHow = "left" | "center" | "right" | "top" | "middle" | "bottom"

/** Lines the boxes up on the selection's left / centre / right edge or top / middle / bottom (2 or more boxes). */
export function alignPatch(elements: ElementMap, ids: readonly string[], how: AlignHow): Patch {
  const boxes = unlocked(elements, ids)
    .map((id) => elements[id])
    .filter(isBox)
  const patch: Record<string, BoardElement | null> = {}
  if (boxes.length < 2) return patch
  const left = Math.min(...boxes.map((b) => b.x))
  const right = Math.max(...boxes.map((b) => b.x + b.w))
  const top = Math.min(...boxes.map((b) => b.y))
  const bottom = Math.max(...boxes.map((b) => b.y + b.h))
  for (const b of boxes) {
    let { x, y } = b
    if (how === "left") x = left
    else if (how === "right") x = right - b.w
    else if (how === "center") x = (left + right) / 2 - b.w / 2
    else if (how === "top") y = top
    else if (how === "bottom") y = bottom - b.h
    else y = (top + bottom) / 2 - b.h / 2
    const next = { ...b, x: coord(x), y: coord(y) }
    if (next.x !== b.x || next.y !== b.y) patch[b.id] = next
  }
  return patch
}

/** Spaces the boxes evenly between the first and the last along the axis (3 or more boxes). */
export function distributePatch(elements: ElementMap, ids: readonly string[], axis: "horizontal" | "vertical"): Patch {
  const boxes = unlocked(elements, ids)
    .map((id) => elements[id])
    .filter(isBox)
  const patch: Record<string, BoardElement | null> = {}
  if (boxes.length < 3) return patch
  const horizontal = axis === "horizontal"
  const sorted = [...boxes].sort((a, b) => (horizontal ? a.x - b.x : a.y - b.y))
  const start = horizontal ? sorted[0].x : sorted[0].y
  const last = sorted[sorted.length - 1]
  const end = horizontal ? last.x + last.w : last.y + last.h
  const total = sorted.reduce((sum, b) => sum + (horizontal ? b.w : b.h), 0)
  const gap = (end - start - total) / (sorted.length - 1)
  let at = start
  for (const b of sorted) {
    const next = horizontal ? { ...b, x: coord(at) } : { ...b, y: coord(at) }
    if (next.x !== b.x || next.y !== b.y) patch[b.id] = next
    at += (horizontal ? b.w : b.h) + gap
  }
  return patch
}

// ---------------------------------------------------------------------------
// Tables
// ---------------------------------------------------------------------------

/** Width of a column for the longest text in it (a rough measure: full-width characters count double). */
function columnWidth(texts: readonly string[], fontSize: number): number {
  let longest = 0
  for (const text of texts) {
    for (const line of text.split("\n")) {
      let units = 0
      for (const ch of line) units += /[　-鿿＀-￯]/.test(ch) ? 2 : 1
      longest = Math.max(longest, units)
    }
  }
  return clamp(Math.round(longest * fontSize * 0.55 + 16), 48, 360)
}

/**
 * A table element from pasted cells (Excel / a spreadsheet: rows of cells). Cut to the limits the server accepts;
 * columns are sized to their text, rows to their line count. Null when nothing is left.
 */
export function newTableFromCells(cells: readonly (readonly string[])[], at: Point, id: string, z: number, fontSize = 14): BoxElement | null {
  const rows = cells.slice(0, BOARD_LIMITS.tableRows).map((row) => row.slice(0, BOARD_LIMITS.tableCols).map((c) => c.slice(0, BOARD_LIMITS.tableCellLength)))
  const cols = Math.max(0, ...rows.map((r) => r.length))
  if (rows.length === 0 || cols === 0) return null
  const grid = rows.map((r) => Array.from({ length: cols }, (_, i) => r[i] ?? ""))
  const colWidths = Array.from({ length: cols }, (_, c) => columnWidth(grid.map((r) => r[c]), fontSize))
  const rowHeights = grid.map((r) => Math.round(Math.max(1, ...r.map((c) => c.split("\n").length)) * fontSize * 1.4 + 12))
  return withTableSize({ ...newBox("table", { x: at.x, y: at.y, w: 1, h: 1 }, id, z), colWidths, rowHeights, cells: grid })
}

/** A table's cell runs in the shape of its cells (null where a cell has none); absent when no cell has any. */
function fitCellRuns(cells: readonly (readonly string[])[], cellRuns: readonly (readonly (TextRuns | null)[])[] | undefined): (TextRuns | null)[][] | undefined {
  if (!cellRuns) return undefined
  let any = false
  const out = cells.map((row, i) =>
    row.map((text, j) => {
      const runs = runsFor(text, cellRuns[i]?.[j] ?? null)
      if (runs) any = true
      return runs
    }),
  )
  return any ? out : undefined
}

/** The table with `cellRuns` matching its cells (dropped when nothing is formatted or the table would be too large). */
function withCellRuns(el: BoxElement, cellRuns: (TextRuns | null)[][] | undefined): BoxElement {
  const next: BoxElement = { ...el }
  const fitted = next.cells ? fitCellRuns(next.cells, cellRuns) : undefined
  if (fitted) next.cellRuns = fitted
  else delete next.cellRuns
  return withinJsonLimit(next, (big) => {
    const plain = { ...big }
    delete plain.cellRuns
    return plain
  })
}

/** Sets the text of one cell and its format runs. */
export function cellPatch(elements: ElementMap, id: string, row: number, col: number, text: string, runs?: readonly TextRun[] | null): Patch {
  const el = elements[id]
  if (!isBox(el) || el.type !== "table" || el.locked || !el.cells?.[row] || col >= el.cells[row].length) return {}
  const value = textAndRuns(text, runs, BOARD_LIMITS.tableCellLength)
  const cells = el.cells.map((r, i) => (i === row ? r.map((c, j) => (j === col ? value.text : c)) : r))
  const cellRuns = el.cells.map((r, i) => r.map((c, j) => (i === row && j === col ? value.runs : runsFor(c, el.cellRuns?.[i]?.[j] ?? null))))
  return { [id]: withCellRuns({ ...el, cells }, cellRuns) }
}

/** Sets the width of one column / the height of one row of a table (the table grows or shrinks with it). */
export function tableTrackPatch(elements: ElementMap, id: string, axis: "col" | "row", index: number, length: number): Patch {
  const el = elements[id]
  if (!isBox(el) || el.type !== "table" || el.locked || !el.colWidths || !el.rowHeights) return {}
  const tracks = axis === "col" ? el.colWidths : el.rowHeights
  if (index < 0 || index >= tracks.length) return {}
  const value = clamp(Math.round(length), BOARD_LIMITS.tableCellMin, BOARD_LIMITS.boxSize)
  if (value === tracks[index]) return {}
  const next = tracks.map((t, i) => (i === index ? value : t))
  return { [id]: withTableSize(axis === "col" ? { ...el, colWidths: next } : { ...el, rowHeights: next }) }
}

/**
 * The column / row border of a table at a point (within `tolerance`), or null: the line between column `index` and
 * the next (the table's right edge for the last column), likewise for rows.
 */
export function tableBorderAt(el: BoxElement, p: Point, tolerance: number): { axis: "col" | "row"; index: number; start: number } | null {
  if (el.type !== "table" || !el.colWidths || !el.rowHeights) return null
  const inside = (v: number, from: number, to: number) => v >= from - tolerance && v <= to + tolerance
  if (!inside(p.x, el.x, el.x + el.w) || !inside(p.y, el.y, el.y + el.h)) return null
  let x = el.x
  for (let j = 0; j < el.colWidths.length; j++) {
    x += el.colWidths[j]
    if (Math.abs(p.x - x) <= tolerance) return { axis: "col", index: j, start: el.colWidths[j] }
  }
  let y = el.y
  for (let i = 0; i < el.rowHeights.length; i++) {
    y += el.rowHeights[i]
    if (Math.abs(p.y - y) <= tolerance) return { axis: "row", index: i, start: el.rowHeights[i] }
  }
  return null
}

export type TableEdit = "row-above" | "row-below" | "row-delete" | "col-left" | "col-right" | "col-delete"

/** Adds or removes a row / column next to the cell (a table keeps at least one of each, at most the limits). */
export function tablePatch(elements: ElementMap, id: string, row: number, col: number, edit: TableEdit): Patch {
  const el = elements[id]
  if (!isBox(el) || el.type !== "table" || el.locked || !el.cells || !el.colWidths || !el.rowHeights) return {}
  let { cells, colWidths, rowHeights } = el
  const source = el.cells
  let runs: (TextRuns | null)[][] = source.map((r, i) => r.map((c, j) => runsFor(c, el.cellRuns?.[i]?.[j] ?? null)))
  const rowsN = cells.length
  const colsN = colWidths.length
  if (edit === "row-above" || edit === "row-below") {
    if (rowsN >= BOARD_LIMITS.tableRows) return {}
    const at = edit === "row-above" ? row : row + 1
    cells = [...cells.slice(0, at), colWidths.map(() => ""), ...cells.slice(at)]
    runs = [...runs.slice(0, at), colWidths.map(() => null), ...runs.slice(at)]
    rowHeights = [...rowHeights.slice(0, at), rowHeights[Math.min(row, rowsN - 1)] ?? 32, ...rowHeights.slice(at)]
  } else if (edit === "row-delete") {
    if (rowsN <= 1) return {}
    cells = cells.filter((_, i) => i !== row)
    runs = runs.filter((_, i) => i !== row)
    rowHeights = rowHeights.filter((_, i) => i !== row)
  } else if (edit === "col-left" || edit === "col-right") {
    if (colsN >= BOARD_LIMITS.tableCols) return {}
    const at = edit === "col-left" ? col : col + 1
    cells = cells.map((r) => [...r.slice(0, at), "", ...r.slice(at)])
    runs = runs.map((r) => [...r.slice(0, at), null, ...r.slice(at)])
    colWidths = [...colWidths.slice(0, at), colWidths[Math.min(col, colsN - 1)] ?? 96, ...colWidths.slice(at)]
  } else {
    if (colsN <= 1) return {}
    cells = cells.map((r) => r.filter((_, j) => j !== col))
    runs = runs.map((r) => r.filter((_, j) => j !== col))
    colWidths = colWidths.filter((_, j) => j !== col)
  }
  return { [id]: withCellRuns(withTableSize({ ...el, cells, colWidths, rowHeights }), runs) }
}

/** The cell of a table under a point (sheet coordinates), or null. */
export function cellAt(el: BoxElement, p: Point): { row: number; col: number } | null {
  if (el.type !== "table" || !el.colWidths || !el.rowHeights) return null
  let x = el.x
  let col = -1
  for (let j = 0; j < el.colWidths.length; j++) {
    if (p.x >= x && p.x <= x + el.colWidths[j]) {
      col = j
      break
    }
    x += el.colWidths[j]
  }
  let y = el.y
  let row = -1
  for (let i = 0; i < el.rowHeights.length; i++) {
    if (p.y >= y && p.y <= y + el.rowHeights[i]) {
      row = i
      break
    }
    y += el.rowHeights[i]
  }
  return row >= 0 && col >= 0 ? { row, col } : null
}

/** The rectangle of one cell (sheet coordinates). */
export function cellRect(el: BoxElement, row: number, col: number): Rect | null {
  if (!el.colWidths || !el.rowHeights || row >= el.rowHeights.length || col >= el.colWidths.length) return null
  const x = el.x + el.colWidths.slice(0, col).reduce((a, b) => a + b, 0)
  const y = el.y + el.rowHeights.slice(0, row).reduce((a, b) => a + b, 0)
  return { x, y, w: el.colWidths[col], h: el.rowHeights[row] }
}

// ---------------------------------------------------------------------------
// Groups
// ---------------------------------------------------------------------------

/** The ids plus every element in a group with one of them: a group is selected and moved as one. */
export function expandGroups(elements: ElementMap, ids: readonly string[]): string[] {
  const groups = new Set<string>()
  for (const id of ids) {
    const el = elements[id]
    if (isKnown(el) && el.groupId) groups.add(el.groupId)
  }
  if (groups.size === 0) return [...ids]
  const out = new Set(ids)
  for (const el of Object.values(elements)) if (isKnown(el) && el.groupId && groups.has(el.groupId)) out.add(el.id)
  return [...out]
}

/** Makes the elements one group (two or more; a member of another group leaves it). Locked elements join too. */
export function groupPatch(elements: ElementMap, ids: readonly string[], groupId: string): Patch {
  const members = ids.filter((id) => isKnown(elements[id]))
  const patch: Record<string, BoardElement | null> = {}
  if (members.length < 2) return patch
  for (const id of members) patch[id] = { ...(elements[id] as KnownElement), groupId }
  // A group left with a single member is no group any more.
  const left = new Map<string, string[]>()
  for (const el of Object.values(elements)) {
    if (!isKnown(el) || !el.groupId || members.includes(el.id)) continue
    left.set(el.groupId, [...(left.get(el.groupId) ?? []), el.id])
  }
  const touched = new Set(members.map((id) => (elements[id] as KnownElement).groupId).filter(Boolean))
  for (const [group, rest] of left) {
    if (!touched.has(group) || rest.length !== 1) continue
    const alone = { ...(elements[rest[0]] as KnownElement) }
    delete alone.groupId
    patch[alone.id] = alone
  }
  return patch
}

/** Takes the elements' groups apart (every member of a group one of them is in). */
export function ungroupPatch(elements: ElementMap, ids: readonly string[]): Patch {
  const patch: Record<string, BoardElement | null> = {}
  for (const id of expandGroups(elements, ids)) {
    const el = elements[id]
    if (!isKnown(el) || !el.groupId) continue
    const next = { ...el }
    delete next.groupId
    patch[id] = next
  }
  return patch
}

// ---------------------------------------------------------------------------
// Votes
// ---------------------------------------------------------------------------

/** The vote budget of the sheet: set on a timer on it (null: one vote per sticky note, given and taken back). */
export function voteBudgetOf(elements: ElementMap): number | null {
  for (const el of Object.values(elements)) if (isBox(el) && el.type === "timer" && el.voteBudget) return el.voteBudget
  return null
}

/** Votes one person has given on the sheet. */
export function votesUsed(elements: ElementMap, userId: string): number {
  let used = 0
  for (const el of Object.values(elements)) if (isBox(el) && el.type === "sticky") used += (el.voters ?? []).filter((v) => v === userId).length
  return used
}

/**
 * A person's vote on a sticky note. Without a budget it is given or taken back ("toggle"); with a budget on the sheet
 * one more is given ("add", while some are left — several on one note are allowed) or one taken back ("remove").
 */
export function votePatch(elements: ElementMap, id: string, userId: string, mode: "toggle" | "add" | "remove" = "toggle"): Patch {
  const el = elements[id]
  if (!isBox(el) || el.type !== "sticky" || el.locked || !userId) return {}
  const voters = el.voters ?? []
  const budget = voteBudgetOf(elements)
  let next: string[]
  // Under a budget a toggle adds while votes are left, otherwise takes one of this person's back.
  const spent = budget !== null && votesUsed(elements, userId) >= budget
  if (mode === "remove" || (mode === "toggle" && voters.includes(userId) && (budget === null || spent))) {
    const at = voters.lastIndexOf(userId)
    if (at < 0) return {}
    next = [...voters.slice(0, at), ...voters.slice(at + 1)]
  } else {
    if (budget === null && voters.includes(userId)) return {}
    if (budget !== null && votesUsed(elements, userId) >= budget) return {}
    next = [...voters, userId].slice(0, BOARD_LIMITS.votersPerSticky)
  }
  const out: BoxElement = { ...el }
  if (next.length > 0) out.voters = next
  else delete out.voters
  return { [id]: out }
}

/** Lines the sticky notes up by votes (most first), row by row from where they are now. */
export function sortByVotesPatch(elements: ElementMap, ids: readonly string[], gap = 16): Patch {
  const notes = unlocked(elements, ids)
    .map((id) => elements[id])
    .filter((el): el is BoxElement => isBox(el) && el.type === "sticky")
  const patch: Record<string, BoardElement | null> = {}
  if (notes.length < 2) return patch
  const left = Math.min(...notes.map((n) => n.x))
  const top = Math.min(...notes.map((n) => n.y))
  const cols = Math.ceil(Math.sqrt(notes.length))
  const cellW = Math.max(...notes.map((n) => n.w)) + gap
  const cellH = Math.max(...notes.map((n) => n.h)) + gap
  // Stable: equal votes keep their reading order (top to bottom, left to right).
  const ordered = [...notes].sort((a, b) => (b.voters?.length ?? 0) - (a.voters?.length ?? 0) || a.y - b.y || a.x - b.x)
  ordered.forEach((note, i) => {
    const x = coord(left + (i % cols) * cellW)
    const y = coord(top + Math.floor(i / cols) * cellH)
    if (x !== note.x || y !== note.y) patch[note.id] = { ...note, x, y }
  })
  return patch
}

// ---------------------------------------------------------------------------
// Timer
// ---------------------------------------------------------------------------

export type TimerAction = { kind: "start" } | { kind: "pause" } | { kind: "reset" } | { kind: "duration"; sec: number } | { kind: "budget"; votes: number | null }

/** Seconds left on a timer at `now` (ms). */
export function timerLeft(el: BoxElement, now: number): number {
  const full = el.durationSec ?? 300
  if (el.endsAt !== undefined) return Math.max(0, (el.endsAt - now) / 1000)
  return el.remainingSec ?? full
}

/** Starts, pauses or resets a timer, or sets its length or the sheet's vote budget. Everyone sees the same countdown. */
export function timerPatch(elements: ElementMap, id: string, action: TimerAction, now: number): Patch {
  const el = elements[id]
  if (!isBox(el) || el.type !== "timer" || el.locked) return {}
  const next: BoxElement = { ...el }
  switch (action.kind) {
    case "start": {
      const left = timerLeft(el, now)
      next.endsAt = Math.round(now + (left > 0 ? left : (el.durationSec ?? 300)) * 1000)
      delete next.remainingSec
      break
    }
    case "pause":
      if (el.endsAt === undefined) return {}
      next.remainingSec = Math.round(timerLeft(el, now) * 10) / 10
      delete next.endsAt
      break
    case "reset":
      delete next.endsAt
      delete next.remainingSec
      break
    case "duration":
      next.durationSec = clamp(Math.round(action.sec), 10, BOARD_LIMITS.timerMaxSec)
      delete next.endsAt
      delete next.remainingSec
      break
    case "budget":
      if (action.votes === null) delete next.voteBudget
      else next.voteBudget = clamp(Math.round(action.votes), 1, BOARD_LIMITS.voteBudgetMax)
      break
  }
  return { [id]: next }
}

// ---------------------------------------------------------------------------
// PBI links and AI results
// ---------------------------------------------------------------------------

/** Links a box to a backlog item (null: unlinks it). Only the id is stored. */
export function pbiPatch(elements: ElementMap, id: string, pbiId: string | null): Patch {
  const el = elements[id]
  if (!isBox(el) || el.locked) return {}
  const next: BoxElement = { ...el }
  if (pbiId) next.pbiId = pbiId
  else delete next.pbiId
  return { [id]: next }
}

/** A text box with `text`, to the right of the given elements (the AI's summary of them). */
export function besidePatch(elements: ElementMap, ids: readonly string[], text: string, makeId: () => string): { patch: Patch; id: string } | null {
  const bounds = boundsOfBoxes(elements, ids)
  if (!bounds) return null
  const id = makeId()
  const box = newBox("text", { x: bounds.x + bounds.w + 60, y: bounds.y, w: 360, h: Math.max(120, Math.min(600, 24 + text.split("\n").length * 22)) }, id, nextZ(elements))
  return { patch: { [id]: { ...box, text: text.slice(0, BOARD_LIMITS.textLength), fill: "sky", strokeWidth: 1 } }, id }
}

function boundsOfBoxes(elements: ElementMap, ids: readonly string[]): Rect | null {
  const boxes = ids.map((id) => elements[id]).filter(isBox)
  if (boxes.length === 0) return null
  const x = Math.min(...boxes.map((b) => b.x))
  const y = Math.min(...boxes.map((b) => b.y))
  return { x, y, w: Math.max(...boxes.map((b) => b.x + b.w)) - x, h: Math.max(...boxes.map((b) => b.y + b.h)) - y }
}

/**
 * The notes `noteIds` sorted into one frame per group (the AI's grouping), the frames side by side to the right of
 * where the notes were, each titled with its group's theme. `groups[i].items` index into `noteIds`.
 */
export function groupFramesPatch(elements: ElementMap, noteIds: readonly string[], groups: readonly { title: string; items: readonly number[] }[], makeId: () => string): { patch: Patch; frameIds: string[] } {
  const bounds = boundsOfBoxes(elements, noteIds)
  const patch: Record<string, BoardElement | null> = {}
  const frameIds: string[] = []
  if (!bounds) return { patch, frameIds }
  const gap = 16
  const notes = noteIds.map((id) => elements[id]).filter((el): el is BoxElement => isBox(el) && !el.locked)
  const cellW = Math.max(120, ...notes.map((n) => n.w)) + gap
  const cellH = Math.max(80, ...notes.map((n) => n.h)) + gap
  let x = bounds.x + bounds.w + 80
  let z = bottomZ(elements)
  for (const group of groups) {
    const members = group.items.map((i) => elements[noteIds[i]]).filter((el): el is BoxElement => isBox(el) && !el.locked)
    if (members.length === 0) continue
    const cols = Math.min(3, Math.max(1, Math.ceil(Math.sqrt(members.length))))
    const rows = Math.ceil(members.length / cols)
    const frameId = makeId()
    const w = cols * cellW + gap
    const h = rows * cellH + gap + 28
    patch[frameId] = { ...newBox("frame", { x, y: bounds.y, w, h }, frameId, z), text: group.title.slice(0, 120), fill: "gray" }
    z = Math.max(-BOARD_LIMITS.counter, z - 1)
    members.forEach((note, i) => {
      patch[note.id] = { ...note, x: coord(x + gap + (i % cols) * cellW), y: coord(bounds.y + 28 + gap + Math.floor(i / cols) * cellH) }
    })
    frameIds.push(frameId)
    x += w + 40
  }
  return { patch, frameIds }
}

// ---------------------------------------------------------------------------
// Connect
// ---------------------------------------------------------------------------

/** An arrow from the first box to the second (each end on the side facing the other). Null when not two boxes. */
export function connectPatch(elements: ElementMap, ids: readonly string[], makeId: () => string, type: LineType = "arrow"): { patch: Patch; id: string } | null {
  const boxes = ids.map((id) => elements[id]).filter((el): el is BoxElement => isBox(el) && el.type !== "frame")
  if (boxes.length !== 2) return null
  const [a, b] = boxes
  const id = makeId()
  const center = (box: BoxElement) => ({ x: box.x + box.w / 2, y: box.y + box.h / 2 })
  const line = newLine(type, { point: center(a), attach: a.id }, { point: center(b), attach: b.id }, id, nextZ(elements))
  return { patch: { [id]: line }, id }
}
