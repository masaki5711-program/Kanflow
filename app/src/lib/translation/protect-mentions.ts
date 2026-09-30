import { splitMentionSegments } from "@/lib/mentions"

/**
 * Shield @mentions (`@[Display Name]` / `@token`, see lib/mentions.ts) from
 * the translation model: each mention is swapped for a numbered placeholder
 * before the prompt is built and swapped back afterwards, so names are never
 * translated, transliterated or dropped — the stored translation keeps the
 * exact mention markup and still resolves to the same member.
 */

export interface ProtectedText {
  /** Text with every mention replaced by `{{M<n>}}`. */
  text: string
  /** Original mention markup, index = placeholder number. */
  tokens: string[]
}

const placeholder = (i: number) => `{{M${i}}}`
// Tolerates the model adding spaces or full-width braces around the number.
const PLACEHOLDER_RE = /[{｛]{2}\s*M\s*(\d+)\s*[}｝]{2}/g

/** Pure: replace mentions with placeholders (text without mentions is returned as is). */
export function protectMentions(text: string): ProtectedText {
  const tokens: string[] = []
  const parts = splitMentionSegments(text).map((seg) => {
    if (seg.type === "text") return seg.text
    tokens.push(seg.raw)
    return placeholder(tokens.length - 1)
  })
  return { text: tokens.length === 0 ? text : parts.join(""), tokens }
}

/**
 * Pure: put the original mentions back. Placeholders the model dropped are
 * appended (space-separated) so no mention is ever lost; unknown numbers are
 * removed.
 */
export function restoreMentions(translated: string, tokens: readonly string[]): string {
  if (tokens.length === 0) return translated
  const used = new Set<number>()
  const restored = translated.replace(PLACEHOLDER_RE, (_m, n: string) => {
    const i = Number(n)
    if (!(i in tokens)) return ""
    used.add(i)
    return tokens[i]
  })
  const missing = tokens.filter((_t, i) => !used.has(i))
  return missing.length === 0 ? restored : `${restored.trimEnd()} ${missing.join(" ")}`.trim()
}
