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
}

/** The elements a person can see and select, back to front (unknown types are neither drawn nor listed). */
export function describable(ordered: readonly BoardElement[]): BoardElement[] {
  return ordered.filter((el) => isBox(el) || isLine(el))
}

function oneLine(text: string): string {
  const flat = text.replace(/\s+/g, " ").trim()
  return flat.length > MAX_TEXT ? `${flat.slice(0, MAX_TEXT)}…` : flat
}

export function kindName(el: BoardElement, t: Translations): string {
  return isBox(el) || isLine(el) ? String(t[KIND[el.type]]) : ""
}

/** A box by its text (or its kind when it has none): how a line names the boxes at its ends. */
function boxName(id: string | null | undefined, elements: ElementMap, t: Translations): string | null {
  const box = id ? elements[id] : undefined
  if (!isBox(box)) return null
  return oneLine(box.text) || kindName(box, t)
}

/** One element in words: "付箋: 会議の議題", "矢印：A から B へ". */
export function describeElement(el: BoardElement, elements: ElementMap, t: Translations): string {
  const kind = kindName(el, t)
  if (isLine(el)) {
    const from = boxName(el.start.attach, elements, t)
    const to = boxName(el.end.attach, elements, t)
    if (!from && !to) return t.wbLineFree.replace("{kind}", kind)
    return t.wbLineBetween.replace("{kind}", kind).replace("{from}", from ?? t.wbNoText).replace("{to}", to ?? t.wbNoText)
  }
  if (!isBox(el)) return kind
  const text = oneLine(el.text)
  return text ? `${kind}: ${text}` : `${kind} (${t.wbNoText})`
}

/** The announcement for one selected element: kind, text and its place among the sheet's elements. */
export function selectionAnnouncement(el: BoardElement, position: number, total: number, t: Translations): string {
  const kind = kindName(el, t)
  const text = isBox(el) ? oneLine(el.text) : ""
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
