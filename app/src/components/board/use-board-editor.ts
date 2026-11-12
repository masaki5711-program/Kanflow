"use client"

import { useEffect, useMemo, useRef, useState, type Dispatch, type RefObject, type SetStateAction } from "react"
import { parseHtmlTable, parseTsv, type Cells } from "@/lib/board/clipboard"
import type { Patch } from "@/lib/board/doc"
import { boundsOf, sortByZ, type ElementMap, type Point, type Rect } from "@/lib/board/geometry"
import { newElementId } from "@/lib/board/ids"
import { BOARD_LIMITS } from "@/lib/board/limits"
import { mindChildPatch, mindLayoutPatch, mindParent, mindSiblingPatch } from "@/lib/board/mindmap"
import { isBox, isKnown, isLine, type BoxType, type FillKey, type KnownElement, type LineType, type StrokeKey, type TextRuns } from "@/lib/board/model"
import {
  alignPatch,
  bodyPatch,
  cellPatch,
  expandGroups,
  formatDropped,
  groupPatch,
  tableTrackPatch,
  ungroupPatch,
  copyElements,
  DEFAULT_BOX_SIZE,
  deletePatch,
  distributePatch,
  formatPatch,
  labelPatch,
  linkPatch,
  lockPatch,
  movePatch,
  bottomZ,
  newBox,
  newImage,
  newLine,
  newTableFromCells,
  nextZ,
  PASTE_OFFSET,
  pastePatch,
  reorderPatch,
  stylePatch,
  tablePatch,
  textPatch,
  votePatch,
  voteBudgetOf,
  votesUsed,
  sortByVotesPatch,
  newShape,
  newTimer,
  timerPatch,
  connectPatch,
  pbiPatch,
  besidePatch,
  groupFramesPatch,
  type AlignHow,
  type FormatChange,
  type LineEndInput,
  type TableEdit,
  type TimerAction,
} from "@/lib/board/ops"
import type { ShapeKind } from "@/lib/board/shapes"
import type { TextSlot } from "@/lib/board/style"
import { templatePatch, type TemplateKind, type TemplateTexts } from "@/lib/board/templates"
import { fitViewport, INITIAL_VIEWPORT, stepZoom, toSheet, zoomAt, type Viewport } from "@/lib/board/viewport"
import type { RichController, RichOp, SelectionMarks } from "./rich-editor"
import type { SheetDocument } from "./use-sheet-document"

export type { LineEndInput } from "@/lib/board/ops"

/** A box type drawn by dragging (an image comes from a file; library shapes and timers are placed from menus). */
export type DrawBoxType = Exclude<BoxType, "image" | "shape" | "timer">
export type Tool = "select" | DrawBoxType | LineType
export const TOOLS: readonly Tool[] = ["select", "rect", "ellipse", "line", "arrow", "text", "sticky", "frame", "table"]

export function isBoxTool(tool: Tool): tool is DrawBoxType {
  return tool !== "select" && tool !== "line" && tool !== "arrow"
}

export interface CanvasSize {
  width: number
  height: number
}

/** Length of a line placed with a click or from the keyboard (no drag). */
export const DEFAULT_LINE_LENGTH = 120
/** Grid spacing of "snap to the grid" (sheet units; the dots on the canvas). */
export const SNAP_GRID = 24

/** What the text overlay edits: a box's text (a frame's title), a frame's body, a line's label, or one cell of a table. */
export type EditTarget =
  | { kind: "text"; id: string; typing: boolean }
  | { kind: "body"; id: string; typing: boolean }
  | { kind: "label"; id: string }
  | { kind: "cell"; id: string; row: number; col: number }

/** Steps of the table's column / row size buttons (sheet units). */
export const TABLE_TRACK_STEP = 8

export interface ActiveCell {
  id: string
  row: number
  col: number
}

/** A message for the person at the editor (shown by the sheet editor). */
export interface EditorNotice {
  tone: "info" | "error"
  text: string
}

/** What the editor needs from outside the sheet. */
export interface BoardEditorOptions {
  /** The signed-in user (votes are per person). */
  userId: string | null
  /** Stores an image for the board; resolves to its file id. Throws with a user-facing message. */
  uploadImage: (file: File) => Promise<string>
  /** Texts of the ready-made templates, in the viewer's language. */
  templateTexts: TemplateTexts
  /** Announces a result (an image that could not be stored, a pasted table). */
  notify: (notice: EditorNotice) => void
  /** The shared clock (server time) for timers; default this computer's. */
  now?: () => number
  /** User-facing texts the editor composes. */
  messages: { imageNotImage: string; imageTooLarge: string; imageFailed: string; formatTooLarge: string; pastedTable: (rows: number, cols: number) => string }
}

/** Raster images the board accepts (the server checks the content again). */
const IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/gif", "image/webp"])

export interface ClipboardInput {
  html: string
  text: string
  files: readonly File[]
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
  /** What the text overlay edits. */
  editing: EditTarget | null
  /** The box whose text is being edited (kept for callers of B1). */
  editingId: string | null
  /** `typing`: the edit was started by typing into the selected box (the caret goes to the end, nothing selected). */
  startEditing: (id: string, typing?: boolean) => void
  startCellEditing: (id: string, row: number, col: number) => void
  startLabelEditing: (id: string) => void
  /** A frame's body (what is written below its title). */
  startBodyEditing: (id: string, typing?: boolean) => void
  /** Ends the edit with the text and, for formatted texts, its runs. */
  finishEditing: (text: string, runs?: TextRuns | null) => void
  /** The open formatted-text editor registers itself here (its selection can be formatted). */
  registerRich: (controller: RichController | null) => void
  /** The format of the characters selected in the text being edited (null: none selected). */
  richMarks: SelectionMarks | null
  setRichMarks: (marks: SelectionMarks | null) => void
  /** Ends the text edit from outside the text (Esc in the format bar). */
  endTextEdit: () => void
  /**
   * A text format command: on the selected characters while a text is being edited and some are selected,
   * otherwise `fallback` on the selected elements.
   */
  textFormat: (op: RichOp, fallback: Partial<FormatChange>) => void
  /** Ctrl+G / Ctrl+Shift+G. */
  group: () => void
  ungroup: () => void
  /** Wider / narrower column, taller / lower row of the active table cell. */
  tableTrack: (axis: "col" | "row", delta: number) => void
  /** The table cell the row / column buttons act on. */
  activeCell: ActiveCell | null
  setActiveCell: (cell: ActiveCell | null) => void
  commit: (patch: Patch) => void
  addBox: (type: DrawBoxType, rect: Rect) => void
  addLine: (type: LineType, start: LineEndInput, end: LineEndInput) => void
  /** Keyboard way to draw: the active tool's shape in the middle of the view. */
  placeAtCenter: () => void
  deleteSelection: () => void
  duplicate: () => void
  /** Copies the elements, shifted by `offset` (a Ctrl / ⌘ + drag); the copies become the selection. */
  duplicateBy: (ids: readonly string[], offset: Point) => void
  copy: () => void
  cut: () => void
  paste: () => void
  /** The plain text of the selection, for the system clipboard. */
  selectionText: () => string
  /** A paste from the system clipboard: images, a spreadsheet range, text or the board's own copy. True when used. */
  pasteExternal: (data: ClipboardInput, at?: Point) => boolean
  insertImages: (files: readonly File[], at?: Point) => Promise<void>
  /** How many images are being stored now. */
  uploading: number
  selectAll: () => void
  nudge: (dx: number, dy: number) => void
  reorder: (to: "front" | "back") => void
  setStyle: (style: Partial<{ fill: FillKey; stroke: StrokeKey }>) => void
  format: (change: Partial<FormatChange>) => void
  setLink: (link: string | null) => void
  setLocked: (locked: boolean) => void
  align: (how: AlignHow) => void
  distribute: (axis: "horizontal" | "vertical") => void
  tableEdit: (edit: TableEdit) => void
  /** A vote on the selected sticky note: given / taken back, or with a vote budget one more ("add") or one less ("remove"). */
  vote: (mode?: "toggle" | "add" | "remove") => void
  /** The sheet's vote budget (null: one vote per note) and how many the viewer has left. */
  voteBudget: number | null
  votesLeft: number | null
  sortByVotes: () => void
  /** A shape of the library in the middle of the view (or at `at`). */
  insertShape: (kind: ShapeKind, at?: Point) => void
  /** A timer in the middle of the view. */
  insertTimer: () => void
  /** Starts / pauses / resets the selected timer, or sets its length / the vote budget. */
  timer: (action: TimerAction) => void
  /** An arrow between the two selected shapes (Alt+L). */
  connect: () => void
  /** Adds a box of `type` at a point (the right-click menu's "add here"). */
  addAt: (type: DrawBoxType, at: Point) => void
  /** Links the selected box to a backlog item (null: unlinks). */
  setPbi: (pbiId: string | null) => void
  /** Places the AI's summary of the selection beside it, or sorts the selected notes into frames by its groups. */
  placeSummary: (ids: readonly string[], text: string) => void
  placeGroups: (ids: readonly string[], groups: readonly { title: string; items: readonly number[] }[]) => void
  userId: string | null
  snap: boolean
  setSnap: (on: boolean) => void
  /** Grid of moves and new shapes: SNAP_GRID while snapping, 0 otherwise. */
  grid: number
  applyTemplate: (kind: TemplateKind) => void
  /** Mind map: a child of the selected box (Tab). */
  mindChild: () => void
  /** Mind map: a sibling of the selected node; false when it has no parent (Enter then edits). */
  mindSibling: () => boolean
  mindLayout: () => void
  undo: () => void
  redo: () => void
  canUndo: boolean
  canRedo: boolean
  zoomIn: () => void
  zoomOut: () => void
  zoomReset: () => void
  zoomFit: () => void
  /** Brings an element into the middle of the view (a search result, a comment's element). */
  showElement: (id: string) => void
}

/** Width and height of an image file (0 × 0 when the browser cannot read it). */
async function imageSize(file: File): Promise<{ width: number; height: number }> {
  try {
    const bitmap = await createImageBitmap(file)
    const size = { width: bitmap.width, height: bitmap.height }
    bitmap.close?.()
    return size
  } catch {
    return { width: 0, height: 0 }
  }
}

/** The plain text of elements (box texts, labels, table rows as tab-separated lines), top to bottom. */
export function elementsText(elements: readonly KnownElement[]): string {
  const parts: string[] = []
  // Top to bottom, left to right; lines (no position of their own) after the boxes.
  const key = (el: KnownElement) => (isBox(el) ? [0, el.y, el.x] : [1, 0, 0])
  const ordered = [...elements].sort((a, b) => {
    const [p, q] = [key(a), key(b)]
    return p[0] - q[0] || p[1] - q[1] || p[2] - q[2]
  })
  for (const el of ordered) {
    if (isBox(el) && el.type === "table") parts.push((el.cells ?? []).map((row) => row.join("\t")).join("\n"))
    else if (isBox(el) && (el.text || el.body)) parts.push([el.text, el.body].filter(Boolean).join("\n"))
    else if (isLine(el) && el.label) parts.push(el.label)
  }
  return parts.join("\n\n")
}

/**
 * State and commands of the canvas editor of one sheet: tool, selection, view, text editing, and every
 * command the toolbar, the format bar and the keyboard share. All geometry and document changes are the pure
 * functions of `@/lib/board`; this hook only decides which one to call.
 *
 * `clipboardRef` belongs to the board, so copies can be pasted on another sheet.
 */
export function useBoardEditor(doc: SheetDocument, readOnly: boolean, clipboardRef: RefObject<KnownElement[]>, options: BoardEditorOptions): BoardEditorController {
  const elements = doc.elements
  const [tool, setTool] = useState<Tool>("select")
  const [selected, setSelected] = useState<readonly string[]>([])
  const [viewport, setViewport] = useState<Viewport>(INITIAL_VIEWPORT)
  const [editing, setEditing] = useState<EditTarget | null>(null)
  const [activeCell, setActiveCell] = useState<ActiveCell | null>(null)
  const [snap, setSnap] = useState(false)
  const [uploading, setUploading] = useState(0)
  const sizeRef = useRef<CanvasSize>({ width: 800, height: 600 })
  const fittedRef = useRef(false)
  const pasteCountRef = useRef(0)
  /** The text this editor last put on the system clipboard: pasting it back pastes the copied elements. */
  const copiedTextRef = useRef<string | null>(null)
  /** The open formatted-text editor (null while none is open). */
  const richRef = useRef<RichController | null>(null)
  const [richMarks, setRichMarks] = useState<SelectionMarks | null>(null)
  // The upload finishes after renders: it reads the newest elements.
  const elementsRef = useRef(elements)
  useEffect(() => {
    elementsRef.current = elements
  }, [elements])
  // An upload that finishes after the sheet was closed is not placed (the stored file stays unused).
  const mountedRef = useRef(true)
  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  // An undo can take a selected element away.
  const selection = useMemo(() => selected.filter((id) => isKnown(elements[id])), [selected, elements])
  const voteBudget = useMemo(() => voteBudgetOf(elements), [elements])
  const grid = snap ? SNAP_GRID : 0

  const allIds = () =>
    sortByZ(elements)
      .filter(isKnown)
      .map((el) => el.id)
  const center = (): Point => ({ x: sizeRef.current.width / 2, y: sizeRef.current.height / 2 })
  const sheetCenter = (): Point => toSheet(viewport, center())

  /** Zooms around the middle of the canvas. */
  function zoomBy(next: (zoom: number) => number) {
    const anchor = center()
    setViewport((v) => zoomAt(v, anchor, next(v.zoom)))
  }

  function addBox(type: DrawBoxType, rect: Rect) {
    if (readOnly) return
    const id = newElementId()
    // A frame goes behind what it is drawn around.
    doc.commit({ [id]: newBox(type, rect, id, type === "frame" ? bottomZ(elements) : nextZ(elements)) })
    setSelected([id])
    setTool("select")
    // Text and sticky notes are for writing: the caret goes straight in.
    if (type === "text" || type === "sticky") setEditing({ kind: "text", id, typing: false })
  }

  function addLine(type: LineType, start: LineEndInput, end: LineEndInput) {
    if (readOnly) return
    const id = newElementId()
    doc.commit({ [id]: newLine(type, start, end, id, nextZ(elements)) })
    setSelected([id])
    setTool("select")
  }

  function paste(clip: readonly KnownElement[], steps: number) {
    pasteAt(clip, { x: PASTE_OFFSET.x * steps, y: PASTE_OFFSET.y * steps })
  }

  function pasteAt(clip: readonly KnownElement[], offset: Point) {
    if (readOnly || clip.length === 0) return
    const { patch, ids } = pastePatch(elements, clip, newElementId, offset)
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

  function placeTable(cells: Cells, at: Point) {
    const id = newElementId()
    const table = newTableFromCells(cells, at, id, nextZ(elements))
    if (!table) return
    doc.commit({ [id]: { ...table, x: Math.round(at.x - table.w / 2), y: Math.round(at.y - table.h / 2) } })
    setSelected([id])
    options.notify({ tone: "info", text: options.messages.pastedTable(cells.length, cells[0]?.length ?? 0) })
  }

  async function insertImages(files: readonly File[], at?: Point) {
    if (readOnly) return
    const base = at ?? sheetCenter()
    let step = 0
    for (const file of files) {
      if (!IMAGE_TYPES.has(file.type)) {
        options.notify({ tone: "error", text: options.messages.imageNotImage })
        continue
      }
      if (file.size > BOARD_LIMITS.imageBytes) {
        options.notify({ tone: "error", text: options.messages.imageTooLarge })
        continue
      }
      setUploading((n) => n + 1)
      try {
        const [natural, fileId] = await Promise.all([imageSize(file), options.uploadImage(file)])
        if (!mountedRef.current) return
        const id = newElementId()
        const current = elementsRef.current
        const size = natural.width > 0 && natural.height > 0 ? natural : { width: 320, height: 240 }
        const placed = { x: base.x + step * PASTE_OFFSET.x, y: base.y + step * PASTE_OFFSET.y }
        doc.commit({ [id]: newImage(fileId, size, placed, id, nextZ(current)) })
        setSelected([id])
        step += 1
      } catch (error) {
        options.notify({ tone: "error", text: error instanceof Error && error.message ? error.message : options.messages.imageFailed })
      } finally {
        setUploading((n) => n - 1)
      }
    }
  }

  function selectedBox() {
    const el = selection.length === 1 ? elements[selection[0]] : undefined
    return isBox(el) ? el : null
  }

  function startEditingMind(created: { patch: Patch; id: string } | null) {
    if (!created) return
    doc.commit(created.patch)
    setSelected([created.id])
    setEditing({ kind: "text", id: created.id, typing: false })
  }

  return {
    readOnly,
    elements,
    tool,
    setTool: (next) => {
      if (!readOnly) setTool(next)
    },
    selection,
    select: (ids) => {
      // A group is selected as a whole.
      const all = expandGroups(elements, ids)
      setSelected(all)
      if (activeCell && !all.includes(activeCell.id)) setActiveCell(null)
    },
    viewport,
    setViewport,
    reportCanvasSize: (size) => {
      sizeRef.current = size
      if (fittedRef.current || size.width <= 0 || size.height <= 0) return
      fittedRef.current = true
      setViewport(fitViewport(boundsOf(allIds(), elements), size))
    },
    editing,
    editingId: editing?.kind === "text" ? editing.id : null,
    startEditing: (id, typing = false) => {
      const el = elements[id]
      if (readOnly || !isBox(el) || el.locked || el.type === "image") return
      if (el.type === "table" || el.type === "timer") return
      setSelected([id])
      setEditing({ kind: "text", id, typing })
    },
    startCellEditing: (id, row, col) => {
      const el = elements[id]
      if (readOnly || !isBox(el) || el.type !== "table" || el.locked || el.cells?.[row]?.[col] === undefined) return
      setSelected([id])
      setActiveCell({ id, row, col })
      setEditing({ kind: "cell", id, row, col })
    },
    startLabelEditing: (id) => {
      const el = elements[id]
      if (readOnly || !isLine(el) || el.locked) return
      setSelected([id])
      setEditing({ kind: "label", id })
    },
    startBodyEditing: (id, typing = false) => {
      const el = elements[id]
      if (readOnly || !isBox(el) || el.type !== "frame" || el.locked) return
      setSelected([id])
      setEditing({ kind: "body", id, typing })
    },
    finishEditing: (text, runs) => {
      const target = editing
      if (target === null) return
      setEditing(null)
      setRichMarks(null)
      richRef.current = null
      const el = elements[target.id]
      if (target.kind === "label") {
        doc.commit(labelPatch(elements, target.id, text))
        return
      }
      /** Commits a formatted text, saying so when its format was too large to keep. */
      const commitText = (patch: Patch, slot: TextSlot) => {
        doc.commit(patch)
        const stored = patch[target.id]
        if (formatDropped(runs, isBox(stored) ? stored : undefined, slot)) options.notify({ tone: "error", text: options.messages.formatTooLarge })
      }
      if (target.kind === "cell") {
        commitText(cellPatch(elements, target.id, target.row, target.col, text, runs), { kind: "cell", row: target.row, col: target.col })
        return
      }
      if (target.kind === "body") {
        commitText(bodyPatch(elements, target.id, text.trim() === "" ? "" : text, runs), { kind: "body" })
        return
      }
      if (!isBox(el)) return
      // A text element with nothing written is nothing: it goes away instead of staying invisible.
      if (el.type === "text" && text.trim() === "") doc.commit(deletePatch(elements, [target.id]))
      else commitText(textPatch(elements, target.id, text, runs), { kind: "text" })
    },
    registerRich: (controller) => {
      richRef.current = controller
    },
    richMarks,
    setRichMarks,
    endTextEdit: () => richRef.current?.finish(true),
    textFormat: (op, fallback) => {
      if (readOnly) return
      if (richRef.current?.apply(op)) return
      doc.commit(formatPatch(elements, selection, fallback))
    },
    group: () => {
      if (readOnly) return
      const ids = expandGroups(elements, selection)
      if (ids.length < 2) return
      doc.commit(groupPatch(elements, ids, newElementId()))
      setSelected(ids)
    },
    ungroup: () => {
      if (readOnly) return
      doc.commit(ungroupPatch(elements, selection))
    },
    tableTrack: (axis, delta) => {
      if (readOnly || !activeCell) return
      const table = elements[activeCell.id]
      if (!isBox(table) || !table.colWidths || !table.rowHeights) return
      const index = axis === "col" ? activeCell.col : activeCell.row
      const current = (axis === "col" ? table.colWidths : table.rowHeights)[index]
      if (current === undefined) return
      doc.commit(tableTrackPatch(elements, table.id, axis, index, current + delta))
    },
    activeCell,
    setActiveCell,
    commit: doc.commit,
    addBox,
    addLine,
    placeAtCenter: () => {
      if (tool === "select") return
      const c = sheetCenter()
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
    duplicateBy: (ids, offset) => pasteAt(copyElements(elements, ids), offset),
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
    selectionText: () => {
      const text = elementsText(selection.map((id) => elements[id]).filter(isKnown))
      // Never empty: an empty clipboard text could not be told apart from "nothing copied here".
      copiedTextRef.current = text || "​"
      return copiedTextRef.current
    },
    pasteExternal: (data, at) => {
      if (readOnly) return false
      // A spreadsheet range comes with a picture of itself: the table wins over the picture.
      const cells = (data.html && typeof DOMParser !== "undefined" ? parseHtmlTable(data.html, (html) => new DOMParser().parseFromString(html, "text/html")) : null) ?? parseTsv(data.text)
      const isTable = !!cells && (cells.length > 1 || (cells[0]?.length ?? 0) > 1)
      const images = data.files.filter((file) => file.type.startsWith("image/"))
      if (images.length > 0 && !isTable) {
        void insertImages(images, at)
        return true
      }
      // The board's own copy comes back as the text it wrote: paste the elements, not the text.
      if (copiedTextRef.current !== null && data.text === copiedTextRef.current && clipboardRef.current.length > 0) {
        pasteCountRef.current += 1
        paste(clipboardRef.current, pasteCountRef.current)
        return true
      }
      if (cells && isTable) {
        placeTable(cells, at ?? sheetCenter())
        return true
      }
      const text = data.text.trim()
      if (!text) return false
      const c = at ?? sheetCenter()
      const id = newElementId()
      const box = newBox("text", { x: c.x - 120, y: c.y - 30, w: 240, h: 60 }, id, nextZ(elements))
      doc.commit({ [id]: { ...box, text: text.slice(0, BOARD_LIMITS.textLength) } })
      setSelected([id])
      return true
    },
    insertImages,
    uploading,
    selectAll: () => setSelected(allIds()),
    nudge: (dx, dy) => {
      if (selection.length > 0) doc.commit(movePatch(elements, selection, dx, dy))
    },
    reorder: (to) => doc.commit(reorderPatch(elements, selection, to)),
    setStyle: (style) => doc.commit(stylePatch(elements, selection, style)),
    format: (change) => doc.commit(formatPatch(elements, selection, change)),
    setLink: (link) => doc.commit(linkPatch(elements, selection, link)),
    setLocked: (locked) => doc.commit(lockPatch(elements, selection, locked)),
    align: (how) => doc.commit(alignPatch(elements, selection, how)),
    distribute: (axis) => doc.commit(distributePatch(elements, selection, axis)),
    tableEdit: (edit) => {
      if (!activeCell) return
      const patch = tablePatch(elements, activeCell.id, activeCell.row, activeCell.col, edit)
      doc.commit(patch)
      const table = patch[activeCell.id]
      if (isBox(table) && table.cells) {
        const row = Math.min(activeCell.row + (edit === "row-below" ? 1 : 0), table.cells.length - 1)
        const col = Math.min(activeCell.col + (edit === "col-right" ? 1 : 0), (table.cells[0]?.length ?? 1) - 1)
        setActiveCell({ id: activeCell.id, row, col })
      }
    },
    vote: (mode = "toggle") => {
      const box = selectedBox()
      if (box && options.userId) doc.commit(votePatch(elements, box.id, options.userId, mode))
    },
    voteBudget,
    votesLeft: voteBudget !== null && options.userId ? Math.max(0, voteBudget - votesUsed(elements, options.userId)) : null,
    sortByVotes: () => {
      if (!readOnly) doc.commit(sortByVotesPatch(elements, selection))
    },
    insertShape: (kind, at) => {
      if (readOnly) return
      const id = newElementId()
      doc.commit({ [id]: newShape(kind, at ?? sheetCenter(), id, nextZ(elements)) })
      setSelected([id])
      setTool("select")
    },
    insertTimer: () => {
      if (readOnly) return
      const id = newElementId()
      doc.commit({ [id]: newTimer(5, sheetCenter(), id, nextZ(elements)) })
      setSelected([id])
      setTool("select")
    },
    timer: (action) => {
      const box = selectedBox()
      if (!readOnly && box?.type === "timer") doc.commit(timerPatch(elements, box.id, action, options.now?.() ?? Date.now()))
    },
    connect: () => {
      if (readOnly) return
      const made = connectPatch(elements, selection, newElementId)
      if (!made) return
      doc.commit(made.patch)
      setSelected([made.id])
    },
    addAt: (type, at) => {
      const size = DEFAULT_BOX_SIZE[type]
      addBox(type, { x: at.x - size.w / 2, y: at.y - size.h / 2, w: size.w, h: size.h })
    },
    setPbi: (pbiId) => {
      const box = selectedBox()
      if (!readOnly && box) doc.commit(pbiPatch(elements, box.id, pbiId))
    },
    placeSummary: (ids, text) => {
      if (readOnly) return
      // The newest elements: the answer comes back after renders.
      const made = besidePatch(elementsRef.current, ids, text, newElementId)
      if (!made || !mountedRef.current) return
      doc.commit(made.patch)
      setSelected([made.id])
    },
    placeGroups: (ids, groups) => {
      if (readOnly || !mountedRef.current) return
      const made = groupFramesPatch(elementsRef.current, ids, groups, newElementId)
      if (made.frameIds.length === 0) return
      doc.commit(made.patch)
      setSelected(made.frameIds)
    },
    userId: options.userId,
    snap,
    setSnap,
    grid,
    applyTemplate: (kind) => {
      if (readOnly) return
      // Beside what is already drawn (not on top of it), and behind everything: frames hold, they do not cover.
      const drawn = boundsOf(allIds(), elements)
      let probeId = 0
      const probe = templatePatch(kind, options.templateTexts, { x: 0, y: 0 }, () => `probe-${++probeId}`, 0)
      const size = boundsOf(Object.keys(probe.patch), probe.patch as ElementMap)
      const at = drawn && size ? { x: drawn.x + drawn.w + 80 + size.w / 2, y: drawn.y + size.h / 2 } : sheetCenter()
      const count = Object.keys(probe.patch).length
      const { patch, ids } = templatePatch(kind, options.templateTexts, at, newElementId, Math.max(-BOARD_LIMITS.counter, bottomZ(elements) - count))
      doc.commit(patch)
      setSelected(ids)
      const bounds = boundsOf(ids, { ...elements, ...(patch as ElementMap) })
      if (bounds) setViewport(fitViewport(bounds, sizeRef.current))
    },
    mindChild: () => {
      const box = selectedBox()
      if (!readOnly && box) startEditingMind(mindChildPatch(elements, box.id, newElementId))
    },
    mindSibling: () => {
      const box = selectedBox()
      if (readOnly || !box || !mindParent(elements, box.id)) return false
      startEditingMind(mindSiblingPatch(elements, box.id, newElementId))
      return true
    },
    mindLayout: () => {
      const box = selectedBox()
      if (!readOnly && box) doc.commit(mindLayoutPatch(elements, box.id))
    },
    undo: doc.undo,
    redo: doc.redo,
    canUndo: doc.canUndo,
    canRedo: doc.canRedo,
    zoomIn: () => zoomBy((zoom) => stepZoom(zoom, 1)),
    zoomOut: () => zoomBy((zoom) => stepZoom(zoom, -1)),
    zoomReset: () => zoomBy(() => 1),
    zoomFit: () => setViewport(fitViewport(boundsOf(allIds(), elements), sizeRef.current)),
    showElement: (id) => {
      const bounds = boundsOf([id], elements)
      if (!bounds) return
      // Fitted, but not closer than 100%, with room around it.
      const pad = 160
      const fitted = fitViewport({ x: bounds.x - pad, y: bounds.y - pad, w: bounds.w + 2 * pad, h: bounds.h + 2 * pad }, sizeRef.current)
      const zoom = Math.min(1, fitted.zoom)
      const c = { x: bounds.x + bounds.w / 2, y: bounds.y + bounds.h / 2 }
      fittedRef.current = true
      setViewport({ zoom, x: sizeRef.current.width / 2 - c.x * zoom, y: sizeRef.current.height / 2 - c.y * zoom })
    },
  }
}
