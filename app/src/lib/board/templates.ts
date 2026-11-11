import type { Patch } from "./doc"
import type { Point } from "./geometry"
import { BOARD_LIMITS } from "./limits"
import type { BoardElement, BoxElement, FillKey, HAlign, Side, StrokeKey, VAlign } from "./model"
import { newBox, newLine } from "./ops"

/**
 * Ready-made layouts (ひな形): frames with titles, text boxes and connecting arrows. Every text comes from the caller
 * (translated), so the template is placed in the viewer's language. Pure.
 */

export const TEMPLATE_KINDS = ["kpt", "zeva", "minutes", "report"] as const
export type TemplateKind = (typeof TEMPLATE_KINDS)[number]

export interface TemplateTexts {
  keep: string
  problem: string
  tryNext: string
  /** ZEVA four boxes (理論値「4つの箱」): headers, the four boxes with their hints, and the thinking loop. */
  zevaCurrent: string
  zevaFuture: string
  zevaResult: string
  zevaCause: string
  zeva1: string
  zeva1Hint: string
  zeva2: string
  zeva2Hint: string
  zeva3: string
  zeva3Hint: string
  zeva4: string
  zeva4Hint: string
  zevaLoop: string
  minutesTitle: string
  minutesMeta: string
  agenda: string
  decisions: string
  actions: string
  reportTitle: string
  /** 背景／目的, 報告課題, 結論, 次の予定. */
  summary: string
  progress: string
  issues: string
  next: string
}

interface BoxPart {
  type: "frame" | "text"
  x: number
  y: number
  w: number
  h: number
  text: string
  fill?: FillKey
  stroke?: StrokeKey
  textColor?: StrokeKey
  strokeWidth?: number
  dash?: "solid"
  fontSize?: number
  bold?: boolean
  align?: HAlign
  valign?: VAlign
  hint?: string
}

/** An arrow from one box part to another (indexes into the box parts), between the middles of the given sides. */
interface ArrowPart {
  from: number
  fromSide: Side
  to: number
  toSide: Side
  dashed?: boolean
}

interface Layout {
  boxes: BoxPart[]
  arrows: ArrowPart[]
}

/** One box of the four: a coloured frame whose title is the box's name and whose body says what goes in it. */
function zevaBox(x: number, y: number, title: string, hint: string, color: "blue" | "red" | "amber" | "green"): BoxPart {
  return { type: "frame", x, y, w: 380, h: 240, text: title, hint, fill: color, stroke: color, textColor: color, strokeWidth: 2, dash: "solid", fontSize: 16 }
}

function layout(kind: TemplateKind, t: TemplateTexts): Layout {
  switch (kind) {
    case "kpt":
      return {
        boxes: [
          { type: "frame", x: 0, y: 0, w: 360, h: 480, text: t.keep, fill: "green" },
          { type: "frame", x: 0, y: 500, w: 360, h: 300, text: t.problem, fill: "red" },
          { type: "frame", x: 380, y: 0, w: 360, h: 800, text: t.tryNext, fill: "blue" },
        ],
        arrows: [],
      }
    case "zeva": {
      // Left: the current state, right: the desired one; top: results (values), bottom: causes (ways).
      const header = (x: number, text: string): BoxPart => ({ type: "text", x, y: 0, w: 380, h: 36, text, fontSize: 18, bold: true, align: "center", valign: "middle" })
      const side = (y: number, text: string): BoxPart => ({ type: "text", x: 0, y, w: 72, h: 240, text, fontSize: 16, bold: true, align: "center", valign: "middle" })
      return {
        boxes: [
          /* 0 */ zevaBox(88, 48, t.zeva1, t.zeva1Hint, "blue"),
          /* 1 */ zevaBox(88, 368, t.zeva2, t.zeva2Hint, "red"),
          /* 2 */ zevaBox(568, 368, t.zeva3, t.zeva3Hint, "amber"),
          /* 3 */ zevaBox(568, 48, t.zeva4, t.zeva4Hint, "green"),
          header(88, t.zevaCurrent),
          header(568, t.zevaFuture),
          side(48, t.zevaResult),
          side(368, t.zevaCause),
          { type: "text", x: 88, y: 628, w: 860, h: 56, text: t.zevaLoop, fontSize: 14, bold: true, align: "center", valign: "middle" },
        ],
        arrows: [
          { from: 0, fromSide: "s", to: 1, toSide: "n" },
          { from: 1, fromSide: "e", to: 2, toSide: "w" },
          { from: 2, fromSide: "n", to: 3, toSide: "s" },
          { from: 0, fromSide: "e", to: 3, toSide: "w", dashed: true },
        ],
      }
    }
    case "minutes":
      return {
        boxes: [
          { type: "text", x: 0, y: 0, w: 760, h: 48, text: t.minutesTitle, fontSize: 28, bold: true },
          { type: "text", x: 0, y: 56, w: 760, h: 72, text: t.minutesMeta },
          { type: "frame", x: 0, y: 140, w: 760, h: 200, text: t.agenda },
          { type: "frame", x: 0, y: 360, w: 370, h: 260, text: t.decisions, fill: "green" },
          { type: "frame", x: 390, y: 360, w: 370, h: 260, text: t.actions, fill: "amber" },
        ],
        arrows: [],
      }
    case "report":
      return {
        boxes: [
          { type: "text", x: 0, y: 0, w: 820, h: 48, text: t.reportTitle, fontSize: 28, bold: true },
          { type: "frame", x: 0, y: 60, w: 820, h: 140, text: t.summary, fill: "sky" },
          { type: "frame", x: 0, y: 220, w: 400, h: 300, text: t.progress },
          { type: "frame", x: 420, y: 220, w: 400, h: 300, text: t.issues, fill: "amber" },
          { type: "frame", x: 0, y: 540, w: 820, h: 180, text: t.next, fill: "green" },
        ],
        arrows: [],
      }
  }
}

/** The middle of a side of a part (template coordinates). */
function sideMiddle(p: BoxPart, side: Side): Point {
  if (side === "n") return { x: p.x + p.w / 2, y: p.y }
  if (side === "s") return { x: p.x + p.w / 2, y: p.y + p.h }
  if (side === "e") return { x: p.x + p.w, y: p.y + p.h / 2 }
  return { x: p.x, y: p.y + p.h / 2 }
}

/** The template centred on `center`, frames behind (from `z` up) and texts and arrows on top. Returns the patch and the new ids. */
export function templatePatch(kind: TemplateKind, texts: TemplateTexts, center: Point, makeId: () => string, z: number): { patch: Patch; ids: string[] } {
  const { boxes, arrows } = layout(kind, texts)
  const w = Math.max(...boxes.map((p) => p.x + p.w))
  const h = Math.max(...boxes.map((p) => p.y + p.h))
  const ox = Math.round(center.x - w / 2)
  const oy = Math.round(center.y - h / 2)
  const patch: Record<string, BoardElement> = {}
  const ids: string[] = []
  const boxIds: string[] = []
  let next = z
  const take = () => {
    const value = Math.min(BOARD_LIMITS.counter, next)
    next += 1
    return value
  }
  for (const p of boxes) {
    const id = makeId()
    const base: BoxElement = newBox(p.type, { x: ox + p.x, y: oy + p.y, w: p.w, h: p.h }, id, take(), {
      ...(p.fill ? { fill: p.fill } : {}),
      ...(p.stroke ? { stroke: p.stroke } : {}),
    })
    const box: BoxElement = { ...base, text: p.text.slice(0, BOARD_LIMITS.textLength) }
    if (p.fontSize) box.fontSize = p.fontSize
    if (p.bold) box.bold = true
    if (p.textColor) box.textColor = p.textColor
    if (p.strokeWidth !== undefined) box.strokeWidth = p.strokeWidth
    if (p.dash) box.dash = p.dash
    if (p.align) box.align = p.align
    if (p.valign) box.valign = p.valign
    if (p.hint) box.hint = p.hint.slice(0, BOARD_LIMITS.hintLength)
    patch[id] = box
    ids.push(id)
    boxIds.push(id)
  }
  for (const a of arrows) {
    const id = makeId()
    const from = boxes[a.from]
    const to = boxes[a.to]
    const start = sideMiddle(from, a.fromSide)
    const end = sideMiddle(to, a.toSide)
    const line = newLine(
      "arrow",
      { point: { x: ox + start.x, y: oy + start.y }, attach: boxIds[a.from], side: a.fromSide },
      { point: { x: ox + end.x, y: oy + end.y }, attach: boxIds[a.to], side: a.toSide },
      id,
      take(),
    )
    patch[id] = { ...line, strokeWidth: 3, ...(a.dashed ? { dash: "dashed" as const } : {}) }
    ids.push(id)
  }
  return { patch, ids }
}
