import type { Patch } from "./doc"
import type { Point } from "./geometry"
import { BOARD_LIMITS } from "./limits"
import type { BoardElement, BoxElement, FillKey } from "./model"
import { newBox } from "./ops"

/**
 * Ready-made layouts (ひな形): frames with titles and, where useful, a text box to start from. Every text comes
 * from the caller (translated), so the template is placed in the viewer's language. Pure.
 */

export const TEMPLATE_KINDS = ["kpt", "swot", "minutes", "report"] as const
export type TemplateKind = (typeof TEMPLATE_KINDS)[number]

export interface TemplateTexts {
  keep: string
  problem: string
  tryNext: string
  strengths: string
  weaknesses: string
  opportunities: string
  threats: string
  minutesTitle: string
  minutesMeta: string
  agenda: string
  decisions: string
  actions: string
  reportTitle: string
  summary: string
  progress: string
  issues: string
  next: string
}

interface Part {
  type: "frame" | "text"
  x: number
  y: number
  w: number
  h: number
  text: string
  fill?: FillKey
  fontSize?: number
  bold?: boolean
}

function parts(kind: TemplateKind, t: TemplateTexts): Part[] {
  switch (kind) {
    case "kpt":
      return [
        { type: "frame", x: 0, y: 0, w: 360, h: 480, text: t.keep, fill: "green" },
        { type: "frame", x: 0, y: 500, w: 360, h: 300, text: t.problem, fill: "red" },
        { type: "frame", x: 380, y: 0, w: 360, h: 800, text: t.tryNext, fill: "blue" },
      ]
    case "swot":
      return [
        { type: "frame", x: 0, y: 0, w: 400, h: 320, text: t.strengths, fill: "green" },
        { type: "frame", x: 420, y: 0, w: 400, h: 320, text: t.weaknesses, fill: "amber" },
        { type: "frame", x: 0, y: 340, w: 400, h: 320, text: t.opportunities, fill: "blue" },
        { type: "frame", x: 420, y: 340, w: 400, h: 320, text: t.threats, fill: "red" },
      ]
    case "minutes":
      return [
        { type: "text", x: 0, y: 0, w: 760, h: 48, text: t.minutesTitle, fontSize: 28, bold: true },
        { type: "text", x: 0, y: 56, w: 760, h: 72, text: t.minutesMeta },
        { type: "frame", x: 0, y: 140, w: 760, h: 200, text: t.agenda },
        { type: "frame", x: 0, y: 360, w: 370, h: 260, text: t.decisions, fill: "green" },
        { type: "frame", x: 390, y: 360, w: 370, h: 260, text: t.actions, fill: "amber" },
      ]
    case "report":
      return [
        { type: "text", x: 0, y: 0, w: 820, h: 48, text: t.reportTitle, fontSize: 28, bold: true },
        { type: "frame", x: 0, y: 60, w: 820, h: 140, text: t.summary, fill: "sky" },
        { type: "frame", x: 0, y: 220, w: 400, h: 300, text: t.progress },
        { type: "frame", x: 420, y: 220, w: 400, h: 300, text: t.issues, fill: "amber" },
        { type: "frame", x: 0, y: 540, w: 820, h: 180, text: t.next, fill: "green" },
      ]
  }
}

/** The template centred on `center`, frames behind (below `z`) and texts on top. Returns the patch and the new ids. */
export function templatePatch(kind: TemplateKind, texts: TemplateTexts, center: Point, makeId: () => string, z: number): { patch: Patch; ids: string[] } {
  const list = parts(kind, texts)
  const w = Math.max(...list.map((p) => p.x + p.w))
  const h = Math.max(...list.map((p) => p.y + p.h))
  const ox = Math.round(center.x - w / 2)
  const oy = Math.round(center.y - h / 2)
  const patch: Record<string, BoardElement> = {}
  const ids: string[] = []
  let next = z
  for (const p of list) {
    const id = makeId()
    const box: BoxElement = newBox(p.type, { x: ox + p.x, y: oy + p.y, w: p.w, h: p.h }, id, Math.min(BOARD_LIMITS.counter, next), p.fill ? { fill: p.fill } : {})
    patch[id] = { ...box, text: p.text.slice(0, BOARD_LIMITS.textLength), ...(p.fontSize ? { fontSize: p.fontSize } : {}), ...(p.bold ? { bold: true } : {}) }
    ids.push(id)
    next += 1
  }
  return { patch, ids }
}
