"use client"

import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react"
import { flushSync } from "react-dom"
import type { Patch } from "@/lib/board/doc"
import {
  boxHandlePoints,
  boxRect,
  BOX_HANDLES,
  elementBounds,
  elementsInRect,
  hitBoxHandle,
  hitLineHandle,
  hitTest,
  lineGeometry,
  rectFromPoints,
  sidePoint,
  snapTarget,
  sortByZ,
  type BoxHandle,
  type ElementMap,
  type LineHandle,
  type Point,
  type Rect,
  type SnapTarget,
} from "@/lib/board/geometry"
import { isBox, isHttpUrl, isKnown, isLine, SIDES, type BoardElement, type BoxElement, type KnownElement, type LineType } from "@/lib/board/model"
import { cellAt, cellRect, CLICK_SLOP, lineEndPatch, movePatch, newBox, newBoxRect, newLine, resizePatch, snap, snapMove, withFrameContents } from "@/lib/board/ops"
import { FILL_COLOR } from "@/lib/board/palette"
import { textStyle } from "@/lib/board/style"
import { panBy, toScreen, toSheet, wheelZoom, zoomAt, type Viewport } from "@/lib/board/viewport"
import { useLanguage } from "@/lib/language-context"
import { cn, VisuallyHidden } from "@/components/ui"
import { describable, describeElement, selectionAnnouncement, stepSelection } from "./describe"
import { ElementView, lineEndsOf, TEXT_PADDING, textCss } from "./element-view"
import { DEFAULT_LINE_LENGTH, isBoxTool, type BoardEditorController, type DrawBoxType, type EditTarget } from "./use-board-editor"

/** How close (screen pixels) the pointer has to be to pick an element / a handle. */
const HIT_TOLERANCE = 6
const HANDLE_TOLERANCE = 12
const HANDLE_SIZE = 8
/** How close (screen pixels) a line end has to come to a shape to connect to it. */
const SNAP_REACH = 16
/** Spacing of the background dots (sheet units). */
const GRID = 24
const GHOST_ID = "ghost-element"

type Drag =
  | { kind: "pan"; last: Point }
  | { kind: "move"; start: Point; ids: readonly string[]; moved: boolean }
  | { kind: "resize"; id: string; handle: BoxHandle; start: Point }
  | { kind: "line-end"; id: string; which: LineHandle }
  | { kind: "marquee"; start: Point; base: readonly string[] }
  | { kind: "create-box"; type: DrawBoxType; start: Point }
  | { kind: "create-line"; type: LineType; start: Point; target: SnapTarget | null }

const HANDLE_CURSOR: Record<BoxHandle, string> = {
  nw: "nwse-resize",
  se: "nwse-resize",
  ne: "nesw-resize",
  sw: "nesw-resize",
  n: "ns-resize",
  s: "ns-resize",
  e: "ew-resize",
  w: "ew-resize",
}

/** The elements with an uncommitted change (the drag in progress) applied. */
function withPatch(elements: ElementMap, patch: Patch | null): ElementMap {
  if (!patch) return elements
  const next: Record<string, BoardElement> = { ...elements }
  for (const [id, el] of Object.entries(patch)) {
    if (el === null) delete next[id]
    else next[id] = el
  }
  return next
}

function screenRect(viewport: Viewport, rect: Rect): Rect {
  const p = toScreen(viewport, { x: rect.x, y: rect.y })
  return { x: p.x, y: p.y, w: rect.w * viewport.zoom, h: rect.h * viewport.zoom }
}

/** A key that types a character (not a shortcut, not a navigation key). */
function typesText(e: React.KeyboardEvent): boolean {
  if (e.ctrlKey || e.metaKey || e.altKey) return false
  return e.key.length === 1 || e.key === "Process"
}

interface BoardCanvasProps {
  editor: BoardEditorController
  /** Accessible name of the canvas (names the sheet). */
  label: string
}

/**
 * The drawing surface: SVG for the elements, an HTML textarea over the text being edited. Pointer, keyboard and
 * clipboard input is turned into the editor's commands; a drag shows its result as a preview and becomes one undo
 * step when the button is released. Line ends brought near a shape connect to the middle of its nearest side.
 */
export function BoardCanvas({ editor, label }: BoardCanvasProps) {
  const { t } = useLanguage()
  const { elements, viewport, selection, tool, readOnly, editing, reportCanvasSize, setViewport, grid, activeCell } = editor
  const rootRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<Drag | null>(null)
  /** The pointer that started the drag: a second finger or a pen does not end or steer it. */
  const pointerRef = useRef<number | null>(null)
  /** The last pointer position over the canvas (sheet units): where a paste lands. */
  const lastPointRef = useRef<Point | null>(null)
  const contentsId = useId()
  const [preview, setPreview] = useState<Patch | null>(null)
  const [marquee, setMarquee] = useState<Rect | null>(null)
  const [ghost, setGhost] = useState<KnownElement | null>(null)
  /** The shape a line end would connect to now (its side midpoints are shown). */
  const [snapHint, setSnapHint] = useState<SnapTarget | null>(null)
  const [spaceDown, setSpaceDown] = useState(false)
  const [panning, setPanning] = useState(false)
  const helpId = useId()

  const shown = useMemo(() => withPatch(elements, preview), [elements, preview])
  const ordered = useMemo(() => sortByZ(shown), [shown])
  /** What can be selected, back to front: the order of ] / [ and of the contents list. */
  const listed = useMemo(() => describable(sortByZ(elements)), [elements])
  const order = useMemo(() => listed.map((el) => el.id), [listed])
  const editingEl = editing ? shown[editing.id] : undefined

  // The canvas size: the first report fits the view, later ones keep the zoom buttons centred.
  const reportSize = useRef(reportCanvasSize)
  useEffect(() => {
    reportSize.current = reportCanvasSize
  })
  useEffect(() => {
    const root = rootRef.current
    if (!root || typeof ResizeObserver === "undefined") return
    const observer = new ResizeObserver((entries) => {
      const box = entries[0]?.contentRect
      if (box) reportSize.current({ width: box.width, height: box.height })
    })
    observer.observe(root)
    return () => observer.disconnect()
  }, [])

  // Wheel: Ctrl + wheel (and the touchpad pinch) zooms at the pointer, a plain wheel / two-finger scroll
  // pans. Registered by hand because the page must not scroll or zoom (a React wheel handler is passive).
  useEffect(() => {
    const root = rootRef.current
    if (!root) return
    function onWheel(e: WheelEvent) {
      e.preventDefault()
      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
      const anchor = { x: e.clientX - rect.left, y: e.clientY - rect.top }
      const unit = e.deltaMode === 1 ? 16 : 1
      const dx = e.deltaX * unit
      const dy = e.deltaY * unit
      if (e.ctrlKey || e.metaKey) setViewport((v) => zoomAt(v, anchor, wheelZoom(v.zoom, dy)))
      else if (e.shiftKey && dx === 0) setViewport((v) => panBy(v, -dy, 0))
      else setViewport((v) => panBy(v, -dx, -dy))
    }
    root.addEventListener("wheel", onWheel, { passive: false })
    return () => root.removeEventListener("wheel", onWheel)
  }, [setViewport])

  function pointOf(e: { clientX: number; clientY: number }): { screen: Point; sheet: Point } {
    const rect = rootRef.current?.getBoundingClientRect()
    const screen = { x: e.clientX - (rect?.left ?? 0), y: e.clientY - (rect?.top ?? 0) }
    return { screen, sheet: toSheet(viewport, screen) }
  }

  const reach = SNAP_REACH / viewport.zoom
  const onGrid = (p: Point): Point => ({ x: snap(p.x, grid), y: snap(p.y, grid) })

  function endDrag() {
    dragRef.current = null
    pointerRef.current = null
    setPreview(null)
    setMarquee(null)
    setGhost(null)
    setSnapHint(null)
    setPanning(false)
  }

  /** The end of a line at the pointer: the side midpoint of a shape within reach, or the (grid) point itself. */
  function lineEndAt(sheet: Point, exclude: readonly string[]): { point: Point; attach: string | null; side: SnapTarget["side"] | null; target: SnapTarget | null } {
    const target = snapTarget(elements, sheet, reach, exclude)
    if (target) return { point: target.point, attach: target.id, side: target.side, target }
    return { point: onGrid(sheet), attach: null, side: null, target: null }
  }

  function openLink(id: string): boolean {
    const el = elements[id]
    const link = isKnown(el) ? el.link : undefined
    // Checked again here: only http(s) is ever opened, whatever the stored data says.
    if (!link || !isHttpUrl(link)) return false
    window.open(link, "_blank", "noopener,noreferrer")
    return true
  }

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (dragRef.current || (e.target as HTMLElement).closest("textarea,a")) return
    // The keyboard commands follow the pointer: the canvas has the focus from the first click.
    rootRef.current?.focus({ preventScroll: true })
    const { screen, sheet } = pointOf(e)
    const start = (drag: Drag) => {
      dragRef.current = drag
      pointerRef.current = e.pointerId
      // Not in every environment (old browsers, jsdom); the drag also works while the pointer stays inside.
      if (typeof e.currentTarget.setPointerCapture === "function") e.currentTarget.setPointerCapture(e.pointerId)
    }

    if (e.button === 1 || (e.button === 0 && (spaceDown || (readOnly && !(e.ctrlKey || e.metaKey))))) {
      e.preventDefault()
      setPanning(true)
      return start({ kind: "pan", last: screen })
    }
    if (e.button !== 0) return

    if (tool !== "select") {
      if (isBoxTool(tool)) return start({ kind: "create-box", type: tool, start: onGrid(sheet) })
      const end = lineEndAt(sheet, [])
      setSnapHint(end.target)
      return start({ kind: "create-line", type: tool, start: end.point, target: end.target })
    }

    // The handles of the one selected element come first: they stick out of it.
    if (selection.length === 1 && !readOnly) {
      const el = elements[selection[0]]
      const handleReach = HANDLE_TOLERANCE / viewport.zoom
      if (isBox(el) && !el.locked) {
        const handle = hitBoxHandle(boxRect(el), sheet, handleReach)
        if (handle) return start({ kind: "resize", id: el.id, handle, start: sheet })
      } else if (isLine(el) && !el.locked) {
        const which = hitLineHandle(el, elements, sheet, handleReach)
        if (which) return start({ kind: "line-end", id: el.id, which })
      }
    }

    const hit = hitTest(elements, sheet, HIT_TOLERANCE / viewport.zoom)
    // Ctrl / ⌘ + click follows the element's link (also on a view-only board).
    if (hit !== null && (e.ctrlKey || e.metaKey) && openLink(hit)) return
    if (readOnly) {
      editor.select(hit === null ? [] : [hit])
      return
    }
    if (hit === null) {
      if (!e.shiftKey) editor.select([])
      return start({ kind: "marquee", start: sheet, base: e.shiftKey ? selection : [] })
    }
    let ids: readonly string[] = selection
    if (e.shiftKey) {
      ids = selection.includes(hit) ? selection.filter((id) => id !== hit) : [...selection, hit]
      editor.select(ids)
      if (!ids.includes(hit)) return
    } else if (!selection.includes(hit)) {
      ids = [hit]
      editor.select(ids)
    }
    // A click in a table picks the cell the row / column buttons act on.
    const target = elements[hit]
    if (isBox(target) && target.type === "table" && ids.length === 1) {
      const cell = cellAt(target, sheet)
      editor.setActiveCell(cell ? { id: hit, ...cell } : null)
    }
    // A frame carries what lies inside it.
    start({ kind: "move", start: sheet, ids: withFrameContents(elements, ids), moved: false })
  }

  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    const { screen, sheet } = pointOf(e)
    lastPointRef.current = sheet
    const drag = dragRef.current
    if (!drag) {
      // With a line tool, the shape under the pointer shows where a line would connect.
      if (!readOnly && (tool === "line" || tool === "arrow")) {
        const target = snapTarget(elements, sheet, reach)
        setSnapHint((prev) => (prev?.id === target?.id && prev?.side === target?.side ? prev : target))
      }
      return
    }
    if (e.pointerId !== pointerRef.current) return
    switch (drag.kind) {
      case "pan": {
        const dx = screen.x - drag.last.x
        const dy = screen.y - drag.last.y
        drag.last = screen
        setViewport((v) => panBy(v, dx, dy))
        break
      }
      case "move": {
        const dx = sheet.x - drag.start.x
        const dy = sheet.y - drag.start.y
        // A click that wobbles a little is a click, not a move.
        if (!drag.moved && Math.hypot(dx, dy) * viewport.zoom < CLICK_SLOP) break
        drag.moved = true
        const d = snapMove(elements, drag.ids, dx, dy, grid)
        setPreview(movePatch(elements, drag.ids, d.x, d.y))
        break
      }
      case "resize":
        setPreview(resizePatch(elements, drag.id, drag.handle, sheet.x - drag.start.x, sheet.y - drag.start.y, keepRatio(drag.id, e.shiftKey)))
        break
      case "line-end": {
        const end = lineEndAt(sheet, [drag.id])
        setSnapHint(end.target)
        setPreview(lineEndPatch(elements, drag.id, drag.which, end.point, end.attach, end.side))
        break
      }
      case "marquee": {
        const rect = rectFromPoints(drag.start, sheet)
        setMarquee(rect)
        editor.select([...new Set([...drag.base, ...elementsInRect(elements, rect)])])
        break
      }
      case "create-box":
        setGhost(newBox(drag.type, newBoxRect(drag.type, drag.start, onGrid(sheet)), GHOST_ID, 0))
        break
      case "create-line": {
        const end = lineEndAt(sheet, drag.target ? [drag.target.id] : [])
        setSnapHint(end.target ?? drag.target)
        const startEnd = { point: drag.start, attach: drag.target?.id ?? null, side: drag.target?.side ?? null }
        setGhost(newLine(drag.type, startEnd, { point: end.point, attach: end.attach, side: end.side }, GHOST_ID, 0))
        break
      }
    }
  }

  /** Images keep their proportions unless Shift is held; other shapes keep them while Shift is held. */
  function keepRatio(id: string, shift: boolean): boolean {
    const el = elements[id]
    return isBox(el) && el.type === "image" ? !shift : shift
  }

  function onPointerUp(e: React.PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current
    if (!drag || e.pointerId !== pointerRef.current) return
    const { sheet } = pointOf(e)
    if (typeof e.currentTarget.releasePointerCapture === "function" && e.currentTarget.hasPointerCapture?.(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId)
    }
    switch (drag.kind) {
      case "move":
        if (drag.moved) {
          const d = snapMove(elements, drag.ids, sheet.x - drag.start.x, sheet.y - drag.start.y, grid)
          editor.commit(movePatch(elements, drag.ids, d.x, d.y))
        }
        break
      case "resize":
        editor.commit(resizePatch(elements, drag.id, drag.handle, sheet.x - drag.start.x, sheet.y - drag.start.y, keepRatio(drag.id, e.shiftKey)))
        break
      case "line-end": {
        const end = lineEndAt(sheet, [drag.id])
        editor.commit(lineEndPatch(elements, drag.id, drag.which, end.point, end.attach, end.side))
        break
      }
      case "create-box":
        editor.addBox(drag.type, newBoxRect(drag.type, drag.start, onGrid(sheet)))
        break
      case "create-line": {
        const dragged = Math.hypot(sheet.x - drag.start.x, sheet.y - drag.start.y) * viewport.zoom >= CLICK_SLOP
        const startTarget = drag.target
        const end = dragged ? lineEndAt(sheet, startTarget ? [startTarget.id] : []) : { point: { x: drag.start.x + DEFAULT_LINE_LENGTH, y: drag.start.y }, attach: null, side: null }
        editor.addLine(
          drag.type,
          { point: drag.start, attach: startTarget?.id ?? null, side: startTarget?.side ?? null },
          { point: end.point, attach: end.attach, side: end.side },
        )
        break
      }
      case "pan":
      case "marquee":
        break
    }
    endDrag()
  }

  function onDoubleClick(e: React.MouseEvent<HTMLDivElement>) {
    if (readOnly || tool !== "select" || (e.target as HTMLElement).closest("textarea,a")) return
    const { sheet } = pointOf(e)
    const hit = hitTest(elements, sheet, HIT_TOLERANCE / viewport.zoom)
    if (hit === null) return
    const el = elements[hit]
    if (isLine(el)) editor.startLabelEditing(hit)
    else if (isBox(el) && el.type === "table") {
      const cell = cellAt(el, sheet)
      if (cell) editor.startCellEditing(hit, cell.row, cell.col)
    } else editor.startEditing(hit)
  }

  /** Starts editing the selected element because a character was typed: the character goes into the text. */
  function typeInto(id: string): boolean {
    const el = elements[id]
    if (!isKnown(el) || el.locked) return false
    // flushSync: the textarea is there and focused before the browser inserts the typed character (IME too).
    if (isLine(el)) flushSync(() => editor.startLabelEditing(id))
    else if (el.type === "table") {
      const cell = activeCell?.id === id ? activeCell : { row: 0, col: 0 }
      flushSync(() => editor.startCellEditing(id, cell.row, cell.col))
    } else if (el.type === "image") return false
    else flushSync(() => editor.startEditing(id, true))
    return true
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    // Keys typed into the text overlay belong to the text.
    if (e.target !== e.currentTarget) return
    // Space pans (held while dragging) — except with one shape selected, where it is typed into the shape.
    if (e.key === " " && !(selection.length === 1 && !readOnly && !e.repeat && typeInto(selection[0]))) {
      e.preventDefault()
      setSpaceDown(true)
      return
    }
    if (e.key === "Escape") {
      if (dragRef.current) endDrag()
      else if (tool !== "select") editor.setTool("select")
      else editor.select([])
      return
    }
    // Alt + arrow keys resize the one selected shape (the keyboard way to what the handles do).
    if (e.altKey && !readOnly && selection.length === 1 && e.key.startsWith("Arrow")) {
      const el = elements[selection[0]]
      if (isBox(el)) {
        const step = e.shiftKey ? 10 : 1
        const dx = e.key === "ArrowRight" ? step : e.key === "ArrowLeft" ? -step : 0
        const dy = e.key === "ArrowDown" ? step : e.key === "ArrowUp" ? -step : 0
        editor.commit(resizePatch(elements, el.id, "se", dx, dy, el.type === "image"))
        e.preventDefault()
      }
      return
    }
    if (e.altKey) return
    // ] / [ : the next / previous element, one at a time (also read-only: selecting is how its text is read out).
    if (!e.ctrlKey && !e.metaKey && (e.key === "]" || e.key === "[")) {
      const next = stepSelection(order, selection, e.key === "]")
      if (next !== null) editor.select([next])
      e.preventDefault()
      return
    }
    if (e.ctrlKey || e.metaKey) {
      const key = e.key.toLowerCase()
      // Copy / cut / paste go through the clipboard events below (they reach the system clipboard).
      if (key === "c" || key === "x" || key === "v") return
      if (key === "a") editor.selectAll()
      else if (key === "enter" && selection.length === 1) openLink(selection[0])
      else if (readOnly) return
      else if (key === "z") (e.shiftKey ? editor.redo : editor.undo)()
      else if (key === "y") editor.redo()
      else if (key === "d") editor.duplicate()
      else return
      e.preventDefault()
      return
    }
    if (readOnly) return
    const step = e.shiftKey ? 10 : 1
    const one = selection.length === 1 ? selection[0] : null
    switch (e.key) {
      case "Delete":
      case "Backspace":
        editor.deleteSelection()
        break
      case "ArrowLeft":
        editor.nudge(-step, 0)
        break
      case "ArrowRight":
        editor.nudge(step, 0)
        break
      case "ArrowUp":
        editor.nudge(0, -step)
        break
      case "ArrowDown":
        editor.nudge(0, step)
        break
      case "Insert":
        // Mind map: a child of the selected shape (Tab is left to move the focus).
        if (!one || !isBox(elements[one])) return
        editor.mindChild()
        break
      case "F2":
        if (one && !typeInto(one)) return
        break
      case "Enter":
        if (tool !== "select") editor.placeAtCenter()
        else if (one && !editor.mindSibling()) {
          const el = elements[one]
          if (isLine(el)) editor.startLabelEditing(one)
          else if (isBox(el) && el.type === "table") editor.startCellEditing(one, activeCell?.id === one ? activeCell.row : 0, activeCell?.id === one ? activeCell.col : 0)
          else editor.startEditing(one)
        }
        break
      default:
        // Typing with one shape selected writes into it (no double-click needed); the key is not swallowed.
        if (one && typesText(e) && typeInto(one)) return
        return
    }
    e.preventDefault()
  }

  function onCopy(e: React.ClipboardEvent<HTMLDivElement>, cut: boolean) {
    if (e.target !== e.currentTarget || selection.length === 0) return
    e.preventDefault()
    e.clipboardData.setData("text/plain", editor.selectionText())
    if (cut && !readOnly) editor.cut()
    else editor.copy()
  }

  function onPaste(e: React.ClipboardEvent<HTMLDivElement>) {
    if (e.target !== e.currentTarget || readOnly) return
    e.preventDefault()
    const data = e.clipboardData
    const files = Array.from(data.files ?? [])
    const used = editor.pasteExternal({ html: data.getData("text/html"), text: data.getData("text/plain"), files }, lastPointRef.current ?? undefined)
    if (!used) editor.paste()
  }

  const single = selection.length === 1 ? shown[selection[0]] : undefined
  const showChrome = !readOnly && tool === "select" && !editing
  const cursor = panning ? "grabbing" : spaceDown || readOnly ? "grab" : tool !== "select" ? "crosshair" : "default"
  const dots = GRID * viewport.zoom
  const singleIndex = selection.length === 1 ? order.indexOf(selection[0]) : -1
  const statusText =
    selection.length === 0
      ? t.wbSelectionNone
      : singleIndex >= 0
        ? selectionAnnouncement(shown[selection[0]], singleIndex + 1, order.length, t)
        : t.wbSelectionCount.replace("{count}", String(selection.length))
  // A marquee drag changes the selection on every move: nothing is announced until the drag ends (an emptied live
  // region is not read out; the final selection is, once).
  const announced = marquee ? "" : statusText
  const hintBox = snapHint ? shown[snapHint.id] : undefined
  const cellBox = activeCell && selection.length === 1 && activeCell.id === selection[0] ? shown[activeCell.id] : undefined
  const activeCellRect = isBox(cellBox) && activeCell ? cellRect(cellBox, activeCell.row, activeCell.col) : null

  return (
    <>
      {/* The sheet in words, outside the application role so a screen reader can browse it (WCAG 1.1.1 / 1.3.1). */}
      <VisuallyHidden>
        <section aria-labelledby={contentsId} data-testid="board-contents">
          <h2 id={contentsId}>{t.wbSheetContents.replace("{count}", String(listed.length))}</h2>
          {listed.length === 0 ? (
            <p>{t.wbContentsEmpty}</p>
          ) : (
            <ul>
              {listed.map((el) => (
                <li key={el.id}>{describeElement(el, elements, t)}</li>
              ))}
            </ul>
          )}
        </section>
      </VisuallyHidden>
      <div
        ref={rootRef}
        role="application"
        aria-label={label}
        aria-describedby={helpId}
        tabIndex={0}
        data-testid="board-canvas"
        className="relative h-full min-h-0 w-full touch-none select-none overflow-hidden bg-surface-sunken"
        style={{
          cursor,
          // The global focus outline, drawn inside so the frame around the canvas does not clip it.
          outlineOffset: -2,
          backgroundImage: dots >= 8 ? "radial-gradient(var(--color-border-strong) 1px, transparent 1px)" : undefined,
          backgroundSize: `${dots}px ${dots}px`,
          backgroundPosition: `${viewport.x}px ${viewport.y}px`,
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={() => {
          if (!dragRef.current) setSnapHint(null)
        }}
        onPointerCancel={(e) => {
          if (e.pointerId === pointerRef.current) endDrag()
        }}
        onMouseDown={(e) => {
          // The middle button pans; without this the browser starts its own auto-scroll.
          if (e.button === 1) e.preventDefault()
        }}
        onDoubleClick={onDoubleClick}
        onKeyDown={onKeyDown}
        onKeyUp={(e) => {
          if (e.key === " ") setSpaceDown(false)
        }}
        onBlur={() => setSpaceDown(false)}
        onCopy={(e) => onCopy(e, false)}
        onCut={(e) => onCopy(e, true)}
        onPaste={onPaste}
        onDragOver={(e) => {
          if (!readOnly && Array.from(e.dataTransfer.types).includes("Files")) e.preventDefault()
        }}
        onDrop={(e) => {
          if (readOnly || e.dataTransfer.files.length === 0) return
          e.preventDefault()
          void editor.insertImages(Array.from(e.dataTransfer.files), pointOf(e).sheet)
        }}
      >
        <VisuallyHidden>
          <span id={helpId}>{readOnly ? t.wbCanvasHelpReadOnly : t.wbCanvasHelp}</span>
          <span role="status">{announced}</span>
        </VisuallyHidden>
        <svg className="absolute inset-0 h-full w-full">
          <g transform={`translate(${viewport.x} ${viewport.y}) scale(${viewport.zoom})`}>
            {ordered.map((el) => (
              <ElementView
                key={el.id}
                el={el}
                ends={lineEndsOf(el, shown)}
                hideText={editing?.id === el.id && editing.kind !== "cell"}
                hideCell={editing?.kind === "cell" && editing.id === el.id ? `${editing.row}:${editing.col}` : null}
              />
            ))}
            {ghost && (
              <g opacity={0.6}>
                <ElementView el={ghost} ends={lineEndsOf(ghost, shown)} />
              </g>
            )}
          </g>
          {isBox(hintBox) && snapHint && <SnapMarkers box={hintBox} active={snapHint.side} viewport={viewport} />}
          {showChrome && (
            <g data-testid="board-selection">
              {selection.map((id) => {
                const el = shown[id]
                const bounds = el ? elementBounds(el, shown) : null
                if (!bounds || isLine(el)) return null
                const r = screenRect(viewport, bounds)
                return (
                  <g key={id}>
                    <rect data-selected-id={id} x={r.x} y={r.y} width={r.w} height={r.h} fill="none" style={{ stroke: "var(--color-primary)" }} strokeWidth={2} strokeDasharray="5 3" />
                    {isKnown(el) && el.locked && <LockMark at={{ x: r.x + r.w, y: r.y }} label={t.wbLocked} />}
                  </g>
                )
              })}
              {selection.map((id) => {
                const el = shown[id]
                if (!isLine(el)) return null
                const geometry = lineGeometry(el, shown)
                const d = geometry.points.map((p, i) => {
                  const s = toScreen(viewport, p)
                  return `${i === 0 ? "M" : "L"}${s.x} ${s.y}`
                })
                return <path key={id} data-selected-id={id} d={d.join("")} fill="none" style={{ stroke: "var(--color-primary)" }} strokeWidth={2} strokeDasharray="5 3" />
              })}
              {activeCellRect && (
                <rect data-active-cell="" {...rectProps(screenRect(viewport, activeCellRect))} fill="none" style={{ stroke: "var(--color-primary)" }} strokeWidth={2} />
              )}
              {isBox(single) &&
                !single.locked &&
                BOX_HANDLES.map((handle) => {
                  const p = toScreen(viewport, boxHandlePoints(boxRect(single))[handle])
                  return (
                    <rect
                      key={handle}
                      data-handle={handle}
                      x={p.x - HANDLE_SIZE / 2}
                      y={p.y - HANDLE_SIZE / 2}
                      width={HANDLE_SIZE}
                      height={HANDLE_SIZE}
                      style={{ fill: "var(--color-surface)", stroke: "var(--color-primary)", cursor: HANDLE_CURSOR[handle] }}
                      strokeWidth={1.5}
                    />
                  )
                })}
              {isLine(single) &&
                !single.locked &&
                (["start", "end"] as const).map((which) => {
                  const geometry = lineGeometry(single, shown)
                  const p = toScreen(viewport, which === "start" ? geometry.a : geometry.b)
                  const attached = !!(which === "start" ? single.start.attach : single.end.attach)
                  return (
                    <circle
                      key={which}
                      data-handle={which}
                      data-attached={attached ? "" : undefined}
                      cx={p.x}
                      cy={p.y}
                      r={HANDLE_SIZE / 2 + 1}
                      style={{ fill: attached ? "var(--color-primary)" : "var(--color-surface)", stroke: "var(--color-primary)", cursor: "move" }}
                      strokeWidth={1.5}
                    />
                  )
                })}
              {isLine(single) && single.locked && <LockMark at={toScreen(viewport, lineGeometry(single, shown).mid)} label={t.wbLocked} />}
            </g>
          )}
          {marquee && <MarqueeRect rect={screenRect(viewport, marquee)} />}
        </svg>
        {!readOnly && (tool === "line" || tool === "arrow") && (
          <p aria-hidden="true" className="pointer-events-none absolute bottom-2 left-1/2 max-w-[90%] -translate-x-1/2 rounded-ui-sm bg-surface px-2 py-1 text-caption text-fg-muted shadow-sm ring-1 ring-border">
            {t.wbConnectHint}
          </p>
        )}
        {editing && isKnown(editingEl) && (
          <TextOverlay
            key={`${editing.kind}:${editing.id}:${editing.kind === "cell" ? `${editing.row}:${editing.col}` : ""}`}
            target={editing}
            el={editingEl}
            elements={shown}
            viewport={viewport}
            hint={t.wbTextEditHint}
            label={
              editing.kind === "label"
                ? t.wbLabelEditLabel
                : editing.kind === "cell"
                  ? t.wbCellEditLabel.replace("{row}", String(editing.row + 1)).replace("{col}", String(editing.col + 1))
                  : t.wbTextEditLabel
            }
            onDone={(text, refocus) => {
              editor.finishEditing(text)
              if (refocus) rootRef.current?.focus({ preventScroll: true })
            }}
          />
        )}
      </div>
    </>
  )
}

function rectProps(r: Rect) {
  return { x: r.x, y: r.y, width: r.w, height: r.h }
}

/** The four side midpoints of the shape a line end would connect to; the one it snaps to is filled. */
function SnapMarkers({ box, active, viewport }: { box: BoxElement; active: string; viewport: Viewport }) {
  return (
    <g data-testid="board-snap" data-snap-id={box.id} data-snap-side={active} className="pointer-events-none">
      {SIDES.map((side) => {
        const p = toScreen(viewport, sidePoint(box, side))
        const on = side === active
        return (
          <circle
            key={side}
            data-side={side}
            cx={p.x}
            cy={p.y}
            r={on ? 6 : 4}
            style={{ fill: on ? "var(--color-primary)" : "var(--color-surface)", stroke: "var(--color-primary)" }}
            strokeWidth={1.5}
          />
        )
      })}
    </g>
  )
}

function LockMark({ at, label }: { at: Point; label: string }) {
  return (
    <g data-locked="" transform={`translate(${at.x - 8} ${at.y - 18})`} className="pointer-events-none">
      <title>{label}</title>
      <rect x={0} y={6} width={14} height={10} rx={2} style={{ fill: "var(--color-fg-muted)" }} />
      <path d="M3.5 6V4a3.5 3.5 0 0 1 7 0v2" fill="none" style={{ stroke: "var(--color-fg-muted)" }} strokeWidth={1.6} />
    </g>
  )
}

function MarqueeRect({ rect }: { rect: Rect }) {
  return (
    <rect
      data-testid="board-marquee"
      x={rect.x}
      y={rect.y}
      width={rect.w}
      height={rect.h}
      style={{ fill: "var(--color-primary)", stroke: "var(--color-primary)" }}
      fillOpacity={0.08}
      strokeWidth={1}
    />
  )
}

interface TextOverlayProps {
  target: EditTarget
  el: KnownElement
  elements: ElementMap
  viewport: Viewport
  label: string
  /** How to finish the edit (read with the field). */
  hint: string
  /** Called once with the text; `refocus` = the keyboard ended the edit, so the canvas takes the focus back. */
  onDone: (text: string, refocus: boolean) => void
}

/** Where the overlay sits (sheet units) and the text it starts with. */
function overlayPlace(target: EditTarget, el: KnownElement, elements: ElementMap): { rect: Rect; value: string } | null {
  if (target.kind === "label") {
    if (!isLine(el)) return null
    const mid = lineGeometry(el, elements).mid
    return { rect: { x: mid.x - 110, y: mid.y - 16, w: 220, h: 32 }, value: el.label ?? "" }
  }
  if (!isBox(el)) return null
  if (target.kind === "cell") {
    const rect = cellRect(el, target.row, target.col)
    return rect ? { rect, value: el.cells?.[target.row]?.[target.col] ?? "" } : null
  }
  return { rect: boxRect(el), value: el.text }
}

/**
 * The textarea laid over the text being edited (Escape or Ctrl+Enter ends, so does clicking elsewhere). It takes
 * the box's own font, size, alignment and colour, so what is typed looks as it will be drawn.
 */
function TextOverlay({ target, el, elements, viewport, label, hint, onDone }: TextOverlayProps) {
  const place = overlayPlace(target, el, elements)
  const [value, setValue] = useState(place?.value ?? "")
  const ref = useRef<HTMLTextAreaElement>(null)
  const doneRef = useRef(false)
  const hintId = useId()
  const typing = target.kind === "text" && target.typing

  // Layout effect: when typing starts the edit, the textarea must have the focus before the browser inserts the key.
  useLayoutEffect(() => {
    const node = ref.current
    if (!node) return
    node.focus({ preventScroll: true })
    if (typing) node.setSelectionRange(node.value.length, node.value.length)
    else node.select()
  }, [typing])

  if (!place) return null

  function done(refocus: boolean) {
    if (doneRef.current) return
    doneRef.current = true
    onDone(value, refocus)
  }

  const r = screenRect(viewport, place.rect)
  const box = isBox(el) ? el : null
  const css = box ? textCss(box, viewport.zoom) : { fontSize: 12 * viewport.zoom, lineHeight: 1.4 }
  const align = box && target.kind === "text" ? textStyle(box).align : target.kind === "label" ? "center" : "left"
  const background = box && target.kind === "text" && box.fill !== "none" && box.type !== "frame" ? FILL_COLOR[box.fill] : "var(--color-surface)"
  // Readable however far the view is zoomed out (the drawn text keeps its real size).
  const fontSize = Math.max(12, Number(css.fontSize) || 12)
  return (
    <>
      <span id={hintId} hidden>
        {hint}
      </span>
      <textarea
      ref={ref}
      aria-label={label}
      aria-describedby={hintId}
      value={value}
      maxLength={target.kind === "label" ? 200 : undefined}
      onChange={(e) => setValue(e.target.value)}
      onBlur={() => done(false)}
      onKeyDown={(e) => {
        if (e.nativeEvent.isComposing) return
        const single = target.kind === "label" && e.key === "Enter" && !e.shiftKey
        if (e.key === "Escape" || single || (e.key === "Enter" && (e.ctrlKey || e.metaKey))) {
          e.preventDefault()
          e.stopPropagation()
          done(true)
        }
      }}
      className={cn("absolute resize-none overflow-hidden rounded-ui-sm border-2 border-primary")}
      style={{
        ...css,
        left: r.x,
        top: r.y,
        width: Math.max(r.w, 40),
        height: Math.max(r.h, 24),
        padding: (target.kind === "cell" ? 2 : TEXT_PADDING) * viewport.zoom,
        textAlign: align,
        backgroundColor: background,
        fontSize,
      }}
    />
    </>
  )
}
