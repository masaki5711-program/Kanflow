import type { Patch } from "./doc"
import type { Point } from "./geometry"
import { BOARD_LIMITS } from "./limits"
import type { BoardElement, BoxElement, FillKey, HAlign, Side, StrokeKey, VAlign } from "./model"
import { newBox, newLine, newTableFromCells } from "./ops"

/**
 * Ready-made layouts (ひな形): frames with titles and hints, text boxes, tables and connecting lines. Every text comes
 * from the caller (translated), so the template is placed in the viewer's language. The improvement templates follow
 * the ZEVA Academy material (4つの箱, なぜなぜ分析, 特性要因図 with the 7 variation factors, PDCA-S, ECRS). Pure.
 */

export const TEMPLATE_KINDS = ["kpt", "zeva", "why5", "fishbone", "pdcas", "ecrs", "a3", "minutes", "report"] as const
export type TemplateKind = (typeof TEMPLATE_KINDS)[number]

/** Every text a template uses (the caller maps each to its translation). */
export const TEMPLATE_TEXT_KEYS = [
  "keep",
  "problem",
  "tryNext",
  "zevaCurrent",
  "zevaFuture",
  "zevaResult",
  "zevaCause",
  "zeva1",
  "zeva1Hint",
  "zeva2",
  "zeva2Hint",
  "zeva3",
  "zeva3Hint",
  "zeva4",
  "zeva4Hint",
  "zevaLoop",
  "why5Problem",
  "why5ProblemHint",
  "why5Why",
  "why5WhyHint",
  "why5Root",
  "why5RootHint",
  "why5Action",
  "why5ActionHint",
  "fishEffect",
  "fishEffectHint",
  "fishMan",
  "fishMachine",
  "fishMaterial",
  "fishMethod",
  "fishMeasurement",
  "fishManagement",
  "fishEnvironment",
  "fishNote",
  "pdcaP",
  "pdcaPHint",
  "pdcaD",
  "pdcaDHint",
  "pdcaC",
  "pdcaCHint",
  "pdcaA",
  "pdcaAHint",
  "pdcaS",
  "pdcaSHint",
  "pdcaNote",
  "ecrsTitle",
  "ecrsWork",
  "ecrsE",
  "ecrsC",
  "ecrsR",
  "ecrsS",
  "ecrsEffect",
  "ecrsNote",
  "a3Title",
  "a3Meta",
  "a3Background",
  "a3Current",
  "a3Target",
  "a3Cause",
  "a3Measures",
  "a3Plan",
  "a3Result",
  "a3Standard",
  "minutesTitle",
  "minutesMeta",
  "agenda",
  "decisions",
  "actions",
  "reportTitle",
  "summary",
  "progress",
  "issues",
  "next",
] as const
export type TemplateTextKey = (typeof TEMPLATE_TEXT_KEYS)[number]
export type TemplateTexts = Readonly<Record<TemplateTextKey, string>>

type Color = "blue" | "red" | "amber" | "green" | "gray" | "sky"

interface BoxPart {
  type: "frame" | "text" | "rect"
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

/** A line between two box parts (indexes, on the middles of the given sides) or free points (template coordinates). */
interface LinePart {
  from: number | Point
  fromSide?: Side
  to: number | Point
  toSide?: Side
  /** Arrow head at the end (default true). */
  head?: boolean
  dashed?: boolean
  width?: number
}

/** A table (cells row by row), its top-left corner and row heights. */
interface TablePart {
  x: number
  y: number
  cells: string[][]
  headerHeight: number
  rowHeight: number
}

interface Layout {
  boxes: BoxPart[]
  lines: LinePart[]
  tables?: TablePart[]
}

/** A coloured frame whose title is its name and whose body says what goes in it. */
function card(x: number, y: number, w: number, h: number, title: string, hint: string, color: Color): BoxPart {
  return { type: "frame", x, y, w, h, text: title, hint, fill: color, stroke: color === "sky" ? "blue" : color, textColor: color === "sky" ? "blue" : color, strokeWidth: 2, dash: "solid", fontSize: 16 }
}

const label = (x: number, y: number, w: number, h: number, text: string, extra: Partial<BoxPart> = {}): BoxPart => ({
  type: "text",
  x,
  y,
  w,
  h,
  text,
  fontSize: 16,
  bold: true,
  align: "center",
  valign: "middle",
  ...extra,
})

function layout(kind: TemplateKind, t: TemplateTexts): Layout {
  switch (kind) {
    case "kpt":
      return {
        boxes: [
          { type: "frame", x: 0, y: 0, w: 360, h: 480, text: t.keep, fill: "green" },
          { type: "frame", x: 0, y: 500, w: 360, h: 300, text: t.problem, fill: "red" },
          { type: "frame", x: 380, y: 0, w: 360, h: 800, text: t.tryNext, fill: "blue" },
        ],
        lines: [],
      }
    case "zeva":
      // Left: the current state, right: the desired one; top: results (values), bottom: causes (ways).
      return {
        boxes: [
          /* 0 */ card(88, 48, 380, 240, t.zeva1, t.zeva1Hint, "blue"),
          /* 1 */ card(88, 368, 380, 240, t.zeva2, t.zeva2Hint, "red"),
          /* 2 */ card(568, 368, 380, 240, t.zeva3, t.zeva3Hint, "amber"),
          /* 3 */ card(568, 48, 380, 240, t.zeva4, t.zeva4Hint, "green"),
          label(88, 0, 380, 36, t.zevaCurrent, { fontSize: 18 }),
          label(568, 0, 380, 36, t.zevaFuture, { fontSize: 18 }),
          label(0, 48, 72, 240, t.zevaResult),
          label(0, 368, 72, 240, t.zevaCause),
          label(88, 628, 860, 56, t.zevaLoop, { fontSize: 14 }),
        ],
        lines: [
          { from: 0, fromSide: "s", to: 1, toSide: "n" },
          { from: 1, fromSide: "e", to: 2, toSide: "w" },
          { from: 2, fromSide: "n", to: 3, toSide: "s" },
          { from: 0, fromSide: "e", to: 3, toSide: "w", dashed: true },
        ],
      }
    case "why5": {
      // The problem, five whys down to the root cause, and the countermeasure beside it.
      const step = 128
      const boxes: BoxPart[] = [card(0, 0, 420, 100, t.why5Problem, t.why5ProblemHint, "red")]
      for (let i = 1; i <= 5; i++) boxes.push(card(0, i * step, 420, 100, t.why5Why.replace("{n}", String(i)), t.why5WhyHint, "amber"))
      boxes.push(card(0, 6 * step, 420, 100, t.why5Root, t.why5RootHint, "blue"))
      boxes.push(card(520, 6 * step, 420, 100, t.why5Action, t.why5ActionHint, "green"))
      const lines: LinePart[] = []
      for (let i = 0; i < 6; i++) lines.push({ from: i, fromSide: "s", to: i + 1, toSide: "n" })
      lines.push({ from: 6, fromSide: "e", to: 7, toSide: "w" })
      return { boxes, lines }
    }
    case "fishbone": {
      // 特性要因図: the spine runs to the effect (Y); one bone per variation factor (X), four above and three below.
      const spineY = 300
      const top = [t.fishMan, t.fishMachine, t.fishMaterial, t.fishMethod]
      const bottom = [t.fishMeasurement, t.fishManagement, t.fishEnvironment]
      const boxes: BoxPart[] = [card(940, spineY - 90, 260, 180, t.fishEffect, t.fishEffectHint, "red")]
      const lines: LinePart[] = [{ from: { x: 0, y: spineY }, to: 0, toSide: "w", width: 4 }]
      top.forEach((name, i) => {
        const x = 60 + i * 220
        boxes.push(label(x - 70, 20, 180, 36, name, { type: "rect", fill: "blue", stroke: "blue", fontSize: 15 }))
        lines.push({ from: { x: x + 20, y: 56 }, to: { x: x + 150, y: spineY }, head: false, width: 3 })
      })
      bottom.forEach((name, i) => {
        const x = 170 + i * 220
        boxes.push(label(x - 70, 544, 180, 36, name, { type: "rect", fill: "green", stroke: "green", fontSize: 15 }))
        lines.push({ from: { x: x + 20, y: 544 }, to: { x: x + 150, y: spineY }, head: false, width: 3 })
      })
      boxes.push(label(0, 600, 1200, 40, t.fishNote, { fontSize: 14, bold: false }))
      return { boxes, lines }
    }
    case "pdcas":
      // P → D → C → A around, A → S: the result becomes the standard the next cycle starts from.
      return {
        boxes: [
          /* 0 */ card(0, 0, 340, 200, t.pdcaP, t.pdcaPHint, "blue"),
          /* 1 */ card(440, 0, 340, 200, t.pdcaD, t.pdcaDHint, "green"),
          /* 2 */ card(440, 280, 340, 200, t.pdcaC, t.pdcaCHint, "amber"),
          /* 3 */ card(0, 280, 340, 200, t.pdcaA, t.pdcaAHint, "red"),
          /* 4 */ card(150, 560, 480, 150, t.pdcaS, t.pdcaSHint, "sky"),
          label(0, 730, 780, 40, t.pdcaNote, { fontSize: 14 }),
        ],
        lines: [
          { from: 0, fromSide: "e", to: 1, toSide: "w" },
          { from: 1, fromSide: "s", to: 2, toSide: "n" },
          { from: 2, fromSide: "w", to: 3, toSide: "e" },
          { from: 3, fromSide: "n", to: 0, toSide: "s" },
          { from: 3, fromSide: "s", to: 4, toSide: "w", dashed: true },
        ],
      }
    case "ecrs":
      return {
        boxes: [label(0, 0, 900, 44, t.ecrsTitle, { fontSize: 22, align: "left" }), label(0, 48, 900, 32, t.ecrsNote, { fontSize: 14, bold: false, align: "left" })],
        lines: [],
        tables: [
          {
            x: 0,
            y: 96,
            cells: [[t.ecrsWork, t.ecrsE, t.ecrsC, t.ecrsR, t.ecrsS, t.ecrsEffect], ...Array.from({ length: 6 }, () => ["", "", "", "", "", ""])],
            headerHeight: 44,
            rowHeight: 64,
          },
        ],
      }
    case "a3": {
      // A3 report: the story left to right — why, where we are, the goal, the cause; then what we do and how it went.
      const left = [t.a3Background, t.a3Current, t.a3Target, t.a3Cause]
      const right = [t.a3Measures, t.a3Plan, t.a3Result, t.a3Standard]
      const boxes: BoxPart[] = [
        { type: "text", x: 0, y: 0, w: 1000, h: 48, text: t.a3Title, fontSize: 28, bold: true },
        { type: "text", x: 0, y: 52, w: 1000, h: 32, text: t.a3Meta },
      ]
      const colors: Color[] = ["sky", "blue", "green", "red", "amber", "gray", "green", "blue"]
      left.forEach((title, i) => boxes.push({ type: "frame", x: 0, y: 100 + i * 200, w: 490, h: 184, text: title, fill: colors[i] }))
      right.forEach((title, i) => boxes.push({ type: "frame", x: 510, y: 100 + i * 200, w: 490, h: 184, text: title, fill: colors[i + 4] }))
      return { boxes, lines: [] }
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
        lines: [],
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
        lines: [],
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

/** The template centred on `center`, frames behind (from `z` up), texts, tables and lines on top. Returns the patch and the new ids. */
export function templatePatch(kind: TemplateKind, texts: TemplateTexts, center: Point, makeId: () => string, z: number): { patch: Patch; ids: string[] } {
  const { boxes, lines, tables = [] } = layout(kind, texts)
  const tableSize = (tp: TablePart) => ({ w: 0, h: tp.headerHeight + (tp.cells.length - 1) * tp.rowHeight })
  const w = Math.max(...boxes.map((p) => p.x + p.w), ...tables.map((tp) => tp.x + 900))
  const h = Math.max(...boxes.map((p) => p.y + p.h), ...tables.map((tp) => tp.y + tableSize(tp).h))
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
    if (p.bold === true) box.bold = true
    if (p.bold === false && p.type === "frame") box.bold = false
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
  for (const tp of tables) {
    const id = makeId()
    const table = newTableFromCells(tp.cells, { x: ox + tp.x, y: oy + tp.y }, id, take())
    if (!table) continue
    const rowHeights = tp.cells.map((_, i) => (i === 0 ? tp.headerHeight : tp.rowHeight))
    const colWidths = (table.colWidths ?? []).map((cw, i) => (i === 0 ? Math.max(cw, 220) : Math.max(cw, 130)))
    patch[id] = {
      ...table,
      x: ox + tp.x,
      y: oy + tp.y,
      rowHeights,
      colWidths,
      w: colWidths.reduce((a, b) => a + b, 0),
      h: rowHeights.reduce((a, b) => a + b, 0),
      bold: true,
      valign: "middle",
    }
    ids.push(id)
  }
  for (const l of lines) {
    const id = makeId()
    const end = (ref: number | Point, side?: Side) => {
      if (typeof ref === "number") {
        const p = sideMiddle(boxes[ref], side ?? "e")
        return { point: { x: ox + p.x, y: oy + p.y }, attach: boxIds[ref], side: side ?? null }
      }
      return { point: { x: ox + ref.x, y: oy + ref.y }, attach: null }
    }
    const line = newLine(l.head === false ? "line" : "arrow", end(l.from, l.fromSide), end(l.to, l.toSide), id, take())
    patch[id] = { ...line, strokeWidth: l.width ?? 3, ...(l.dashed ? { dash: "dashed" as const } : {}) }
    ids.push(id)
  }
  return { patch, ids }
}
