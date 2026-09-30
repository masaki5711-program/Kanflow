/**
 * Split plain text into text and http(s) URL parts. Only http/https are ever
 * linked (no javascript:/data:), and trailing punctuation stays text.
 */
export type TextPart = { type: "text"; text: string } | { type: "url"; href: string }

const URL_RE = /https?:\/\/[^\s<>"'`]+/g
const TRAILING = /[.,!?;:)\]}、。，！？）」』】]+$/u

export function linkifyParts(text: string): TextPart[] {
  const parts: TextPart[] = []
  let index = 0
  for (const match of text.matchAll(URL_RE)) {
    const start = match.index ?? 0
    const href = match[0].replace(TRAILING, "")
    if (start > index) parts.push({ type: "text", text: text.slice(index, start) })
    parts.push({ type: "url", href })
    index = start + href.length
  }
  if (index < text.length) parts.push({ type: "text", text: text.slice(index) })
  return parts
}
