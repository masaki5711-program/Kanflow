/**
 * Nothing the migrator prints or writes into a report may contain a row
 * value (personal data such as e-mail addresses). Database drivers echo
 * values in their messages ('invalid input syntax for type boolean: "x"',
 * "Key (email)=(x) already exists", "Duplicate entry 'x' for key ...");
 * sanitizeError keeps the error code and the message shape and replaces
 * every quoted / parenthesised value. The PostgreSQL `detail` field (which
 * carries the values) is never used.
 */
const KEEP_AFTER = /(?:constraint|relation|column|table|index|key|schema|database)\s*$/i

export function scrubValues(message: string): string {
  const quoted = (q: string) =>
    new RegExp(`${q}[^${q}]*${q}`, "g")
  let out = message.replace(/\(([^()]*)\)=\(([^()]*)\)/g, "($1)=(…)")
  for (const q of ['"', "'"]) {
    out = out.replace(quoted(q), (m, offset: number, whole: string) => (KEEP_AFTER.test(whole.slice(0, offset)) ? m : `${q}…${q}`))
  }
  return out
}

export function sanitizeError(e: unknown): string {
  if (!(e instanceof Error)) return scrubValues(String(e))
  const code = (e as { code?: unknown }).code
  const prefix = typeof code === "string" && code !== "" && !e.message.startsWith(code) ? `${code} ` : ""
  return `${prefix}${scrubValues(e.message)}`
}

/** Deep copy with every occurrence of a secret replaced by *** (strings and keys). */
export function redactDeep<T>(value: T, secrets: readonly string[]): T {
  const live = secrets.filter((s) => s.length > 0)
  const str = (s: string): string => live.reduce((t, x) => t.split(x).join("***"), s)
  const walk = (v: unknown): unknown => {
    if (typeof v === "string") return str(v)
    if (Array.isArray(v)) return v.map(walk)
    if (v !== null && typeof v === "object") return Object.fromEntries(Object.entries(v as Record<string, unknown>).map(([k, x]) => [str(k), walk(x)]))
    return v
  }
  return walk(value) as T
}
