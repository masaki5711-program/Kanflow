import type { BoxElement, Dash, FontFamily, HAlign, LineElement, LineRoute, StrokeKey, VAlign } from "./model"

/**
 * The resolved look of an element: every optional style field of model.ts with its default filled in. An
 * element written before a field existed has none of them and draws exactly as it did. Pure.
 */

/** Text size of a new box and of every box that never set one (sheet units). */
export const DEFAULT_FONT_SIZE = 14
/** Text size choices offered in the editor (any value 8–96 is accepted). */
export const FONT_SIZES = [10, 12, 14, 16, 20, 24, 32, 48, 64, 96] as const
/** Outline widths offered for boxes (0 = no outline) and widths offered for lines. */
export const BOX_STROKE_WIDTHS = [0, 1, 2, 4, 6] as const
export const LINE_WIDTHS = [1, 2, 3, 4, 6, 8, 12] as const
export const DEFAULT_LINE_WIDTH = 2
export const TEXT_PADDING = 6

/**
 * Font stacks: the operating system's fonts only (no web font is downloaded — CSP `font-src 'self'`, and the
 * tool runs inside the company network). Japanese families first so kana and kanji match the Latin glyphs.
 */
export const FONT_STACK: Readonly<Record<FontFamily, string>> = {
  sans: '"Hiragino Sans", "Yu Gothic UI", "Yu Gothic", Meiryo, "Noto Sans JP", system-ui, sans-serif',
  serif: '"Hiragino Mincho ProN", "Yu Mincho", "Noto Serif JP", "Times New Roman", serif',
  mono: 'ui-monospace, "Cascadia Mono", Consolas, "BIZ UDGothic", "MS Gothic", monospace',
}

export interface ResolvedTextStyle {
  fontSize: number
  fontFamily: FontFamily
  bold: boolean
  italic: boolean
  /** Palette key of the text colour. */
  color: StrokeKey | "fg"
  align: HAlign
  valign: VAlign
}

/** A shape's text is centred; a text box and a frame's title start at the top left. */
export function textStyle(el: BoxElement): ResolvedTextStyle {
  const free = el.type === "text" || el.type === "frame" || el.type === "table"
  return {
    fontSize: el.fontSize ?? DEFAULT_FONT_SIZE,
    fontFamily: el.fontFamily ?? "sans",
    bold: el.bold ?? el.type === "frame",
    italic: el.italic ?? false,
    color: el.textColor ?? (el.type === "text" ? el.stroke : "fg"),
    align: el.align ?? (free ? "left" : "center"),
    valign: el.valign ?? (free ? "top" : "middle"),
  }
}

export interface ResolvedBoxOutline {
  width: number
  dash: Dash
}

/** Outline of a box: sticky notes and frames are thin, text boxes and pictures have none unless set. */
export function boxOutline(el: BoxElement): ResolvedBoxOutline {
  const fallback = el.type === "text" || el.type === "image" ? 0 : el.type === "sticky" || el.type === "table" || el.type === "frame" ? 1 : 2
  return { width: el.strokeWidth ?? fallback, dash: el.dash ?? (el.type === "frame" ? "dashed" : "solid") }
}

export interface ResolvedLineStyle {
  width: number
  dash: Dash
  route: LineRoute
  arrowStart: boolean
  arrowEnd: boolean
}

export function lineStyle(el: LineElement): ResolvedLineStyle {
  return {
    width: el.strokeWidth ?? DEFAULT_LINE_WIDTH,
    dash: el.dash ?? "solid",
    route: el.route ?? "straight",
    arrowStart: el.arrowStart ?? false,
    arrowEnd: el.arrowEnd ?? el.type === "arrow",
  }
}

/** SVG stroke-dasharray for a dash style at a line width (scales with the width, so thick dashes stay dashes). */
export function dashArray(dash: Dash, width: number): string | undefined {
  if (dash === "dashed") return `${Math.max(4, width * 3)} ${Math.max(3, width * 2)}`
  if (dash === "dotted") return `${Math.max(1, width * 0.1)} ${Math.max(3, width * 2)}`
  return undefined
}

/** CSS flex alignment of the text block inside its box. */
export const JUSTIFY: Readonly<Record<HAlign, string>> = { left: "flex-start", center: "center", right: "flex-end" }
export const ALIGN_ITEMS: Readonly<Record<VAlign, string>> = { top: "flex-start", middle: "center", bottom: "flex-end" }
