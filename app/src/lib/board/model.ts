import { z } from "zod"
import { BOARD_LIMITS, ELEMENT_ID_PATTERN, ELEMENT_TYPE_PATTERN } from "./limits"

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

export const BOX_TYPES = ["rect", "ellipse", "text", "sticky"] as const
export type BoxType = (typeof BOX_TYPES)[number]

export const LINE_TYPES = ["line", "arrow"] as const
export type LineType = (typeof LINE_TYPES)[number]

export const KNOWN_TYPES: readonly string[] = [...BOX_TYPES, ...LINE_TYPES]

/** rect / ellipse / text / sticky: a box with optional text inside. */
export interface BoxElement {
  id: string
  type: BoxType
  x: number
  y: number
  w: number
  h: number
  /** Stacking order (higher is in front). */
  z: number
  text: string
  fill: FillKey
  /** Outline colour; for `text` the colour of the text. */
  stroke: StrokeKey
}

/** One end of a line. `attach` names the box it is connected to; x / y are where it was last drawn. */
export interface LineEnd {
  x: number
  y: number
  attach?: string | null
}

export interface LineElement {
  id: string
  type: LineType
  z: number
  start: LineEnd
  end: LineEnd
  stroke: StrokeKey
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

function boxSchema<T extends BoxType>(type: T) {
  return z.looseObject({
    type: z.literal(type),
    x: coordinate,
    y: coordinate,
    w: boxSize,
    h: boxSize,
    z: zOrder,
    text: z.string().max(BOARD_LIMITS.textLength),
    fill: z.enum(FILL_KEYS),
    stroke: z.enum(STROKE_KEYS),
  })
}

const lineEndSchema = z.looseObject({
  x: coordinate,
  y: coordinate,
  attach: elementId.nullable().optional(),
})

function lineSchema<T extends LineType>(type: T) {
  return z.looseObject({
    type: z.literal(type),
    z: zOrder,
    start: lineEndSchema,
    end: lineEndSchema,
    stroke: z.enum(STROKE_KEYS),
  })
}

/** `data` of each known type. */
export const ELEMENT_DATA_SCHEMAS = {
  rect: boxSchema("rect"),
  ellipse: boxSchema("ellipse"),
  text: boxSchema("text"),
  sticky: boxSchema("sticky"),
  line: lineSchema("line"),
  arrow: lineSchema("arrow"),
} as const

const anyDataSchema = z.looseObject({ type: z.string().regex(ELEMENT_TYPE_PATTERN) })

export type ElementData = Record<string, unknown> & { type: string }

/**
 * Validates one element's `data`: a known type against its schema, any other type by shape and size only.
 * Returns the problem as a short English reason (for logs and tests), or null when the data is acceptable.
 */
export function elementDataProblem(data: unknown): string | null {
  const base = anyDataSchema.safeParse(data)
  if (!base.success) return "data must be an object with a type"
  if (JSON.stringify(data).length > BOARD_LIMITS.elementJsonChars) return "data is too large"
  const type = base.data.type
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
