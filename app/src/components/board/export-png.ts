"use client"

import { boundsOf, FRAME_TITLE_HEIGHT, lineGeometry, sortByZ, type ElementMap, type Point } from "@/lib/board/geometry"
import { isBox, isLine, type BoxElement, type HAlign, type LineElement, type TextRun, type VAlign } from "@/lib/board/model"
import { slotContent } from "@/lib/board/ops"
import { FILL_COLOR, STROKE_COLOR } from "@/lib/board/palette"
import { effectiveMarks, type BaseMarks } from "@/lib/board/rich"
import { baseMarks, boxOutline, dashArray, FONT_STACK, lineStyle, TEXT_PADDING, textStyle, type TextSlot } from "@/lib/board/style"
import { arrowHeadPoints } from "./element-view"

/**
 * The sheet as a PNG, drawn with the 2D canvas (not by rasterizing the SVG: its HTML text would taint the
 * canvas). Images come from the board's own file route (same origin, so the canvas stays readable). Runs in the
 * browser only; nothing leaves it — the file is handed to the person as a download.
 */

const PADDING = 32
const SCALE = 2
/** Largest canvas side browsers draw reliably. */
const MAX_SIDE = 8192

/** A palette value (`var(--token)`) as a colour the canvas understands, from the current theme. */
function resolve(value: string, styles: CSSStyleDeclaration): string {
  const match = /^var\((--[\w-]+)\)$/.exec(value)
  if (!match) return value
  return styles.getPropertyValue(match[1]).trim() || "#000"
}

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((done) => {
    const img = new Image()
    img.onload = () => done(img)
    img.onerror = () => done(null)
    img.src = src
  })
}

function setDash(ctx: CanvasRenderingContext2D, dash: string | undefined) {
  ctx.setLineDash(dash ? dash.split(" ").map(Number) : [])
}

/** One character with the format it is drawn in. */
interface Glyph {
  ch: string
  font: string
  size: number
  color: string
  underline: boolean
  width: number
}

interface GlyphLine {
  glyphs: Glyph[]
  width: number
  /** Tallest text size on the line. */
  size: number
}

/** Breaks formatted text into lines that fit `width` (by characters, so Japanese without spaces wraps too). */
function layoutGlyphs(ctx: CanvasRenderingContext2D, runs: readonly TextRun[], base: BaseMarks, width: number, styles: CSSStyleDeclaration): GlyphLine[] {
  const lines: GlyphLine[] = []
  let line: GlyphLine = { glyphs: [], width: 0, size: base.fontSize }
  const push = () => {
    lines.push(line)
    line = { glyphs: [], width: 0, size: base.fontSize }
  }
  for (const run of runs) {
    const m = effectiveMarks(run, base)
    const font = `${m.italic ? "italic " : ""}${m.bold ? "700" : "400"} ${m.fontSize}px ${FONT_STACK[m.fontFamily]}`
    const color = m.color === "fg" ? resolve("var(--color-fg)", styles) : resolve(STROKE_COLOR[m.color], styles)
    ctx.font = font
    for (const ch of Array.from(run.text)) {
      if (ch === "\n") {
        push()
        continue
      }
      const w = ctx.measureText(ch).width
      if (line.glyphs.length > 0 && line.width + w > width) {
        push()
        if (ch.trim() === "") continue
      }
      line.glyphs.push({ ch, font, size: m.fontSize, color, underline: m.underline, width: w })
      line.width += w
      line.size = Math.max(line.size, m.fontSize)
    }
  }
  lines.push(line)
  return lines
}

interface TextLook {
  base: BaseMarks
  align: HAlign
  valign: VAlign
}

function drawRuns(ctx: CanvasRenderingContext2D, runs: readonly TextRun[], look: TextLook, area: { x: number; y: number; w: number; h: number }, styles: CSSStyleDeclaration, padding = TEXT_PADDING) {
  const inner = { x: area.x + padding, y: area.y + padding, w: Math.max(1, area.w - 2 * padding), h: area.h - 2 * padding }
  const lines = layoutGlyphs(ctx, runs, look.base, inner.w, styles)
  const height = lines.reduce((sum, l) => sum + l.size * 1.4, 0)
  let y = look.valign === "top" ? inner.y : look.valign === "bottom" ? inner.y + inner.h - height : inner.y + (inner.h - height) / 2
  ctx.save()
  ctx.beginPath()
  ctx.rect(area.x, area.y, area.w, area.h)
  ctx.clip()
  ctx.textBaseline = "alphabetic"
  for (const line of lines) {
    const lineHeight = line.size * 1.4
    const baseline = y + (lineHeight - line.size) / 2 + line.size * 0.88
    let x = look.align === "left" ? inner.x : look.align === "right" ? inner.x + inner.w - line.width : inner.x + (inner.w - line.width) / 2
    for (const g of line.glyphs) {
      ctx.font = g.font
      ctx.fillStyle = g.color
      ctx.fillText(g.ch, x, baseline)
      if (g.underline) ctx.fillRect(x, baseline + Math.max(1, g.size * 0.08), g.width, Math.max(1, g.size / 14))
      x += g.width
    }
    y += lineHeight
  }
  ctx.restore()
}

/** A box's text (or one of its slots) as the drawing shows it. */
function drawText(ctx: CanvasRenderingContext2D, el: BoxElement, slot: TextSlot, area: { x: number; y: number; w: number; h: number }, styles: CSSStyleDeclaration, look: Partial<TextLook> = {}) {
  const content = slotContent(el, slot)
  if (content.text === "") return
  const s = textStyle(el)
  drawRuns(ctx, content.runs ?? [{ text: content.text }], { base: look.base ?? baseMarks(el, slot), align: look.align ?? s.align, valign: look.valign ?? s.valign }, area, styles)
}

function drawLine(ctx: CanvasRenderingContext2D, el: LineElement, elements: ElementMap, styles: CSSStyleDeclaration) {
  const g = lineGeometry(el, elements)
  const s = lineStyle(el)
  const color = resolve(STROKE_COLOR[el.stroke], styles)
  ctx.strokeStyle = color
  ctx.fillStyle = color
  ctx.lineWidth = s.width
  ctx.lineCap = "round"
  ctx.lineJoin = "round"
  setDash(ctx, dashArray(s.dash, s.width))
  ctx.stroke(new Path2D(g.d))
  setDash(ctx, undefined)
  const head = 12 + (s.width - 2) * 2
  const heads: Point[][] = [s.arrowEnd ? arrowHeadPoints(g.endFrom, g.b, head) : [], s.arrowStart ? arrowHeadPoints(g.startFrom, g.a, head) : []]
  for (const points of heads) {
    if (points.length === 0) continue
    ctx.beginPath()
    points.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)))
    ctx.closePath()
    ctx.fill()
  }
  if (el.label) {
    ctx.font = `400 12px ${FONT_STACK.sans}`
    const w = ctx.measureText(el.label).width + 8
    ctx.fillStyle = resolve("var(--color-surface)", styles)
    ctx.fillRect(g.mid.x - w / 2, g.mid.y - 10, w, 20)
    ctx.fillStyle = color
    ctx.textBaseline = "middle"
    ctx.fillText(el.label, g.mid.x - w / 2 + 4, g.mid.y)
  }
}

async function drawBox(ctx: CanvasRenderingContext2D, el: BoxElement, styles: CSSStyleDeclaration, fileUrl: (id: string) => string) {
  const fill = resolve(FILL_COLOR[el.fill], styles)
  const stroke = resolve(STROKE_COLOR[el.stroke], styles)
  const outline = boxOutline(el)
  ctx.fillStyle = fill
  ctx.strokeStyle = stroke
  ctx.lineWidth = Math.max(outline.width, el.type === "frame" ? 1 : 0)
  setDash(ctx, dashArray(outline.dash, ctx.lineWidth))
  const path = new Path2D()
  if (el.type === "ellipse") path.ellipse(el.x + el.w / 2, el.y + el.h / 2, el.w / 2, el.h / 2, 0, 0, Math.PI * 2)
  else path.rect(el.x, el.y, el.w, el.h)
  if (el.type === "image") {
    const img = el.fileId ? await loadImage(fileUrl(el.fileId)) : null
    if (img) {
      const scale = Math.min(el.w / img.naturalWidth, el.h / img.naturalHeight)
      const w = img.naturalWidth * scale
      const h = img.naturalHeight * scale
      ctx.drawImage(img, el.x + (el.w - w) / 2, el.y + (el.h - h) / 2, w, h)
    }
  } else if (el.fill !== "none") ctx.fill(path)
  if (ctx.lineWidth > 0) ctx.stroke(path)
  setDash(ctx, undefined)

  if (el.type === "frame") {
    ctx.fillStyle = resolve("var(--color-surface-sunken)", styles)
    ctx.fillRect(el.x, el.y, el.w, FRAME_TITLE_HEIGHT)
    const title = { ...baseMarks(el), fontSize: Math.min(textStyle(el).fontSize, 20) }
    if (el.text) drawRuns(ctx, [{ text: el.text }], { base: title, align: "left", valign: "middle" }, { x: el.x, y: el.y, w: el.w, h: FRAME_TITLE_HEIGHT }, styles)
    drawText(ctx, el, { kind: "body" }, { x: el.x, y: el.y + FRAME_TITLE_HEIGHT, w: el.w, h: Math.max(1, el.h - FRAME_TITLE_HEIGHT) }, styles)
  } else if (el.type === "table") {
    let y = el.y
    ctx.lineWidth = 1
    ctx.strokeStyle = stroke
    ;(el.cells ?? []).forEach((row, i) => {
      let x = el.x
      const h = el.rowHeights?.[i] ?? 0
      row.forEach((_cell, j) => {
        const w = el.colWidths?.[j] ?? 0
        ctx.strokeRect(x, y, w, h)
        drawText(ctx, el, { kind: "cell", row: i, col: j }, { x: x - 2, y: y - 4, w: w + 4, h: h + 8 }, styles, { align: "left" })
        x += w
      })
      y += h
    })
  } else if (el.type !== "image") drawText(ctx, el, { kind: "text" }, el, styles)

  const votes = el.voters?.length ?? 0
  if (el.type === "sticky" && votes > 0) {
    const primary = resolve("var(--color-primary)", styles)
    ctx.beginPath()
    ctx.arc(el.x + el.w - 14, el.y + el.h - 14, 11, 0, Math.PI * 2)
    ctx.fillStyle = primary
    ctx.fill()
    ctx.fillStyle = resolve("var(--color-surface)", styles)
    ctx.font = `700 11px ${FONT_STACK.sans}`
    ctx.textBaseline = "middle"
    const label = String(votes)
    ctx.fillText(label, el.x + el.w - 14 - ctx.measureText(label).width / 2, el.y + el.h - 14)
  }
}

/** Draws every element and resolves to the PNG; null when there is nothing to draw or the browser cannot. */
export async function renderSheetPng(elements: ElementMap, fileUrl: (fileId: string) => string): Promise<Blob | null> {
  const ordered = sortByZ(elements).filter((el) => isBox(el) || isLine(el))
  const bounds = boundsOf(
    ordered.map((el) => el.id),
    elements,
  )
  if (!bounds) return null
  const w = bounds.w + PADDING * 2
  const h = bounds.h + PADDING * 2
  const scale = Math.min(SCALE, MAX_SIDE / Math.max(w, h, 1))
  const canvas = document.createElement("canvas")
  canvas.width = Math.max(1, Math.round(w * scale))
  canvas.height = Math.max(1, Math.round(h * scale))
  const ctx = canvas.getContext("2d")
  if (!ctx) return null
  const styles = getComputedStyle(document.documentElement)
  ctx.fillStyle = resolve("var(--color-surface)", styles)
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.scale(scale, scale)
  ctx.translate(PADDING - bounds.x, PADDING - bounds.y)
  for (const el of ordered) {
    if (isBox(el)) await drawBox(ctx, el, styles, fileUrl)
    else if (isLine(el)) drawLine(ctx, el, elements, styles)
  }
  return new Promise((done) => canvas.toBlob((blob) => done(blob), "image/png"))
}

/** Hands the PNG to the person as a file named after the board and sheet. */
export function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = fileName
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}
