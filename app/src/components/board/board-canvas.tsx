"use client"

import { useEffect, useId, useMemo, useRef, useState } from "react"
import type { Patch } from "@/lib/board/doc"
import {
  boxAt,
  boxHandlePoints,
  boxRect,
  BOX_HANDLES,
  elementBounds,
  elementsInRect,
  hitBoxHandle,
  hitLineHandle,
  hitTest,
  rectFromPoints,
  resolveLine,
  sortByZ,
  type BoxHandle,
  type ElementMap,
  type LineHandle,
  type Point,
  type Rect,
} from "@/lib/board/geometry"
import { isBox, isLine, type BoardElement, type BoxElement, type BoxType, type KnownElement, type LineType } from "@/lib/board/model"
import { CLICK_SLOP, lineEndPatch, movePatch, newBox, newBoxRect, newLine, resizePatch } from "@/lib/board/ops"
import { FILL_COLOR } from "@/lib/board/palette"
import { panBy, toScreen, toSheet, wheelZoom, zoomAt, type Viewport } from "@/lib/board/viewport"
import { useLanguage } from "@/lib/language-context"
import { cn, VisuallyHidden } from "@/components/ui"
import { describable, describeElement, selectionAnnouncement, stepSelection } from "./describe"
import { ElementView, lineEndsOf, TEXT_PADDING, TEXT_SIZE, textColor } from "./element-view"
import { DEFAULT_LINE_LENGTH, isBoxTool, type BoardEditorController } from "./use-board-editor"

/** How close (screen pixels) the pointer has to be to pick an element / a handle. */
const HIT_TOLERANCE = 6
const HANDLE_TOLERANCE = 8
const HANDLE_SIZE = 8
/** Spacing of the background dots (sheet units). */
const GRID = 24
const GHOST_ID = "ghost-element"

type Drag =
  | { kind: "pan"; last: Point }
  | { kind: "move"; start: Point; ids: readonly string[]; moved: boolean }
  | { kind: "resize"; id: string; handle: BoxHandle; start: Point }
  | { kind: "line-end"; id: string; which: LineHandle }
  | { kind: "marquee"; start: Point; base: readonly string[] }
  | { kind: "create-box"; type: BoxType; start: Point }
  | { kind: "create-line"; type: LineType; start: Point; attach: string | null }

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

interface BoardCanvasProps {
  editor: BoardEditorController
  /** Accessible name of the canvas (names the sheet). */
  label: string
}

/**
 * The drawing surface: SVG for the elements, an HTML textarea over the box whose text is edited. Pointer
 * and keyboard input is turned into the editor's commands; a drag shows its result as a preview and
 * becomes one undo step when the button is released.
 */
export function BoardCanvas({ editor, label }: BoardCanvasProps) {
  const { t } = useLanguage()
  const { elements, viewport, selection, tool, readOnly, editingId, reportCanvasSize, setViewport } = editor
  const rootRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<Drag | null>(null)
  /** The pointer that started the drag: a second finger or a pen does not end or steer it. */
  const pointerRef = useRef<number | null>(null)
  const contentsId = useId()
  const [preview, setPreview] = useState<Patch | null>(null)
  const [marquee, setMarquee] = useState<Rect | null>(null)
  const [ghost, setGhost] = useState<KnownElement | null>(null)
  const [spaceDown, setSpaceDown] = useState(false)
  const [panning, setPanning] = useState(false)
  const helpId = useId()

  const shown = useMemo(() => withPatch(elements, preview), [elements, preview])
  const ordered = useMemo(() => sortByZ(shown), [shown])
  /** What can be selected, back to front: the order of ] / [ and of the contents list. */
  const listed = useMemo(() => describable(sortByZ(elements)), [elements])
  const order = useMemo(() => listed.map((el) => el.id), [listed])
  const editing = editingId ? shown[editingId] : undefined

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

  function endDrag() {
    dragRef.current = null
    pointerRef.current = null
    setPreview(null)
    setMarquee(null)
    setGhost(null)
    setPanning(false)
  }

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (dragRef.current || (e.target as HTMLElement).closest("textarea")) return
    // The keyboard commands follow the pointer: the canvas has the focus from the first click.
    rootRef.current?.focus({ preventScroll: true })
    const { screen, sheet } = pointOf(e)
    const start = (drag: Drag) => {
      dragRef.current = drag
      pointerRef.current = e.pointerId
      // Not in every environment (old browsers, jsdom); the drag also works while the pointer stays inside.
      if (typeof e.currentTarget.setPointerCapture === "function") e.currentTarget.setPointerCapture(e.pointerId)
    }

    if (e.button === 1 || (e.button === 0 && (spaceDown || readOnly))) {
      e.preventDefault()
      setPanning(true)
      return start({ kind: "pan", last: screen })
    }
    if (e.button !== 0) return

    if (tool !== "select") {
      if (isBoxTool(tool)) return start({ kind: "create-box", type: tool, start: sheet })
      return start({ kind: "create-line", type: tool, start: sheet, attach: boxAt(elements, sheet) })
    }

    // The handles of the one selected element come first: they stick out of it.
    if (selection.length === 1) {
      const el = elements[selection[0]]
      const reach = HANDLE_TOLERANCE / viewport.zoom
      if (isBox(el)) {
        const handle = hitBoxHandle(boxRect(el), sheet, reach)
        if (handle) return start({ kind: "resize", id: el.id, handle, start: sheet })
      } else if (isLine(el)) {
        const which = hitLineHandle(el, elements, sheet, reach)
        if (which) return start({ kind: "line-end", id: el.id, which })
      }
    }

    const hit = hitTest(elements, sheet, HIT_TOLERANCE / viewport.zoom)
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
    start({ kind: "move", start: sheet, ids, moved: false })
  }

  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current
    if (!drag || e.pointerId !== pointerRef.current) return
    const { screen, sheet } = pointOf(e)
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
        setPreview(movePatch(elements, drag.ids, dx, dy))
        break
      }
      case "resize":
        setPreview(resizePatch(elements, drag.id, drag.handle, sheet.x - drag.start.x, sheet.y - drag.start.y))
        break
      case "line-end":
        setPreview(lineEndPatch(elements, drag.id, drag.which, sheet, boxAt(elements, sheet, [drag.id])))
        break
      case "marquee": {
        const rect = rectFromPoints(drag.start, sheet)
        setMarquee(rect)
        editor.select([...new Set([...drag.base, ...elementsInRect(elements, rect)])])
        break
      }
      case "create-box":
        setGhost(newBox(drag.type, newBoxRect(drag.type, drag.start, sheet), GHOST_ID, 0))
        break
      case "create-line":
        setGhost(newLine(drag.type, { point: drag.start, attach: null }, { point: sheet, attach: null }, GHOST_ID, 0))
        break
    }
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
        if (drag.moved) editor.commit(movePatch(elements, drag.ids, sheet.x - drag.start.x, sheet.y - drag.start.y))
        break
      case "resize":
        editor.commit(resizePatch(elements, drag.id, drag.handle, sheet.x - drag.start.x, sheet.y - drag.start.y))
        break
      case "line-end":
        editor.commit(lineEndPatch(elements, drag.id, drag.which, sheet, boxAt(elements, sheet, [drag.id])))
        break
      case "create-box":
        editor.addBox(drag.type, newBoxRect(drag.type, drag.start, sheet))
        break
      case "create-line": {
        const dragged = Math.hypot(sheet.x - drag.start.x, sheet.y - drag.start.y) >= CLICK_SLOP
        const end = dragged ? sheet : { x: drag.start.x + DEFAULT_LINE_LENGTH, y: drag.start.y }
        const endAttach = boxAt(elements, end)
        // Both ends inside one box: a line drawn on top of it, attached to nothing.
        const same = endAttach !== null && endAttach === drag.attach
        editor.addLine(drag.type, { point: drag.start, attach: same ? null : drag.attach }, { point: end, attach: same ? null : endAttach })
        break
      }
      case "pan":
      case "marquee":
        break
    }
    endDrag()
  }

  function onDoubleClick(e: React.MouseEvent<HTMLDivElement>) {
    if (readOnly || tool !== "select" || (e.target as HTMLElement).closest("textarea")) return
    const hit = hitTest(elements, pointOf(e).sheet, HIT_TOLERANCE / viewport.zoom)
    if (hit !== null) editor.startEditing(hit)
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    // Keys typed into the text overlay belong to the text.
    if (e.target !== e.currentTarget) return
    if (e.key === " ") {
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
      if (key === "a") editor.selectAll()
      else if (key === "c") editor.copy()
      else if (readOnly) return
      else if (key === "z") (e.shiftKey ? editor.redo : editor.undo)()
      else if (key === "y") editor.redo()
      else if (key === "x") editor.cut()
      else if (key === "v") editor.paste()
      else if (key === "d") editor.duplicate()
      else return
      e.preventDefault()
      return
    }
    if (readOnly) return
    const step = e.shiftKey ? 10 : 1
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
      case "Enter":
        if (tool !== "select") editor.placeAtCenter()
        else if (selection.length === 1) editor.startEditing(selection[0])
        break
      default:
        return
    }
    e.preventDefault()
  }

  const single = selection.length === 1 ? shown[selection[0]] : undefined
  const showChrome = !readOnly && tool === "select" && !editing
  const cursor = panning ? "grabbing" : spaceDown || readOnly ? "grab" : tool !== "select" ? "crosshair" : "default"
  const grid = GRID * viewport.zoom
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
        backgroundImage: grid >= 8 ? "radial-gradient(var(--color-border-strong) 1px, transparent 1px)" : undefined,
        backgroundSize: `${grid}px ${grid}px`,
        backgroundPosition: `${viewport.x}px ${viewport.y}px`,
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
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
    >
      <VisuallyHidden>
        <span id={helpId}>{readOnly ? t.wbCanvasHelpReadOnly : t.wbCanvasHelp}</span>
        <span role="status">{announced}</span>
      </VisuallyHidden>
      <svg className="absolute inset-0 h-full w-full">
        <g transform={`translate(${viewport.x} ${viewport.y}) scale(${viewport.zoom})`}>
          {ordered.map((el) => (
            <ElementView key={el.id} el={el} ends={lineEndsOf(el, shown)} hideText={el.id === editingId} />
          ))}
          {ghost && (
            <g opacity={0.6}>
              <ElementView el={ghost} ends={lineEndsOf(ghost, shown)} />
            </g>
          )}
        </g>
        {showChrome && (
          <g data-testid="board-selection">
            {selection.map((id) => {
              const el = shown[id]
              const bounds = el ? elementBounds(el, shown) : null
              if (!bounds || isLine(el)) return null
              const r = screenRect(viewport, bounds)
              return <rect key={id} data-selected-id={id} x={r.x} y={r.y} width={r.w} height={r.h} fill="none" style={{ stroke: "var(--color-primary)" }} strokeWidth={1} strokeDasharray="4 3" />
            })}
            {selection.map((id) => {
              const el = shown[id]
              if (!isLine(el)) return null
              const { a, b } = resolveLine(el, shown)
              const sa = toScreen(viewport, a)
              const sb = toScreen(viewport, b)
              return <line key={id} data-selected-id={id} x1={sa.x} y1={sa.y} x2={sb.x} y2={sb.y} style={{ stroke: "var(--color-primary)" }} strokeWidth={1} strokeDasharray="4 3" />
            })}
            {isBox(single) &&
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
              (["start", "end"] as const).map((which) => {
                const { a, b } = resolveLine(single, shown)
                const p = toScreen(viewport, which === "start" ? a : b)
                return <circle key={which} data-handle={which} cx={p.x} cy={p.y} r={HANDLE_SIZE / 2 + 1} style={{ fill: "var(--color-surface)", stroke: "var(--color-primary)", cursor: "move" }} strokeWidth={1.5} />
              })}
          </g>
        )}
        {marquee && <MarqueeRect rect={screenRect(viewport, marquee)} />}
      </svg>
      {isBox(editing) && (
        <TextOverlay
          key={editing.id}
          el={editing}
          viewport={viewport}
          label={t.wbTextEditLabel}
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
  el: BoxElement
  viewport: Viewport
  label: string
  /** Called once with the text; `refocus` = the keyboard ended the edit, so the canvas takes the focus back. */
  onDone: (text: string, refocus: boolean) => void
}

/** The textarea laid over a box while its text is edited (Escape or Ctrl+Enter ends, so does clicking elsewhere). */
function TextOverlay({ el, viewport, label, onDone }: TextOverlayProps) {
  const [value, setValue] = useState(el.text)
  const ref = useRef<HTMLTextAreaElement>(null)
  const doneRef = useRef(false)

  useEffect(() => {
    const node = ref.current
    if (!node) return
    node.focus({ preventScroll: true })
    node.select()
  }, [])

  function done(refocus: boolean) {
    if (doneRef.current) return
    doneRef.current = true
    onDone(value, refocus)
  }

  const r = screenRect(viewport, boxRect(el))
  return (
    <textarea
      ref={ref}
      aria-label={label}
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={() => done(false)}
      onKeyDown={(e) => {
        if (e.nativeEvent.isComposing) return
        if (e.key === "Escape" || (e.key === "Enter" && (e.ctrlKey || e.metaKey))) {
          e.preventDefault()
          e.stopPropagation()
          done(true)
        }
      }}
      className={cn(
        "absolute resize-none overflow-hidden rounded-ui-sm border-2 border-primary",
        el.type === "text" ? "text-left" : "text-center",
      )}
      style={{
        left: r.x,
        top: r.y,
        width: Math.max(r.w, 40),
        height: Math.max(r.h, 24),
        padding: TEXT_PADDING * viewport.zoom,
        fontSize: TEXT_SIZE * viewport.zoom,
        lineHeight: 1.4,
        color: textColor(el),
        backgroundColor: el.fill === "none" ? "var(--color-surface)" : FILL_COLOR[el.fill],
      }}
    />
  )
}
