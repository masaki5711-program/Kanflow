/**
 * Value conversion MySQL -> PostgreSQL and the canonical form used for hashing.
 *
 * The source is read with every value as text (or a Buffer for binary
 * columns): no driver-side Date / number / JSON parsing can shift or round a
 * value. The text is validated for the target type and sent to PostgreSQL as a
 * text parameter with an explicit cast.
 *
 * Timezone rule: MySQL DATETIME(3) has no zone. Prisma writes UTC wall-clock
 * values into it and reads PostgreSQL TIMESTAMP(3) the same way, so the value
 * is copied unchanged (no shift in either direction). The MySQL session runs
 * with time_zone = '+00:00' so a TIMESTAMP column (none in the Kanflow schema)
 * would also be read as UTC. Rows that legacy code wrote in server local time
 * (field_translation.requested_at, UTC+7) are detected and REPORTED by the
 * pre-checks, never silently shifted.
 */

export type TargetKind =
  | "boolean"
  | "integer"
  | "float"
  | "numeric"
  | "text"
  | "char"
  | "enum"
  | "timestamp"
  | "timestamptz"
  | "date"
  | "json"
  | "jsonb"
  | "bytea"

export type ConversionCode = "BOOLEAN_DOMAIN" | "INVALID_DATETIME" | "NUL_BYTE" | "INVALID_JSON" | "INVALID_NUMBER" | "UNSUPPORTED_VALUE"

export class ConversionError extends Error {
  readonly code: ConversionCode

  constructor(code: ConversionCode, message: string) {
    super(message)
    this.name = "ConversionError"
    this.code = code
  }
}

export interface ColumnMapping {
  name: string
  kind: TargetKind
  /** cast used in the INSERT (format_type of the target column) */
  pgType: string
  /** MySQL DATA_TYPE / COLUMN_TYPE of the source column */
  sourceType: string
  sourceColumnType: string
  nullable: boolean
}

export type SourceValue = string | Buffer | null

const KIND_BY_TYPNAME: Record<string, TargetKind> = {
  bool: "boolean",
  int2: "integer",
  int4: "integer",
  int8: "integer",
  float4: "float",
  float8: "float",
  numeric: "numeric",
  text: "text",
  varchar: "text",
  citext: "text",
  bpchar: "char",
  timestamp: "timestamp",
  timestamptz: "timestamptz",
  date: "date",
  json: "json",
  jsonb: "jsonb",
  bytea: "bytea",
}

export function targetKindOf(typname: string, typtype: string): TargetKind | null {
  if (typtype === "e") return "enum"
  return KIND_BY_TYPNAME[typname] ?? null
}

const DATETIME_RE = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,6}))?)?$/
const INTEGER_RE = /^-?\d+$/
const DECIMAL_RE = /^-?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i

function assertDatetime(s: string, withTime: boolean): void {
  const m = DATETIME_RE.exec(s)
  if (!m || (withTime && m[4] === undefined)) throw new ConversionError("INVALID_DATETIME", "not a datetime")
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])]
  if (y === 0 || mo < 1 || mo > 12 || d < 1 || d > 31) {
    throw new ConversionError("INVALID_DATETIME", "zero / invalid date")
  }
}

export function jsonHasNul(v: unknown): boolean {
  if (typeof v === "string") return v.includes("\u0000")
  if (Array.isArray(v)) return v.some(jsonHasNul)
  if (v !== null && typeof v === "object") {
    return Object.entries(v as Record<string, unknown>).some(([k, x]) => k.includes("\u0000") || jsonHasNul(x))
  }
  return false
}

function parseJson(s: string): unknown {
  let parsed: unknown
  try {
    parsed = JSON.parse(s)
  } catch {
    throw new ConversionError("INVALID_JSON", "does not parse as JSON")
  }
  if (jsonHasNul(parsed)) throw new ConversionError("INVALID_JSON", "contains \\u0000, which PostgreSQL jsonb rejects")
  return parsed
}

/** Source value -> the text parameter inserted into the target (null = SQL NULL). Throws ConversionError. */
export function toTargetText(value: SourceValue, col: ColumnMapping): string | null {
  if (value === null) return null
  if (Buffer.isBuffer(value)) {
    if (col.kind === "bytea") return `\\x${value.toString("hex")}`
    throw new ConversionError("UNSUPPORTED_VALUE", `binary value for a ${col.kind} column`)
  }
  switch (col.kind) {
    case "boolean":
      if (value === "0") return "false"
      if (value === "1") return "true"
      throw new ConversionError("BOOLEAN_DOMAIN", "tinyint value is neither 0 nor 1")
    case "integer":
      if (!INTEGER_RE.test(value)) throw new ConversionError("INVALID_NUMBER", "not an integer")
      return value
    case "float":
    case "numeric":
      if (!DECIMAL_RE.test(value) || !Number.isFinite(Number(value))) {
        throw new ConversionError("INVALID_NUMBER", "not a number")
      }
      return value
    case "timestamp":
      assertDatetime(value, false)
      return value
    case "timestamptz":
      assertDatetime(value, false)
      return `${value}+00`
    case "date":
      assertDatetime(value, false)
      return value.slice(0, 10)
    case "json":
    case "jsonb":
      parseJson(value)
      return value
    case "bytea":
      return `\\x${Buffer.from(value, "utf8").toString("hex")}`
    case "text":
    case "char":
    case "enum":
      if (value.includes("\u0000")) throw new ConversionError("NUL_BYTE", "contains a NUL (0x00) character")
      return value
  }
}

export function stableStringify(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(stableStringify).join(",")}]`
  if (v !== null && typeof v === "object") {
    const o = v as Record<string, unknown>
    return `{${Object.keys(o)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${stableStringify(o[k])}`)
      .join(",")}}`
  }
  return JSON.stringify(v)
}

/**
 * Exact decimal form of a JSON number token: no double rounding (MySQL prints
 * 1e300, jsonb prints 1 followed by 300 zeros; 12345678901234567890 must not
 * equal ...891). Result: [-]digits with the decimal exponent, trailing zeros stripped.
 */
export function canonicalNumber(token: string): string {
  const m = /^(-?)(\d+)(?:\.(\d+))?(?:[eE]([-+]?\d+))?$/.exec(token)
  if (!m) throw new SyntaxError("bad number")
  let digits = `${m[2]}${m[3] ?? ""}`
  let exp = Number(m[4] ?? "0") - (m[3] ?? "").length
  digits = digits.replace(/^0+/, "")
  if (digits === "") return "0"
  const trail = /0+$/.exec(digits)?.[0].length ?? 0
  digits = digits.slice(0, digits.length - trail)
  exp += trail
  return exp === 0 ? `${m[1]}${digits}` : `${m[1]}${digits}e${exp}`
}

const WS = new Set([" ", String.fromCharCode(9), String.fromCharCode(10), String.fromCharCode(13)])

/** Canonical JSON text: keys sorted (last duplicate wins, as in jsonb / MySQL 8), numbers exact. */
export function canonicalJson(text: string): string {
  let i = 0
  const ws = (): void => {
    while (i < text.length && WS.has(text[i])) i++
  }
  const str = (): string => {
    const start = i
    i++
    while (i < text.length && text[i] !== '"') i += text[i] === "\\" ? 2 : 1
    if (text[i] !== '"') throw new SyntaxError("unterminated string")
    i++
    return JSON.stringify(JSON.parse(text.slice(start, i)) as string)
  }
  const value = (): string => {
    ws()
    const c = text[i]
    if (c === "{") {
      i++
      const entries = new Map<string, string>()
      ws()
      if (text[i] === "}") {
        i++
        return "{}"
      }
      for (;;) {
        ws()
        if (text[i] !== '"') throw new SyntaxError("key expected")
        const k = str()
        ws()
        if (text[i++] !== ":") throw new SyntaxError(": expected")
        entries.set(k, value())
        ws()
        if (text[i] === ",") {
          i++
          continue
        }
        if (text[i++] !== "}") throw new SyntaxError("} expected")
        break
      }
      return `{${[...entries.keys()].sort().map((k) => `${k}:${entries.get(k)}`).join(",")}}`
    }
    if (c === "[") {
      i++
      const items: string[] = []
      ws()
      if (text[i] === "]") {
        i++
        return "[]"
      }
      for (;;) {
        items.push(value())
        ws()
        if (text[i] === ",") {
          i++
          continue
        }
        if (text[i++] !== "]") throw new SyntaxError("] expected")
        break
      }
      return `[${items.join(",")}]`
    }
    if (c === '"') return str()
    for (const lit of ["true", "false", "null"]) {
      if (text.startsWith(lit, i)) {
        i += lit.length
        return lit
      }
    }
    const m = /^-?\d+(?:\.\d+)?(?:[eE][-+]?\d+)?/.exec(text.slice(i))
    if (!m) throw new SyntaxError("value expected")
    i += m[0].length
    return canonicalNumber(m[0])
  }
  const out = value()
  ws()
  if (i !== text.length) throw new SyntaxError("trailing data")
  return out
}

const TS_RE = /^(\d{4}-\d{2}-\d{2})(?:[ T](\d{2}:\d{2}:\d{2})(?:\.(\d{1,6}))?)?(?:([+-])(\d{2})(?::?(\d{2}))?|Z)?$/

function canonicalTimestamp(s: string, withZone: boolean): string {
  const m = TS_RE.exec(s)
  if (!m) return `!unparsed:${s}`
  const frac = (m[3] ?? "").padEnd(6, "0")
  const time = m[2] ?? "00:00:00"
  if (!withZone) return `${m[1]} ${time}.${frac}`
  const offsetMin = m[4] === undefined ? 0 : (m[4] === "-" ? -1 : 1) * (Number(m[5]) * 60 + Number(m[6] ?? "0"))
  const utc = new Date(Date.parse(`${m[1]}T${time}Z`) - offsetMin * 60_000)
  return `${utc.toISOString().slice(0, 19).replace("T", " ")}.${frac}Z`
}

/**
 * One representation per value for both sides: the source's converted text
 * and PostgreSQL's text output must canonicalize identically when the value
 * survived the copy.
 */
export function canonicalValue(kind: TargetKind, text: string | null): string | null {
  if (text === null) return null
  switch (kind) {
    case "boolean":
      return text === "t" || text === "true" ? "true" : text === "f" || text === "false" ? "false" : `!bool:${text}`
    case "integer":
      return INTEGER_RE.test(text) ? BigInt(text).toString() : `!int:${text}`
    case "float":
      return String(Number(text))
    case "timestamp":
      return canonicalTimestamp(text, false)
    case "timestamptz":
      return canonicalTimestamp(text, true)
    case "json":
    case "jsonb":
      try {
        return canonicalJson(text)
      } catch {
        return `!json:${text}`
      }
    case "char":
      return text.replace(/ +$/, "")
    case "bytea":
      return text.toLowerCase()
    case "numeric":
    case "text":
    case "enum":
    case "date":
      return text
  }
}

/** Canonical row: JSON array (null stays null, so NULL != "null" != ""). */
export function canonicalRow(kinds: readonly TargetKind[], texts: readonly (string | null)[]): string {
  return JSON.stringify(texts.map((t, i) => canonicalValue(kinds[i], t)))
}
