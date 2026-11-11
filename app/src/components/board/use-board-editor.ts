"use client"

import { useMemo, useRef, useState, type Dispatch, type RefObject, type SetStateAction } from "react"
import type { Patch } from "@/lib/board/doc"
import { boundsOf, sortByZ, type ElementMap, type Point, type Rect } from "@/lib/board/geometry"
import { newElementId } from "@/lib/board/ids"
import { isBox, isKnown, type BoxType, type FillKey, type KnownElement, type LineType, type StrokeKey } from "@/lib/board/model"
import {
  copyElements,
  DEFAULT_BOX_SIZE,
  deletePatch,
  movePatch,
  newBox,
  newLine,
  nextZ,
  PASTE_OFFSET,
  pastePatch,
  reorderPatch,
  stylePatch,
  textPatch,
} from "@/lib/board/ops"
import { fitViewport, INITIAL_VIEWPORT, stepZoom, toSheet, zoomAt, type Viewport } from "@/lib/board/viewport"
import type { SheetDocument } from "./use-sheet-document"

export type Tool = "select" | BoxType | LineType
export const TOOLS: readonly Tool[] = ["select", "rect", "ellipse", "line", "arrow", "text", "sticky"]

export function isBoxTool(tool: Tool): tool is BoxType {
  return tool === "rect" || tool === "ellipse" || tool === "text" || tool === "sticky"
}

export interface CanvasSize {
  width: number
  height: number
}

/** Length of a line placed with a click or from the keyboard (no drag). */
export const DEFAULT_LINE_LENGTH = 120

export interface LineEndInput {
  point: Point
  attach: string | null
}

export interface BoardEditorController {
  readOnly: boolean
  elements: ElementMap
  tool: Tool
  setTool: (tool: Tool) => void
  /** Ids of the selected elements that still exist. */
  selection: readonly string[]
  select: (ids: readonly string[]) => void
  viewport: Viewport
  setViewport: Dispatch<SetStateAction<Viewport>>
  /** The canvas reports its size (first report: the view is fitted to what is drawn). */
  reportCanvasSize: (size: CanvasSize) => void
  /** The box whose text is being edited. */
  editingId: string | null
  startEditing: (id: string) => void
  finishEditing: (text: string) => void
  commit: (patch: Patch) => void
  addBox: (type: BoxType, rect: Rect) => void
  addLine: (type: LineType, start: LineEndInput, end: LineEndInput) => void
  /** Keyboard way to draw: the active tool's shape in the middle of the view. */
  placeAtCenter: () => void
  deleteSelection: () => void
  duplicate: () => void
  copy: () => void
  cut: () => void
  paste: () => void
  selectAll: () => void
  nudge: (dx: number, dy: number) => void
  reorder: (to: "front" | "back") => void
  setStyle: (style: Partial<{ fill: FillKey; stroke: StrokeKey }>) => void
  undo: () => void
  redo: () => void
  canUndo: boolean
  canRedo: boolean
  zoomIn: () => void
  zoomOut: () => void
  zoomReset: () => void
  zoomFit: () => void
}

/**
 * State and commands of the canvas editor of one sheet: tool, selection, view, text editing, and every
 * command the toolbar and the keyboard share. All geometry and document changes are the pure functions of
 * `@/lib/board`; this hook only decides which one to call.
 *
 * `clipboardRef` belongs to the board, so copies can be pasted on another sheet.
 */
export function useBoardEditor(doc: SheetDocument, readOnly: boolean, clipboardRef: RefObject<KnownElement[]>): BoardEditorController {
  const elements = doc.elements
  const [tool, setTool] = useState<Tool>("select")
  const [selected, setSelected] = useState<readonly string[]>([])
  const [viewport, setViewport] = useState<Viewport>(INITIAL_VIEWPORT)
  const [editingId, setEditingId] = useState<string | null>(null)
  const sizeRef = useRef<CanvasSize>({ width: 800, height: 600 })
  const fittedRef = useRef(false)
  const pasteCountRef = useRef(0)

  // An undo can take a selected element away.
  const selection = useMemo(() => selected.filter((id) => isKnown(elements[id])), [selected, elements])

  const allIds = () =>
    sortByZ(elements)
      .filter(isKnown)
      .map((el) => el.id)
  const center = (): Point => ({ x: sizeRef.current.width / 2, y: sizeRef.current.height / 2 })

  /** Zooms around the middle of the canvas. */
  function zoomBy(next: (zoom: number) => number) {
    const anchor = center()
    setViewport((v) => zoomAt(v, anchor, next(v.zoom)))
  }

  function addBox(type: BoxType, rect: Rect) {
    if (readOnly) return
    const id = newElementId()
    doc.commit({ [id]: newBox(type, rect, id, nextZ(elements)) })
    setSelected([id])
    setTool("select")
    // Text and sticky notes are for writing: the caret goes straight in.
    if (type === "text" || type === "sticky") setEditingId(id)
  }

  function addLine(type: LineType, start: LineEndInput, end: LineEndInput) {
    if (readOnly) return
    const id = newElementId()
    doc.commit({ [id]: newLine(type, start, end, id, nextZ(elements)) })
    setSelected([id])
    setTool("select")
  }

  function paste(clip: readonly KnownElement[], steps: number) {
    if (readOnly || clip.length === 0) return
    const { patch, ids } = pastePatch(elements, clip, newElementId, { x: PASTE_OFFSET.x * steps, y: PASTE_OFFSET.y * steps })
    doc.commit(patch)
    setSelected(ids)
  }

  function copy() {
    if (selection.length === 0) return
    clipboardRef.current = copyElements(elements, selection)
    pasteCountRef.current = 0
  }

  function deleteSelection() {
    if (readOnly || selection.length === 0) return
    doc.commit(deletePatch(elements, selection))
    setSelected([])
  }

  return {
    readOnly,
    elements,
    tool,
    setTool: (next) => {
      if (!readOnly) setTool(next)
    },
    selection,
    select: (ids) => setSelected([...ids]),
    viewport,
    setViewport,
    reportCanvasSize: (size) => {
      sizeRef.current = size
      if (fittedRef.current || size.width <= 0 || size.height <= 0) return
      fittedRef.current = true
      setViewport(fitViewport(boundsOf(allIds(), elements), size))
    },
    editingId,
    startEditing: (id) => {
      if (readOnly || !isBox(elements[id])) return
      setSelected([id])
      setEditingId(id)
    },
    finishEditing: (text) => {
      const id = editingId
      if (id === null) return
      setEditingId(null)
      const el = elements[id]
      if (!isBox(el)) return
      // A text element with nothing written is nothing: it goes away instead of staying invisible.
      if (el.type === "text" && text.trim() === "") doc.commit(deletePatch(elements, [id]))
      else doc.commit(textPatch(elements, id, text))
    },
    commit: doc.commit,
    addBox,
    addLine,
    placeAtCenter: () => {
      if (tool === "select") return
      const c = toSheet(viewport, center())
      if (isBoxTool(tool)) {
        const size = DEFAULT_BOX_SIZE[tool]
        addBox(tool, { x: c.x - size.w / 2, y: c.y - size.h / 2, w: size.w, h: size.h })
      } else {
        const half = DEFAULT_LINE_LENGTH / 2
        addLine(tool, { point: { x: c.x - half, y: c.y }, attach: null }, { point: { x: c.x + half, y: c.y }, attach: null })
      }
    },
    deleteSelection,
    duplicate: () => paste(copyElements(elements, selection), 1),
    copy,
    cut: () => {
      if (readOnly) return
      copy()
      deleteSelection()
    },
    paste: () => {
      pasteCountRef.current += 1
      paste(clipboardRef.current, pasteCountRef.current)
    },
    selectAll: () => setSelected(allIds()),
    nudge: (dx, dy) => {
      if (selection.length > 0) doc.commit(movePatch(elements, selection, dx, dy))
    },
    reorder: (to) => doc.commit(reorderPatch(elements, selection, to)),
    setStyle: (style) => doc.commit(stylePatch(elements, selection, style)),
    undo: doc.undo,
    redo: doc.redo,
    canUndo: doc.canUndo,
    canRedo: doc.canRedo,
    zoomIn: () => zoomBy((zoom) => stepZoom(zoom, 1)),
    zoomOut: () => zoomBy((zoom) => stepZoom(zoom, -1)),
    zoomReset: () => zoomBy(() => 1),
    zoomFit: () => setViewport(fitViewport(boundsOf(allIds(), elements), sizeRef.current)),
  }
}
