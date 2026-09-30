/**
 * Glossary input markup (pure functions).
 *
 *   basic form:    `用語<<訳語>>`   — the word right before `<<` is the term
 *   explicit form: `<<用語|訳語>>`  — when the term boundary is ambiguous
 *
 * Term boundary:
 *   - Latin (ID): the run of non-space, non-punctuation characters before `<<`.
 *   - Japanese: the run of the same script (kanji / hiragana / katakana).
 *     `この改善<<KAIZEN>>` → term `改善`.
 *
 * Unclosed `<<`, empty content, nesting and a bare `>>` are left untouched.
 */

export interface GlossaryMarker {
  term: string
  translation: string
}

export interface ExtractResult {
  cleaned: string
  entries: GlossaryMarker[]
}

const KANJI = /[㐀-鿿々〆ヶ]/
const HIRAGANA = /[぀-ゟ]/
const KATAKANA = /[゠-ヿ]/
/** Latin term boundary: whitespace and common punctuation / brackets. */
const LATIN_BOUNDARY = /[\s.,;:!?()[\]{}「」『』、。・"'`<>|/\\]/
const JA_ANY = /[぀-ヿ㐀-鿿]/

type Script = "kanji" | "hiragana" | "katakana" | "latin" | "boundary"

function scriptOf(ch: string): Script {
  if (KANJI.test(ch)) return "kanji"
  if (HIRAGANA.test(ch)) return "hiragana"
  if (KATAKANA.test(ch)) return "katakana"
  if (LATIN_BOUNDARY.test(ch)) return "boundary"
  return "latin"
}

/** Cut the term out of the text right before `openIdx`. Null when there is none. */
function termBefore(text: string, openIdx: number): { start: number; term: string } | null {
  if (openIdx === 0) return null
  const chars = Array.from(text.slice(0, openIdx))
  let i = chars.length - 1
  const script = scriptOf(chars[i]!)
  if (script === "boundary") return null
  while (i >= 0) {
    const s = scriptOf(chars[i]!)
    // Japanese: mixed kanji+kana is not one word (「この改善」→「改善」); same script only.
    if (s !== script) break
    i -= 1
  }
  const startChar = i + 1
  const term = chars.slice(startChar).join("")
  if (!term) return null
  const start = chars.slice(0, startChar).join("").length
  return { start, term }
}

export function extractGlossaryMarkers(text: string): ExtractResult {
  const entries: GlossaryMarker[] = []
  let out = ""
  let pos = 0
  while (pos < text.length) {
    const open = text.indexOf("<<", pos)
    if (open < 0) {
      out += text.slice(pos)
      break
    }
    const close = text.indexOf(">>", open + 2)
    const inner = close >= 0 ? text.slice(open + 2, close) : ""
    // Unclosed / empty / nested (another `<<` inside) → not markup.
    if (close < 0 || !inner.trim() || inner.includes("<<")) {
      out += text.slice(pos, open + 2)
      pos = open + 2
      continue
    }
    const bar = inner.indexOf("|")
    if (bar >= 0) {
      // Explicit form <<term|translation>>
      const term = inner.slice(0, bar).trim()
      const translation = inner.slice(bar + 1).trim()
      out += text.slice(pos, open)
      if (term && translation) {
        entries.push({ term, translation })
        out += term
      } else {
        out += text.slice(open, close + 2)
      }
      pos = close + 2
      continue
    }
    // Basic form term<<translation>> — look for the term in what was emitted so far.
    const before = out + text.slice(pos, open)
    const found = termBefore(before, before.length)
    // Nesting (`a<<b<<c>>>>`): a `<` right before the term or a `>` right after the close.
    const nested =
      (found && found.start > 0 && before[found.start - 1] === "<") || text[close + 2] === ">"
    if (!found || nested) {
      out += text.slice(pos, close + 2)
      pos = close + 2
      continue
    }
    entries.push({ term: found.term, translation: inner.trim() })
    out = before // keep the term, drop only `<<translation>>`
    pos = close + 2
  }
  return { cleaned: out, entries: dedupe(entries) }
}

function dedupe(entries: GlossaryMarker[]): GlossaryMarker[] {
  const map = new Map<string, GlossaryMarker>()
  for (const e of entries) map.set(e.term, e) // last one wins
  return Array.from(map.values())
}

/** Lookup-key normalization: Latin is lower/trim, Japanese is trim only. */
export function normalizeTerm(term: string): string {
  const t = term.trim()
  return JA_ANY.test(t) ? t : t.toLowerCase()
}

/** True when `text` contains at least one `<<...>>` marker (cheap pre-check). */
export function hasGlossaryMarkup(text: string): boolean {
  return text.includes("<<") && text.includes(">>")
}

/**
 * Pick the glossary terms that occur in `text`, longest first (max `limit`).
 * Latin terms match case-insensitively. Pure — pass the DB candidates in.
 */
export function matchGlossary<T extends { term: string; termNorm: string }>(
  text: string,
  candidates: T[],
  limit = 50
): T[] {
  const lower = text.toLowerCase()
  return candidates
    .filter((c) => (JA_ANY.test(c.term) ? text.includes(c.term) : lower.includes(c.termNorm)))
    .sort((a, b) => b.term.length - a.term.length)
    .slice(0, limit)
}

/** True when the translation shows up in the output (Latin: case-insensitive). */
export function containsTranslation(output: string, translation: string): boolean {
  const needle = translation.trim()
  if (!needle) return true
  if (/^[\x00-\x7F]*$/.test(needle)) return output.toLowerCase().includes(needle.toLowerCase())
  return output.includes(needle)
}

export function glossaryMisses(output: string, glossary: GlossaryMarker[]): string[] {
  return glossary.filter((g) => !containsTranslation(output, g.translation)).map((g) => g.term)
}
