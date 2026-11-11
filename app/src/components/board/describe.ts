import type { ElementMap } from "@/lib/board/geometry"
import { isBox, isLine, type BoardElement, type BoxType, type LineType } from "@/lib/board/model"
import type { Translations } from "@/lib/i18n"

/**
 * What the canvas says without pictures (WCAG 1.1.1 / 1.3.1): each element as words — its kind and its text, a line
 * as the boxes it connects — for the sheet's contents list and the selection announcement. Pure.
 */

/** Text shown for an element in a sentence (cut, on one line). */
const MAX_TEXT = 60

const KIND: Record<BoxType | LineType, keyof Translations> = {
  rect: "wbToolRect",
  ellipse: "wbToolEllipse",
  text: "wbToolText",
  sticky: "wbToolSticky",
  line: "wbToolLine",
  arrow: "wbToolArrow",
  image: "wbToolImage",
  table: "wbToolTable",
  frame: "wbToolFrame",
}

/** The elements a person can see and select, back to front (unknown types are neither drawn nor listed). */
export function describable(ordered: readonly BoardElement[]): BoardElement[] {
  return ordered.filter((el) => isBox(el) || isLine(el))
}

function oneLine(text: string): string {
  const flat = text.replace(/\s+/g, " ").trim()
  return flat.length > MAX_TEXT ? `${flat.slice(0, MAX_TEXT)}…` : flat
}

/** The words of an element: a box's text (a table's cells row by row), a line's label. */
function textOf(el: BoardElement): string {
  if (isLine(el)) return oneLine(el.label ?? "")
  if (!isBox(el)) return ""
  if (el.type === "table") return oneLine((el.cells ?? []).map((row) => row.filter(Boolean).join(", ")).filter(Boolean).join(" / "))
  return oneLine(el.text)
}

/** Votes, lock and link, said after the text. */
function extras(el: BoardElement, t: Translations): string {
  if (!isBox(el) && !isLine(el)) return ""
  const parts: string[] = []
  const votes = isBox(el) ? (el.voters?.length ?? 0) : 0
  if (votes > 0) parts.push(votes === 1 ? t.wbVoteCountOne : t.wbVoteCount.replace("{count}", String(votes)))
  if (el.locked) parts.push(t.wbLocked)
  if (el.link) parts.push(`${t.wbLink}: ${el.link}`)
  return parts.length > 0 ? ` (${parts.join(", ")})` : ""
}

export function kindName(el: BoardElement, t: Translations): string {
  return isBox(el) || isLine(el) ? String(t[KIND[el.type]]) : ""
}

/** A box by its text (or its kind when it has none): how a line names the boxes at its ends. */
function boxName(id: string | null | undefined, elements: ElementMap, t: Translations): string | null {
  const box = id ? elements[id] : undefined
  if (!isBox(box)) return null
  return textOf(box) || kindName(box, t)
}

/** One element in words: "付箋: 会議の議題", "矢印：A から B へ". */
export function describeElement(el: BoardElement, elements: ElementMap, t: Translations): string {
  const kind = kindName(el, t)
  if (isLine(el)) {
    const from = boxName(el.start.attach, elements, t)
    const to = boxName(el.end.attach, elements, t)
    const label = textOf(el)
    const named = label ? `${kind} "${label}"` : kind
    const base = !from && !to ? t.wbLineFree.replace("{kind}", named) : t.wbLineBetween.replace("{kind}", named).replace("{from}", from ?? t.wbNoText).replace("{to}", to ?? t.wbNoText)
    return base + extras(el, t)
  }
  if (!isBox(el)) return kind
  const text = textOf(el)
  return (text ? `${kind}: ${text}` : `${kind} (${t.wbNoText})`) + extras(el, t)
}

/** The announcement for one selected element: kind, text and its place among the sheet's elements. */
export function selectionAnnouncement(el: BoardElement, position: number, total: number, t: Translations): string {
  const kind = kindName(el, t)
  const text = textOf(el)
  const template = text ? t.wbSelectedOne : t.wbSelectedOneNoText
  return template.replace("{kind}", kind).replace("{text}", text).replace("{n}", String(position)).replace("{total}", String(total))
}

/** The next element for `]` (forward) / `[` (back) from the current single selection, wrapping around. */
export function stepSelection(order: readonly string[], selection: readonly string[], forward: boolean): string | null {
  if (order.length === 0) return null
  const current = selection.length === 1 ? order.indexOf(selection[0]) : -1
  if (current === -1) return forward ? order[0] : order[order.length - 1]
  return order[(current + (forward ? 1 : order.length - 1)) % order.length]
}
