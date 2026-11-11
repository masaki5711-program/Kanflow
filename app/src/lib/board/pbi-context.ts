import { mentionsToPlainText } from "@/lib/mentions"
import type { ElementMap } from "./geometry"
import { isBox, isLine, type BoardElement, type BoxElement } from "./model"

/**
 * What a shape means in its drawing, for drafting a PBI from it: its own text, the frame it is in (title and body),
 * the shapes arrows lead to and from it (with the arrows' labels), the shapes grouped with it or lying in the same
 * frame, and the comments on it. Read from the sheet as stored; no AI. Pure.
 */
export interface ShapeContext {
  text: string
  frame: { title: string; body: string } | null
  /** "from": an arrow comes from that shape to this one; "to": goes from this one to it. */
  connected: { direction: "from" | "to"; text: string; label: string }[]
  group: string[]
  siblings: string[]
  comments: string[]
}

const MAX_ITEMS = 15
const MAX_TEXT = 300

function clip(text: string): string {
  const flat = text.replace(/\s+/g, " ").trim()
  return flat.length > MAX_TEXT ? `${flat.slice(0, MAX_TEXT)}…` : flat
}

/** The words of a box (a table's cells row by row, a frame's title and body). */
function words(el: BoardElement | undefined): string {
  if (!isBox(el)) return ""
  if (el.type === "table") return clip((el.cells ?? []).map((row) => row.filter(Boolean).join(" / ")).filter(Boolean).join("; "))
  return clip([el.text, el.body ?? ""].filter(Boolean).join(" — "))
}

function inside(box: BoxElement, frame: BoxElement): boolean {
  return box.x >= frame.x && box.y >= frame.y && box.x + box.w <= frame.x + frame.w && box.y + box.h <= frame.y + frame.h
}

/** The smallest frame holding the box (the closest heading), or null. */
function frameOf(elements: ElementMap, box: BoxElement): BoxElement | null {
  let best: BoxElement | null = null
  for (const el of Object.values(elements)) {
    if (!isBox(el) || el.type !== "frame" || el.id === box.id || !inside(box, el)) continue
    if (!best || el.w * el.h < best.w * best.h) best = el
  }
  return best
}

export function shapeContext(elements: ElementMap, id: string, comments: readonly { elementId: string | null; body: string; resolved?: boolean }[]): ShapeContext | null {
  const box = elements[id]
  if (!isBox(box)) return null
  const frame = frameOf(elements, box)
  const connected: ShapeContext["connected"] = []
  for (const el of Object.values(elements)) {
    if (!isLine(el)) continue
    const label = clip(el.label ?? "")
    if (el.end.attach === id && el.start.attach && el.start.attach !== id) {
      const text = words(elements[el.start.attach])
      if (text) connected.push({ direction: "from", text, label })
    } else if (el.start.attach === id && el.end.attach && el.end.attach !== id) {
      const text = words(elements[el.end.attach])
      if (text) connected.push({ direction: "to", text, label })
    }
  }
  const group = box.groupId
    ? Object.values(elements)
        .filter((el): el is BoxElement => isBox(el) && el.id !== id && el.groupId === box.groupId)
        .map((el) => words(el))
        .filter(Boolean)
    : []
  const siblings = frame
    ? Object.values(elements)
        .filter((el): el is BoxElement => isBox(el) && el.id !== id && el.id !== frame.id && el.type !== "frame" && inside(el, frame) && !(box.groupId && el.groupId === box.groupId))
        .sort((a, b) => a.y - b.y || a.x - b.x)
        .map((el) => words(el))
        .filter(Boolean)
    : []
  return {
    text: words(box),
    frame: frame ? { title: clip(frame.text), body: clip(frame.body ?? "") } : null,
    connected: connected.slice(0, MAX_ITEMS),
    group: group.slice(0, MAX_ITEMS),
    siblings: siblings.slice(0, MAX_ITEMS),
    comments: comments
      .filter((c) => c.elementId === id && !c.resolved)
      .map((c) => clip(mentionsToPlainText(c.body)))
      .filter(Boolean)
      .slice(0, 10),
  }
}

/** The context as the prompt's source section (headings in Japanese, like the IceBox drafts' prompt). */
export function shapeContextLines(context: ShapeContext, boardTitle: string, sheetName: string): string[] {
  const lines = [`# 元のホワイトボードの図形（ボード「${clip(boardTitle)}」・シート「${clip(sheetName)}」）`, `## 図形の文字\n${context.text || "（なし）"}`]
  if (context.frame) lines.push(`## 入っている枠（フレーム）\n見出し: ${context.frame.title || "（なし）"}${context.frame.body ? `\n本文: ${context.frame.body}` : ""}`)
  const from = context.connected.filter((c) => c.direction === "from")
  const to = context.connected.filter((c) => c.direction === "to")
  if (from.length) lines.push(`## 矢印でこの図形に向かってくる図形（原因・前提など）\n${from.map((c) => `- ${c.text}${c.label ? `（矢印の文字: ${c.label}）` : ""}`).join("\n")}`)
  if (to.length) lines.push(`## この図形から矢印が向かう図形（結果・次の段階など）\n${to.map((c) => `- ${c.text}${c.label ? `（矢印の文字: ${c.label}）` : ""}`).join("\n")}`)
  if (context.group.length) lines.push(`## 同じグループの図形\n${context.group.map((t) => `- ${t}`).join("\n")}`)
  if (context.siblings.length) lines.push(`## 同じ枠の中のほかの図形\n${context.siblings.map((t) => `- ${t}`).join("\n")}`)
  if (context.comments.length) lines.push(`## この図形へのコメント（未解決）\n${context.comments.map((t) => `- ${t}`).join("\n")}`)
  return lines
}
