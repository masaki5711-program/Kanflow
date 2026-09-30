/**
 * Masking helpers for log payloads: secrets are replaced, user free text is
 * truncated so logs never hold full passwords/tokens or whole user messages.
 */

export const REDACTED = "[REDACTED]"

/** Object keys whose values are always masked. */
export const SECRET_KEY_PATTERN =
  /pass(word|wd)?$|passphrase|secret|token|authorization|^auth$|cookie|api[-_]?key|private[-_]?key|credential|session[-_]?id/i

/** Keys treated as user free text (truncated to `maxTextLength`). */
export const DEFAULT_TEXT_KEYS: readonly string[] = [
  "content", "text", "message", "body", "description", "prompt", "question", "q", "comment", "note", "memo",
]

export const DEFAULT_MAX_TEXT_LENGTH = 200
export const DEFAULT_MAX_STRING_LENGTH = 2000
const MAX_DEPTH = 8

export interface RedactOptions {
  /** Max chars kept for free-text keys. Default 200 (or env LOG_MAX_TEXT). */
  maxTextLength?: number
  /** Max chars kept for any other string. Default 2000. */
  maxStringLength?: number
  /** Keys considered free text. Default `DEFAULT_TEXT_KEYS`. */
  textKeys?: readonly string[]
}

/** Cut `s` to `max` chars, noting how much was dropped. */
export function truncateText(s: string, max: number): string {
  if (max <= 0) return s.length > 0 ? `…(${s.length} chars)` : ""
  return s.length > max ? `${s.slice(0, max)}…(+${s.length - max} chars)` : s
}

/** Mask secrets that appear inline in a string (Bearer tokens, `password=...`, etc.). */
export function redactString(s: string): string {
  return s
    .replace(/\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]+/gi, `$1 ${REDACTED}`)
    .replace(
      /\b(password|passwd|pwd|secret|token|api[-_]?key|access[-_]?key)(["']?\s*[:=]\s*["']?)[^\s"'&,;]+/gi,
      `$1$2${REDACTED}`,
    )
}

function envMaxText(): number {
  const raw = process.env.LOG_MAX_TEXT
  const n = raw ? Number(raw) : NaN
  return Number.isFinite(n) && n >= 0 ? n : DEFAULT_MAX_TEXT_LENGTH
}

/**
 * Returns a redacted deep copy of `value` (input is never mutated).
 * Errors become `{ name, message, stack }`; circular refs become "[Circular]".
 */
export function redact(value: unknown, opts: RedactOptions = {}): unknown {
  const cfg = {
    maxText: opts.maxTextLength ?? envMaxText(),
    maxString: opts.maxStringLength ?? DEFAULT_MAX_STRING_LENGTH,
    textKeys: new Set((opts.textKeys ?? DEFAULT_TEXT_KEYS).map((k) => k.toLowerCase())),
  }
  return walk(value, undefined, 0, new WeakSet<object>(), cfg)
}

/** Numbers/booleans under a secret-ish key (e.g. `maxTokens: 512`) are not secrets. */
function isMaskable(value: unknown): boolean {
  if (typeof value === "string") return value !== ""
  return typeof value === "object" && value !== null
}

interface WalkConfig {
  maxText: number
  maxString: number
  textKeys: Set<string>
}

function walk(value: unknown, key: string | undefined, depth: number, seen: WeakSet<object>, cfg: WalkConfig): unknown {
  if (key !== undefined && SECRET_KEY_PATTERN.test(key) && isMaskable(value)) return REDACTED
  if (typeof value === "string") {
    const isText = key !== undefined && cfg.textKeys.has(key.toLowerCase())
    return truncateText(redactString(value), isText ? cfg.maxText : cfg.maxString)
  }
  if (typeof value === "bigint") return value.toString()
  if (typeof value === "function" || typeof value === "symbol") return undefined
  if (value === null || typeof value !== "object") return value
  if (value instanceof Date) return value.toISOString()
  if (seen.has(value)) return "[Circular]"
  if (depth >= MAX_DEPTH) return "[Truncated]"
  seen.add(value)
  if (value instanceof Error) {
    return {
      name: value.name,
      message: walk(value.message, undefined, depth + 1, seen, cfg),
      stack: value.stack,
    }
  }
  if (Array.isArray(value)) {
    return value.map((v) => walk(v, key, depth + 1, seen, cfg))
  }
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, walk(v, k, depth + 1, seen, cfg)]),
  )
}
