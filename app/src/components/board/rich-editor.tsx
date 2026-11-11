"use client"

import { useEffect, useId, useLayoutEffect, useRef, type CSSProperties } from "react"
import type { FontFamily, StrokeKey, TextRun, TextRuns } from "@/lib/board/model"
import { STROKE_COLOR } from "@/lib/board/palette"
import { applyMarks, MARK_KEYS, normalizeRuns, plainRuns, rangeFontSize, rangeHas, truncateRuns, type BaseMarks, type RunMarks } from "@/lib/board/rich"
import { FONT_STACK, stepFontSize } from "@/lib/board/style"

/** A format command for the selected characters of the text being edited. */
export type RichOp =
  | { toggle: "bold" | "italic" | "underline" }
  | { sizeStep: 1 | -1 }
  | { fontSize: number }
  | { fontFamily: FontFamily }
  | { color: StrokeKey }

/** What the editor reaches of the open text editor. */
export interface RichController {
  /** Formats the selected characters (false: nothing is selected). */
  apply: (op: RichOp) => boolean
  /** Ends the edit (Esc in the format bar); `refocus` gives the canvas the focus back. */
  finish: (refocus: boolean) => void
}

/** The format of the selected characters (what the format bar shows as on / off while a text is edited). */
export interface SelectionMarks {
  bold: boolean
  italic: boolean
  underline: boolean
  /** Null when the selected characters have different sizes. */
  fontSize: number | null
}

/** Marks the format bar: clicking it does not end the edit. */
export const FORMAT_BAR_ATTR = "data-board-format"

// ---------------------------------------------------------------------------
// DOM <-> runs (the editable area holds spans; each span says its marks in data-marks)
// ---------------------------------------------------------------------------

function cssText(marks: RunMarks, scale: number): string {
  const parts: string[] = []
  if (marks.bold !== undefined) parts.push(`font-weight:${marks.bold ? 700 : 400}`)
  if (marks.italic !== undefined) parts.push(`font-style:${marks.italic ? "italic" : "normal"}`)
  if (marks.underline !== undefined) parts.push(`text-decoration:${marks.underline ? "underline" : "none"}`)
  if (marks.fontSize !== undefined) parts.push(`font-size:${marks.fontSize * scale}px`)
  if (marks.fontFamily !== undefined) parts.push(`font-family:${FONT_STACK[marks.fontFamily]}`)
  if (marks.color !== undefined) parts.push(`color:${STROKE_COLOR[marks.color]}`)
  return parts.join(";")
}

function marksOf(run: TextRun): RunMarks {
  const marks: Record<string, unknown> = {}
  for (const key of MARK_KEYS) if (run[key] !== undefined) marks[key] = run[key]
  return marks as RunMarks
}

/** Fills the editable area with the runs. A trailing line break needs a <br> after it to be shown (and typed after). */
export function renderRuns(root: HTMLElement, runs: readonly TextRun[], scale: number) {
  const doc = root.ownerDocument
  root.replaceChildren()
  let text = ""
  for (const run of runs) {
    if (run.text === "") continue
    const span = doc.createElement("span")
    const marks = marksOf(run)
    span.dataset.marks = JSON.stringify(marks)
    span.style.cssText = cssText(marks, scale)
    span.textContent = run.text
    root.appendChild(span)
    text += run.text
  }
  if (text.endsWith("\n")) root.appendChild(doc.createElement("br"))
}

/** The pieces of text in the area, in order: text nodes, and <br>s that count as line breaks. */
function units(root: HTMLElement): Node[] {
  const out: Node[] = []
  const walker = root.ownerDocument.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT)
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (node.nodeType === Node.TEXT_NODE || (node as Element).tagName === "BR") out.push(node)
  }
  // The last <br> after all text only holds the empty last line open: it is no character.
  let lastText = -1
  let trailing = -1
  out.forEach((node, i) => {
    if (node.nodeType === Node.TEXT_NODE) {
      if ((node as Text).data !== "") lastText = i
    } else if (i > lastText) trailing = i
  })
  return trailing > lastText ? out.filter((_, i) => i !== trailing) : out
}

function nodeMarks(node: Node, root: HTMLElement): RunMarks {
  const span = (node.nodeType === Node.ELEMENT_NODE ? (node as Element) : node.parentElement)?.closest<HTMLElement>("[data-marks]")
  if (!span || !root.contains(span)) return {}
  try {
    const parsed: unknown = JSON.parse(span.dataset.marks ?? "{}")
    return typeof parsed === "object" && parsed !== null ? (parsed as RunMarks) : {}
  } catch {
    return {}
  }
}

/** The runs in the area now. */
export function readRuns(root: HTMLElement): TextRun[] {
  return units(root).map((node) => ({ ...nodeMarks(node, root), text: node.nodeType === Node.TEXT_NODE ? (node as Text).data : "\n" }))
}

/** The character offset of a DOM position in the area. */
function offsetOf(root: HTMLElement, container: Node, offset: number): number {
  const range = root.ownerDocument.createRange()
  range.setStart(container, offset)
  range.collapse(true)
  let count = 0
  for (const node of units(root)) {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node as Text
      if (text === container) count += offset
      else if (range.comparePoint(text, text.length) <= 0) count += text.length
    } else {
      const parent = node.parentNode
      if (parent && range.comparePoint(parent, Array.prototype.indexOf.call(parent.childNodes, node) + 1) <= 0) count += 1
    }
  }
  return count
}

/** The DOM position of a character offset in the area. */
function pointAt(root: HTMLElement, offset: number): { node: Node; offset: number } {
  let left = offset
  for (const node of units(root)) {
    if (node.nodeType === Node.TEXT_NODE) {
      const length = (node as Text).length
      if (left <= length) return { node, offset: left }
      left -= length
    } else {
      const parent = node.parentNode as Node
      const index = Array.prototype.indexOf.call(parent.childNodes, node)
      if (left === 0) return { node: parent, offset: index }
      left -= 1
    }
  }
  const last = root.lastChild
  // Before the <br> that holds an empty last line open.
  if (last && last.nodeName === "BR") return { node: root, offset: root.childNodes.length - 1 }
  return { node: root, offset: root.childNodes.length }
}

/** The selected characters [start, end) of the area, or null when the selection is not in it. */
function selectionIn(root: HTMLElement): { start: number; end: number } | null {
  const selection = root.ownerDocument.getSelection()
  if (!selection || selection.rangeCount === 0) return null
  const range = selection.getRangeAt(0)
  if (!root.contains(range.startContainer) || !root.contains(range.endContainer)) return null
  const a = offsetOf(root, range.startContainer, range.startOffset)
  const b = offsetOf(root, range.endContainer, range.endOffset)
  return { start: Math.min(a, b), end: Math.max(a, b) }
}

function select(root: HTMLElement, start: number, end: number) {
  const selection = root.ownerDocument.getSelection()
  if (!selection) return
  const from = pointAt(root, start)
  const to = pointAt(root, end)
  const range = root.ownerDocument.createRange()
  range.setStart(from.node, from.offset)
  range.setEnd(to.node, to.offset)
  selection.removeAllRanges()
  selection.addRange(range)
}

/**
 * Types `text` at the caret (replacing the selection), as plain characters in the format around the caret — no more
 * than the text may still take (`maxLength`).
 */
function insertPlain(root: HTMLElement, text: string, maxLength: number) {
  const selection = root.ownerDocument.getSelection()
  if (!selection || selection.rangeCount === 0) return
  const range = selection.getRangeAt(0)
  if (!root.contains(range.startContainer) || !root.contains(range.endContainer)) return
  const selected = selectionIn(root)
  const length = readRuns(root).reduce((sum, r) => sum + r.text.length, 0)
  const room = maxLength - (length - (selected ? selected.end - selected.start : 0))
  const typed = text.slice(0, Math.max(0, room))
  if (typed === "") return
  range.deleteContents()
  const node = root.ownerDocument.createTextNode(typed)
  range.insertNode(node)
  range.setStartAfter(node)
  range.collapse(true)
  selection.removeAllRanges()
  selection.addRange(range)
  const all = readRuns(root)
    .map((r) => r.text)
    .join("")
  if (all.endsWith("\n") && root.lastChild?.nodeName !== "BR") root.appendChild(root.ownerDocument.createElement("br"))
}

/** The runs after a format command on [start, end); null when the command does not apply. */
export function runsAfter(runs: readonly TextRun[], start: number, end: number, base: BaseMarks, op: RichOp): TextRuns | null | "unchanged" {
  // A mark equal to the box's own setting is removed rather than repeated.
  const set = <K extends keyof RunMarks>(key: K, value: RunMarks[K]) => applyMarks(runs, start, end, { [key]: value === base[key as keyof BaseMarks] ? undefined : value } as Partial<RunMarks>)
  if ("toggle" in op) return set(op.toggle, !rangeHas(runs, start, end, base, op.toggle))
  if ("sizeStep" in op) return set("fontSize", stepFontSize(rangeFontSize(runs, start, end, base) ?? base.fontSize, op.sizeStep))
  if ("fontSize" in op) return set("fontSize", op.fontSize)
  if ("fontFamily" in op) return set("fontFamily", op.fontFamily)
  if ("color" in op) return set("color", op.color)
  return "unchanged"
}

interface RichTextOverlayProps {
  /** Screen rectangle of the area. */
  rect: { x: number; y: number; w: number; h: number }
  /** The text's own CSS (font, size, colour, alignment) at the overlay's scale. */
  css: CSSProperties
  /** How runs are drawn: sheet units × scale. */
  scale: number
  base: BaseMarks
  text: string
  runs: TextRuns | null
  background: string
  padding: number
  label: string
  hint: string
  maxLength: number
  /** Typing started the edit: the caret goes to the end, nothing is selected. */
  typing: boolean
  register: (controller: RichController | null) => void
  /** The format of the selected characters, whenever the selection changes (null: none selected). */
  onMarks: (marks: SelectionMarks | null) => void
  onDone: (text: string, runs: TextRuns | null, refocus: boolean) => void
}

/** The format of [start, end) of the runs, resolved against the box. */
function marksOfRange(runs: readonly TextRun[], start: number, end: number, base: BaseMarks): SelectionMarks {
  return {
    bold: rangeHas(runs, start, end, base, "bold"),
    italic: rangeHas(runs, start, end, base, "italic"),
    underline: rangeHas(runs, start, end, base, "underline"),
    fontSize: rangeFontSize(runs, start, end, base),
  }
}

/**
 * The editable text laid over the text being edited: characters can be selected and formatted on their own (format
 * bar, Ctrl+B / I / U, Ctrl+] / [ for the size). Esc or Ctrl+Enter ends, so does leaving it (the format bar does not
 * count as leaving). Only plain text comes in by paste.
 */
export function RichTextOverlay({ rect, css, scale, base, text, runs, background, padding, label, hint, maxLength, typing, register, onMarks, onDone }: RichTextOverlayProps) {
  const ref = useRef<HTMLDivElement>(null)
  const doneRef = useRef(false)
  /** The focus went to the format bar (keyboard): the edit stays open until something else is used. */
  const awayRef = useRef(false)
  const hintId = useId()
  const scaleRef = useRef(scale)
  const baseRef = useRef(base)
  const marksRef = useRef<string>("null")
  const onMarksRef = useRef(onMarks)
  useEffect(() => {
    baseRef.current = base
    onMarksRef.current = onMarks
  })

  /** Tells the editor the format of the selected characters (only when it changed). */
  function reportMarks() {
    const root = ref.current
    const selected = root ? selectionIn(root) : null
    const marks = root && selected && selected.start < selected.end ? marksOfRange(readRuns(root), selected.start, selected.end, baseRef.current) : null
    const key = JSON.stringify(marks)
    if (key === marksRef.current) return
    marksRef.current = key
    onMarksRef.current(marks)
  }
  const reportRef = useRef(reportMarks)
  useEffect(() => {
    reportRef.current = reportMarks
  })

  function finish(refocus: boolean) {
    const root = ref.current
    if (doneRef.current || !root) return
    doneRef.current = true
    const read = truncateRuns(readRuns(root), maxLength)
    onMarksRef.current(null)
    onDone(read.map((r) => r.text).join(""), normalizeRuns(read), refocus)
  }
  const finishRef = useRef(finish)
  useEffect(() => {
    finishRef.current = finish
  })

  useLayoutEffect(() => {
    const root = ref.current
    if (!root) return
    renderRuns(root, runs ?? plainRuns(text), scaleRef.current)
    root.focus({ preventScroll: true })
    const length = text.length
    if (typing) select(root, length, length)
    else select(root, 0, length)
    // Mount only: the overlay is keyed by what it edits.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // The view zoomed while editing: the run sizes follow.
  useEffect(() => {
    const root = ref.current
    if (!root || scaleRef.current === scale) return
    scaleRef.current = scale
    const selected = selectionIn(root)
    renderRuns(root, readRuns(root), scale)
    if (selected) select(root, selected.start, selected.end)
  }, [scale])

  /** Formats [start, end) and keeps those characters selected (the focus stays where it is). */
  function format(op: RichOp, start: number, end: number): boolean {
    const root = ref.current
    if (!root || start >= end) return false
    const current = readRuns(root)
    const next = runsAfter(current, start, end, baseRef.current, op)
    if (next === "unchanged") return false
    renderRuns(root, next ?? plainRuns(current.map((r) => r.text).join("")), scaleRef.current)
    select(root, start, end)
    reportRef.current()
    return true
  }

  useEffect(() => {
    const controller: RichController = {
      apply: (op) => {
        const root = ref.current
        const selected = root ? selectionIn(root) : null
        return !!selected && format(op, selected.start, selected.end)
      },
      finish: (refocus) => finishRef.current(refocus),
    }
    register(controller)
    return () => register(null)
  }, [register])

  // The format bar shows the format of the selected characters.
  useEffect(() => {
    const onSelection = () => reportRef.current()
    document.addEventListener("selectionchange", onSelection)
    return () => document.removeEventListener("selectionchange", onSelection)
  }, [])

  // With the focus in the format bar, using anything else (pointer or keyboard) ends the edit.
  useEffect(() => {
    const outside = (target: EventTarget | null) => {
      const el = target instanceof Element ? target : null
      return !el || !(ref.current?.contains(el) || el.closest(`[${FORMAT_BAR_ATTR}]`))
    }
    function onPointerDown(e: PointerEvent) {
      if (awayRef.current && outside(e.target)) finishRef.current(false)
    }
    function onFocusIn(e: FocusEvent) {
      if (awayRef.current && outside(e.target)) finishRef.current(false)
    }
    document.addEventListener("pointerdown", onPointerDown, true)
    document.addEventListener("focusin", onFocusIn)
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true)
      document.removeEventListener("focusin", onFocusIn)
    }
  }, [])

  function onKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.nativeEvent.isComposing) return
    const root = ref.current
    if (!root) return
    const mod = e.ctrlKey || e.metaKey
    if (e.key === "Escape" || (e.key === "Enter" && mod)) {
      e.preventDefault()
      e.stopPropagation()
      finish(true)
      return
    }
    if (e.key === "Enter") {
      e.preventDefault()
      insertPlain(root, "\n", maxLength)
      return
    }
    if (mod && !e.altKey) {
      const key = e.key.toLowerCase()
      const op: RichOp | null =
        key === "b" ? { toggle: "bold" } : key === "i" ? { toggle: "italic" } : key === "u" ? { toggle: "underline" } : key === "]" ? { sizeStep: 1 } : key === "[" ? { sizeStep: -1 } : null
      if (op) {
        e.preventDefault()
        // Nothing selected: the whole text (as the format bar does for the shape).
        const selected = selectionIn(root)
        const length = readRuns(root).reduce((sum, r) => sum + r.text.length, 0)
        if (selected && selected.start < selected.end) format(op, selected.start, selected.end)
        else if (format(op, 0, length) && selected) select(root, selected.start, selected.start)
      }
    }
  }

  return (
    <>
      <span id={hintId} hidden>
        {hint}
      </span>
      <div
        ref={ref}
        role="textbox"
        aria-multiline="true"
        aria-label={label}
        aria-describedby={hintId}
        contentEditable
        suppressContentEditableWarning
        spellCheck={false}
        data-testid="board-rich-editor"
        onKeyDown={onKeyDown}
        onPaste={(e) => {
          e.preventDefault()
          const root = ref.current
          if (root) insertPlain(root, e.clipboardData.getData("text/plain").replace(/\r\n?/g, "\n"), maxLength)
        }}
        onDrop={(e) => e.preventDefault()}
        onBlur={(e) => {
          const next = e.relatedTarget as Element | null
          if (next?.closest(`[${FORMAT_BAR_ATTR}]`)) {
            awayRef.current = true
            return
          }
          finish(false)
        }}
        className="absolute overflow-hidden whitespace-pre-wrap rounded-ui-sm border-2 border-primary outline-none [overflow-wrap:anywhere]"
        style={{
          ...css,
          left: rect.x,
          top: rect.y,
          width: Math.max(rect.w, 40),
          minHeight: Math.max(rect.h, 24),
          padding,
          backgroundColor: background,
          cursor: "text",
        }}
      />
    </>
  )
}
