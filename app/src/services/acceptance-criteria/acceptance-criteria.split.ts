/**
 * Pure: the old free-text 受入基準 of a PBI → criterion items (scripts/migrate-acceptance-criteria.ts).
 *
 * A line starting with a bullet (`- * ・ • ● ○ □ ☐ ■`, optionally with a checkbox `[ ]` / `[x]`) or a
 * number (`1.` `1)` `1、` `1．` `(1)` `①`) starts a new item; the following lines without a marker
 * continue it. Text without any marker is ONE item (a block that cannot be split stays whole).
 * Lines before the first marker become an item of their own, so no text is dropped.
 * Blank lines are ignored.
 */

const MARKER = new RegExp(
  [
    "^\\s*(?:",
    "[-*+](?:\\s+|$)", // ASCII bullets need a space ("-5 ℃" is not a bullet)
    "|[・•●○□☐■▪‣]\\s*", // typographic bullets
    "|\\[[ xX✓]\\]\\s*", // checkbox
    "|\\(?\\d{1,3}[)）、]\\s*", // 1) (1) 1、
    "|\\d{1,3}[.．]\\s+", // "1. " (not "1.5倍")
    "|[①-⑳]\\s*",
    ")",
  ].join("")
)

/** Cap per item, so one pathological line cannot exceed what the API accepts. */
export const SPLIT_ITEM_MAX = 2000

function stripMarker(line: string): string | null {
  let rest = line
  let matched = false
  // A bullet may be followed by a checkbox ("- [ ] text"): strip markers repeatedly (at most twice).
  for (let i = 0; i < 2; i++) {
    const m = MARKER.exec(rest)
    if (!m) break
    matched = true
    rest = rest.slice(m[0].length)
  }
  return matched ? rest.trim() : null
}

export function splitAcceptanceCriteria(source: string | null | undefined): string[] {
  const lines = (source ?? "").replace(/\r\n?/g, "\n").split("\n")
  const items: string[] = []
  let current: string[] | null = null
  let sawMarker = false
  const flush = () => {
    if (current) {
      const joined = current.join("\n").trim()
      if (joined) items.push(joined)
    }
    current = null
  }
  for (const raw of lines) {
    if (!raw.trim()) continue
    const body = stripMarker(raw)
    if (body !== null) {
      flush()
      sawMarker = true
      current = [body]
    } else if (current) {
      current.push(raw.trim())
    } else {
      current = [raw.trim()]
    }
  }
  flush()
  // No marker at all: the whole block is one item (line breaks kept).
  if (!sawMarker) {
    const whole = lines.map((l) => l.trim()).filter(Boolean).join("\n")
    return whole ? [clip(whole)] : []
  }
  return items.map(clip)
}

function clip(s: string): string {
  return s.length > SPLIT_ITEM_MAX ? s.slice(0, SPLIT_ITEM_MAX) : s
}
