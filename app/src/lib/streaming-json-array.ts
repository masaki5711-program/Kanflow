/**
 * Stream-friendly incremental parser for a JSON document of shape:
 *   { "<arrayKey>": [ { ... }, { ... }, ... ] }
 *
 * Unlike a regular JSON parser this one emits results from a partially
 * received buffer. Each object inside the array is returned with whatever
 * key/value pairs have already been parsed; strings whose closing quote has
 * not yet arrived are surfaced as partial strings. The `closed` flag tells
 * the caller whether the object's terminating `}` has been seen.
 *
 * Object values are parsed as raw JSON when complete (so arrays/nested
 * objects are returned as-is). Designed for live-typing UI feedback over the
 * assistant token stream.
 */
export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [k: string]: JsonValue }

export interface PartialJsonObject {
  fields: Record<string, JsonValue>
  closed: boolean
}

const WS = /[\s,]/

function skipWs(buf: string, i: number): number {
  while (i < buf.length && WS.test(buf[i])) i++
  return i
}

function findStringEnd(buf: string, start: number): number {
  let i = start + 1
  while (i < buf.length) {
    const ch = buf[i]
    if (ch === "\\") {
      i += 2
      continue
    }
    if (ch === '"') return i
    i++
  }
  return -1
}

function decodePartialString(body: string): string {
  let out = ""
  for (let i = 0; i < body.length; i++) {
    const ch = body[i]
    if (ch !== "\\") {
      out += ch
      continue
    }
    const next = body[i + 1]
    if (next === undefined) break
    i++
    switch (next) {
      case '"': out += '"'; break
      case "\\": out += "\\"; break
      case "/": out += "/"; break
      case "n": out += "\n"; break
      case "t": out += "\t"; break
      case "r": out += "\r"; break
      case "b": out += "\b"; break
      case "f": out += "\f"; break
      case "u": {
        const hex = body.slice(i + 1, i + 5)
        if (hex.length < 4) return out
        const code = parseInt(hex, 16)
        if (!Number.isNaN(code)) {
          out += String.fromCharCode(code)
          i += 4
        }
        break
      }
      default: out += next
    }
  }
  return out
}

/**
 * Finds the end index of a bracketed JSON value (object or array) starting at
 * `start`. Returns the index *just past* the closing bracket, or -1 if the
 * value has not closed yet. Aware of strings and escapes.
 */
function findBracketEnd(buf: string, start: number): number {
  const open = buf[start]
  const close = open === "{" ? "}" : "]"
  let depth = 0
  let i = start
  while (i < buf.length) {
    const ch = buf[i]
    if (ch === '"') {
      const e = findStringEnd(buf, i)
      if (e === -1) return -1
      i = e + 1
      continue
    }
    if (ch === open) depth++
    else if (ch === close) {
      depth--
      if (depth === 0) return i + 1
    }
    i++
  }
  return -1
}

function parseLiteralEnd(buf: string, start: number): number {
  let i = start
  while (i < buf.length && !/[,}\]\s]/.test(buf[i])) i++
  return i
}

/**
 * Best-effort parse of an array starting at `start` (which must point at `[`).
 * Returns the items decoded so far. If `complete` is false the array is still
 * being received and the last item may be partial. Strings inside the array
 * whose closing quote has not arrived are surfaced as their partial content.
 */
function parsePartialArray(buf: string, start: number): { value: JsonValue[]; end: number; complete: boolean } {
  const items: JsonValue[] = []
  let i = start + 1
  while (i < buf.length) {
    i = skipWs(buf, i)
    if (i >= buf.length) return { value: items, end: i, complete: false }
    if (buf[i] === "]") return { value: items, end: i + 1, complete: true }

    const ch = buf[i]
    if (ch === '"') {
      const e = findStringEnd(buf, i)
      if (e === -1) {
        items.push(decodePartialString(buf.slice(i + 1)))
        return { value: items, end: buf.length, complete: false }
      }
      try {
        items.push(JSON.parse(buf.slice(i, e + 1)) as string)
      } catch {
        items.push(decodePartialString(buf.slice(i + 1, e)))
      }
      i = e + 1
    } else if (ch === "{") {
      const e = findBracketEnd(buf, i)
      if (e === -1) return { value: items, end: i, complete: false }
      try {
        items.push(JSON.parse(buf.slice(i, e)) as JsonValue)
      } catch {
        // ignore malformed
      }
      i = e
    } else if (ch === "[") {
      const sub = parsePartialArray(buf, i)
      items.push(sub.value)
      if (!sub.complete) return { value: items, end: sub.end, complete: false }
      i = sub.end
    } else {
      const litEnd = parseLiteralEnd(buf, i)
      if (litEnd === buf.length) return { value: items, end: i, complete: false }
      const token = buf.slice(i, litEnd)
      if (token === "true") items.push(true)
      else if (token === "false") items.push(false)
      else if (token === "null") items.push(null)
      else {
        const n = Number(token)
        if (!Number.isNaN(n)) items.push(n)
      }
      i = litEnd
    }
  }
  return { value: items, end: i, complete: false }
}

/**
 * Parses a single object whose `{` is at `start`. Returns the (potentially
 * partial) fields and the index after the closing `}` if closed.
 */
function parsePartialObject(buf: string, start: number): { obj: PartialJsonObject; end: number } {
  const obj: PartialJsonObject = { fields: {}, closed: false }
  let i = start + 1

  while (i < buf.length) {
    i = skipWs(buf, i)
    if (i >= buf.length) return { obj, end: i }
    if (buf[i] === "}") {
      obj.closed = true
      return { obj, end: i + 1 }
    }
    if (buf[i] !== '"') return { obj, end: i }

    // key
    const keyEnd = findStringEnd(buf, i)
    if (keyEnd === -1) return { obj, end: i }
    let key: string
    try {
      key = JSON.parse(buf.slice(i, keyEnd + 1)) as string
    } catch {
      return { obj, end: i }
    }
    i = keyEnd + 1
    i = skipWs(buf, i)
    if (i >= buf.length || buf[i] !== ":") return { obj, end: i }
    i++
    i = skipWs(buf, i)
    if (i >= buf.length) return { obj, end: i }

    // value
    const ch = buf[i]
    if (ch === '"') {
      const valEnd = findStringEnd(buf, i)
      if (valEnd === -1) {
        obj.fields[key] = decodePartialString(buf.slice(i + 1))
        return { obj, end: buf.length }
      }
      try {
        obj.fields[key] = JSON.parse(buf.slice(i, valEnd + 1)) as string
      } catch {
        obj.fields[key] = decodePartialString(buf.slice(i + 1, valEnd))
      }
      i = valEnd + 1
    } else if (ch === "[") {
      const arr = parsePartialArray(buf, i)
      obj.fields[key] = arr.value
      if (!arr.complete) return { obj, end: arr.end }
      i = arr.end
    } else if (ch === "{") {
      const end = findBracketEnd(buf, i)
      if (end === -1) return { obj, end: i }
      try {
        obj.fields[key] = JSON.parse(buf.slice(i, end)) as JsonValue
      } catch {
        // ignore malformed
      }
      i = end
    } else {
      const litEnd = parseLiteralEnd(buf, i)
      if (litEnd === buf.length) {
        // Literal not yet complete — bail out
        return { obj, end: i }
      }
      const token = buf.slice(i, litEnd)
      if (token === "true") obj.fields[key] = true
      else if (token === "false") obj.fields[key] = false
      else if (token === "null") obj.fields[key] = null
      else {
        const n = Number(token)
        if (!Number.isNaN(n)) obj.fields[key] = n
      }
      i = litEnd
    }
  }

  return { obj, end: i }
}

export function extractPartialArrayObjects(buffer: string, arrayKey: string): PartialJsonObject[] {
  const keyPattern = new RegExp(`"${arrayKey}"\\s*:\\s*\\[`)
  const match = buffer.match(keyPattern)
  if (!match) return []
  let i = (match.index ?? 0) + match[0].length

  const out: PartialJsonObject[] = []
  while (i < buffer.length) {
    i = skipWs(buffer, i)
    if (i >= buffer.length) break
    if (buffer[i] === "]") break
    if (buffer[i] !== "{") break
    const { obj, end } = parsePartialObject(buffer, i)
    out.push(obj)
    if (!obj.closed) break
    i = end
  }
  return out
}
