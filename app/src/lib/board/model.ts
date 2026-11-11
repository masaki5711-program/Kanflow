import { z } from "zod"
import { BOARD_LIMITS, ELEMENT_ID_PATTERN, ELEMENT_TYPE_PATTERN } from "./limits"
import { SHAPE_KINDS, type ShapeKind } from "./shapes"

/**
 * The element model of the ボード editor.
 *
 * An element is stored as one row: `{ id, version, deleted, data }`, where `data` is a JSON object with a
 * `type` discriminator. This build knows the types below; anything else (`image`, `table`, `link` of a later
 * build) is carried as an `UnknownElement` and written back exactly as it was read. Known types keep the
 * keys this build does not know, too (the schemas are loose), so a newer client's additions survive an
 * edit made here.
 *
 * Colours are palette keys, never colour values: the palette maps them to design tokens (palette.ts).
 */

export const STROKE_KEYS = ["ink", "gray", "blue", "green", "amber", "red", "violet"] as const
export type StrokeKey = (typeof STROKE_KEYS)[number]

export const FILL_KEYS = ["none", "white", "gray", "blue", "green", "amber", "red", "sky"] as const
export type FillKey = (typeof FILL_KEYS)[number]

/**
 * Boxes: drawn shapes, plus a picture (`image`), a table, a frame (a titled area that carries what lies in it), a
 * shape of the library (`shape`, its outline named by `shape`) and a timer (shared countdown and vote budget).
 */
export const BOX_TYPES = ["rect", "ellipse", "text", "sticky", "image", "table", "frame", "shape", "timer"] as const
export type BoxType = (typeof BOX_TYPES)[number]

export const LINE_TYPES = ["line", "arrow"] as const
export type LineType = (typeof LINE_TYPES)[number]

export const KNOWN_TYPES: readonly string[] = [...BOX_TYPES, ...LINE_TYPES]

export const FONT_FAMILIES = ["sans", "serif", "mono"] as const
export type FontFamily = (typeof FONT_FAMILIES)[number]

export const H_ALIGNS = ["left", "center", "right"] as const
export type HAlign = (typeof H_ALIGNS)[number]

export const V_ALIGNS = ["top", "middle", "bottom"] as const
export type VAlign = (typeof V_ALIGNS)[number]

export const DASHES = ["solid", "dashed", "dotted"] as const
export type Dash = (typeof DASHES)[number]

export const LINE_ROUTES = ["straight", "elbow", "curve"] as const
export type LineRoute = (typeof LINE_ROUTES)[number]

/** The middle of each side of a box: where a line end attaches. */
export const SIDES = ["n", "e", "s", "w"] as const
export type Side = (typeof SIDES)[number]

/**
 * Text and outline settings every box may carry. All optional: an element without them (written before they
 * existed) draws with the defaults of style.ts, so old sheets look as they did.
 */
export interface BoxStyle {
  /** Text size in sheet units (8–96). */
  fontSize?: number
  fontFamily?: FontFamily
  bold?: boolean
  italic?: boolean
  underline?: boolean
  /** Colour of the text; default: the outline colour for `text`, the foreground colour otherwise. */
  textColor?: StrokeKey
  align?: HAlign
  valign?: VAlign
  /** Outline width (0 = none, up to 12). */
  strokeWidth?: number
  dash?: Dash
}

/** What any element may carry besides its drawing. */
export interface ElementExtras {
  /** An http(s) address the element links to (Ctrl / ⌘ + click, or the link mark, opens it). */
  link?: string
  /** A locked element is selected but never moved, resized, restyled or deleted until it is unlocked. */
  locked?: boolean
  /** Elements sharing a group id are selected, moved and copied together (Ctrl+G). */
  groupId?: string
}

/**
 * A stretch of text with its own format (a part of a box's text set in bold, larger, in another colour …). A mark
 * that is absent takes the box's own setting; `false` turns a box-wide setting off for the stretch.
 */
export interface TextRun {
  text: string
  bold?: boolean
  italic?: boolean
  underline?: boolean
  fontSize?: number
  fontFamily?: FontFamily
  color?: StrokeKey
}

/**
 * Formatted text is stored twice: the plain `text` (what search, copy and the screen reader use, and what an older
 * build shows) and the runs. Runs whose texts do not add up to the plain text are ignored (someone edited the
 * plain text with a build that did not know the runs).
 */
export type TextRuns = TextRun[]

/** rect / ellipse / text / sticky / image / table / frame: a box, most with text inside. */
export interface BoxElement extends BoxStyle, ElementExtras {
  id: string
  type: BoxType
  x: number
  y: number
  w: number
  h: number
  /** Stacking order (higher is in front). */
  z: number
  /** The text inside; a frame's title. */
  text: string
  /** Format of parts of `text` (absent: all of it in the box's format). */
  runs?: TextRuns
  /** `frame`: the text written in the frame's body (below its title), and its format. */
  body?: string
  bodyRuns?: TextRuns
  /** `frame`: a hint shown in the body while it is empty (templates say what goes there). Never printed. */
  hint?: string
  fill: FillKey
  /** Outline colour; for `text` the colour of the text. */
  stroke: StrokeKey
  /** `image`: the board file shown (BoardFile.id). */
  fileId?: string
  /** `table`: the cells, row by row (every row as long as `colWidths`). */
  cells?: string[][]
  /** `table`: the format of parts of cells, in the cells' shape (null: the cell is in the table's format). */
  cellRuns?: (TextRuns | null)[][]
  /** `table`: column widths / row heights in sheet units (their sums are w / h). */
  colWidths?: number[]
  rowHeights?: number[]
  /** `sticky`: who voted for it (user ids; one entry per vote — with a vote budget a person may give several). */
  voters?: string[]
  /** `shape`: which outline of the library. */
  shape?: ShapeKind
  /** `timer`: length of the countdown (seconds). */
  durationSec?: number
  /** `timer`: when the running countdown ends (ms since 1970, UTC); absent while stopped. */
  endsAt?: number
  /** `timer`: seconds left while paused (absent: the full duration). */
  remainingSec?: number
  /** `timer`: votes each person may give on this sheet while the timer is on it (absent: one per sticky note). */
  voteBudget?: number
  /** The backlog item (PBI) this box stands for. Only the id is kept: title and state are read live. */
  pbiId?: string
}

/** One end of a line. `attach` names the box it is connected to; x / y are where it was last drawn. */
export interface LineEnd {
  x: number
  y: number
  attach?: string | null
  /** The side of the attached box whose middle the end sits on; absent = the side facing the other end. */
  side?: Side | null
}

export interface LineElement extends ElementExtras {
  id: string
  type: LineType
  z: number
  start: LineEnd
  end: LineEnd
  stroke: StrokeKey
  /** Line width (1–12; default 2). */
  strokeWidth?: number
  dash?: Dash
  route?: LineRoute
  /** Arrow heads; default: an `arrow` has one at its end, a `line` none. */
  arrowStart?: boolean
  arrowEnd?: boolean
  /** Text on the middle of the line. */
  label?: string
}

/** An element of a type this build does not draw. Never changed here; written back as read. */
export interface UnknownElement {
  id: string
  type: "unknown"
  /** The stored `data`, untouched (its own `type` is inside). */
  data: Readonly<Record<string, unknown>>
}

export type KnownElement = BoxElement | LineElement
export type BoardElement = KnownElement | UnknownElement

export function isBox(el: BoardElement | undefined | null): el is BoxElement {
  return !!el && (BOX_TYPES as readonly string[]).includes(el.type)
}

export function isLine(el: BoardElement | undefined | null): el is LineElement {
  return !!el && (LINE_TYPES as readonly string[]).includes(el.type)
}

export function isKnown(el: BoardElement | undefined | null): el is KnownElement {
  return isBox(el) || isLine(el)
}

// ---------------------------------------------------------------------------
// Schemas (one per type)
// ---------------------------------------------------------------------------

const coordinate = z.number().min(-BOARD_LIMITS.coordinate).max(BOARD_LIMITS.coordinate)
const boxSize = z.number().min(1).max(BOARD_LIMITS.boxSize)
const zOrder = z.number().min(-BOARD_LIMITS.counter).max(BOARD_LIMITS.counter)
const elementId = z.string().regex(ELEMENT_ID_PATTERN)

/** An http(s) address — nothing else is ever stored as a link (no javascript:, data:, file:). */
export function isHttpUrl(value: string): boolean {
  if (!/^https?:\/\//i.test(value)) return false
  try {
    const url = new URL(value)
    return url.protocol === "http:" || url.protocol === "https:"
  } catch {
    return false
  }
}

const link = z.string().max(BOARD_LIMITS.linkLength).refine(isHttpUrl, "link must be an http(s) address")

/** Optional fields every element may carry. */
const extras = {
  link: link.optional(),
  locked: z.boolean().optional(),
  groupId: elementId.optional(),
}

const fontSize = z.number().min(BOARD_LIMITS.fontSizeMin).max(BOARD_LIMITS.fontSizeMax)

// Strict: a run carries its marks and nothing else (up to 400 runs per text, so no room for anything extra).
const textRun = z.strictObject({
  text: z.string().max(BOARD_LIMITS.textLength),
  bold: z.boolean().optional(),
  italic: z.boolean().optional(),
  underline: z.boolean().optional(),
  fontSize: fontSize.optional(),
  fontFamily: z.enum(FONT_FAMILIES).optional(),
  color: z.enum(STROKE_KEYS).optional(),
})
const textRuns = z.array(textRun).max(BOARD_LIMITS.runsPerText)

const boxStyle = {
  fontSize: fontSize.optional(),
  fontFamily: z.enum(FONT_FAMILIES).optional(),
  bold: z.boolean().optional(),
  italic: z.boolean().optional(),
  underline: z.boolean().optional(),
  textColor: z.enum(STROKE_KEYS).optional(),
  align: z.enum(H_ALIGNS).optional(),
  valign: z.enum(V_ALIGNS).optional(),
  strokeWidth: z.number().min(0).max(BOARD_LIMITS.strokeWidthMax).optional(),
  dash: z.enum(DASHES).optional(),
}

const boxBase = {
  x: coordinate,
  y: coordinate,
  w: boxSize,
  h: boxSize,
  z: zOrder,
  text: z.string().max(BOARD_LIMITS.textLength),
  runs: textRuns.optional(),
  pbiId: z.string().regex(/^[A-Za-z0-9_-]{1,40}$/).optional(),
  fill: z.enum(FILL_KEYS),
  stroke: z.enum(STROKE_KEYS),
  ...boxStyle,
  ...extras,
}

function boxSchema<T extends BoxType>(type: T) {
  return z.looseObject({ type: z.literal(type), ...boxBase })
}

const fileId = z.string().regex(/^[a-z0-9]{8,40}$/)
const cellSize = z.number().min(BOARD_LIMITS.tableCellMin).max(BOARD_LIMITS.boxSize)

/** A table: as many widths as each row has cells, as many heights as rows. */
const tableSchema = z
  .looseObject({
    type: z.literal("table"),
    ...boxBase,
    cells: z.array(z.array(z.string().max(BOARD_LIMITS.tableCellLength)).min(1).max(BOARD_LIMITS.tableCols)).min(1).max(BOARD_LIMITS.tableRows),
    colWidths: z.array(cellSize).min(1).max(BOARD_LIMITS.tableCols),
    rowHeights: z.array(cellSize).min(1).max(BOARD_LIMITS.tableRows),
    cellRuns: z
      .array(z.array(z.array(textRun).max(BOARD_LIMITS.runsPerText).nullable()).max(BOARD_LIMITS.tableCols))
      .max(BOARD_LIMITS.tableRows)
      .optional(),
  })
  .refine((t) => t.rowHeights.length === t.cells.length && t.cells.every((row) => row.length === t.colWidths.length), "table shape does not match")

const lineEndSchema = z.looseObject({
  x: coordinate,
  y: coordinate,
  attach: elementId.nullable().optional(),
  side: z.enum(SIDES).nullable().optional(),
})

function lineSchema<T extends LineType>(type: T) {
  return z.looseObject({
    type: z.literal(type),
    z: zOrder,
    start: lineEndSchema,
    end: lineEndSchema,
    stroke: z.enum(STROKE_KEYS),
    strokeWidth: z.number().min(BOARD_LIMITS.lineWidthMin).max(BOARD_LIMITS.strokeWidthMax).optional(),
    dash: z.enum(DASHES).optional(),
    route: z.enum(LINE_ROUTES).optional(),
    arrowStart: z.boolean().optional(),
    arrowEnd: z.boolean().optional(),
    label: z.string().max(BOARD_LIMITS.labelLength).optional(),
    ...extras,
  })
}

/** `data` of each known type. */
export const ELEMENT_DATA_SCHEMAS = {
  rect: boxSchema("rect"),
  ellipse: boxSchema("ellipse"),
  text: boxSchema("text"),
  sticky: z.looseObject({ type: z.literal("sticky"), ...boxBase, voters: z.array(z.string().min(1).max(64)).max(BOARD_LIMITS.votersPerSticky).optional() }),
  shape: z.looseObject({ type: z.literal("shape"), ...boxBase, shape: z.enum(SHAPE_KINDS) }),
  timer: z.looseObject({
    type: z.literal("timer"),
    ...boxBase,
    durationSec: z.number().int().min(10).max(BOARD_LIMITS.timerMaxSec),
    endsAt: z.number().int().min(0).max(8_640_000_000_000).optional(),
    remainingSec: z.number().min(0).max(BOARD_LIMITS.timerMaxSec).optional(),
    voteBudget: z.number().int().min(1).max(BOARD_LIMITS.voteBudgetMax).optional(),
  }),
  image: z.looseObject({ type: z.literal("image"), ...boxBase, fileId }),
  table: tableSchema,
  frame: z.looseObject({
    type: z.literal("frame"),
    ...boxBase,
    body: z.string().max(BOARD_LIMITS.textLength).optional(),
    bodyRuns: textRuns.optional(),
    hint: z.string().max(BOARD_LIMITS.hintLength).optional(),
  }),
  line: lineSchema("line"),
  arrow: lineSchema("arrow"),
} as const

/** Characters of one element's JSON the server accepts (a table holds many cells). */
export function elementJsonLimit(type: string): number {
  return type === "table" ? BOARD_LIMITS.tableJsonChars : BOARD_LIMITS.elementJsonChars
}

const anyDataSchema = z.looseObject({ type: z.string().regex(ELEMENT_TYPE_PATTERN) })

export type ElementData = Record<string, unknown> & { type: string }

/**
 * Validates one element's `data`: a known type against its schema, any other type by shape and size only.
 * Returns the problem as a short English reason (for logs and tests), or null when the data is acceptable.
 */
export function elementDataProblem(data: unknown): string | null {
  const base = anyDataSchema.safeParse(data)
  if (!base.success) return "data must be an object with a type"
  const type = base.data.type
  if (JSON.stringify(data).length > elementJsonLimit(type)) return "data is too large"
  if (!KNOWN_TYPES.includes(type)) return null
  const parsed = ELEMENT_DATA_SCHEMAS[type as keyof typeof ELEMENT_DATA_SCHEMAS].safeParse(data)
  return parsed.success ? null : `invalid ${type}`
}

// ---------------------------------------------------------------------------
// Stored form <-> editor form
// ---------------------------------------------------------------------------

/** An element as the API returns it. */
export interface StoredElement {
  id: string
  version: number
  deleted: boolean
  data: unknown
}

/** One element of a write request. */
export type ElementWrite =
  | { id: string; version: number; deleted: true }
  | { id: string; version: number; deleted?: false; data: ElementData }

/**
 * Stored `data` → editor element. A known type that does not pass its schema (written by a newer or a
 * broken client) is carried as unknown rather than dropped or repaired.
 */
export function elementFromData(id: string, data: unknown): BoardElement {
  const record = (typeof data === "object" && data !== null && !Array.isArray(data) ? data : {}) as Record<string, unknown>
  const type = typeof record.type === "string" ? record.type : ""
  if (KNOWN_TYPES.includes(type)) {
    const parsed = ELEMENT_DATA_SCHEMAS[type as keyof typeof ELEMENT_DATA_SCHEMAS].safeParse(record)
    if (parsed.success) return { ...(parsed.data as Record<string, unknown>), id } as unknown as KnownElement
  }
  return { id, type: "unknown", data: record }
}

/** Editor element → stored `data` (the inverse of elementFromData). */
export function elementToData(el: BoardElement): ElementData {
  if (el.type === "unknown") return el.data as ElementData
  const data: Record<string, unknown> = { ...el }
  delete data.id
  return data as ElementData
}
