/**
 * @mention parsing for comments — pure, shared by the server (mention
 * resolution / notifications) and the client (highlighting, composer).
 *
 * Two token forms are recognised:
 * - bracket form `@[Display Name]` — produced by the composer's autocomplete;
 *   the name may contain spaces (1..MENTION_NAME_MAX chars, no `]` / line break)
 * - bare form `@token` — hand-typed, no whitespace in the token. It must not
 *   follow a letter / digit / `_ . + -` (so `taro@example.com` is not a mention).
 *   Trailing punctuation (`.` `,` `!` `?` `、` `。` ...) is not part of the token.
 *
 * Names are resolved against project members with the assignee matcher
 * (`matchAssigneeName`: exact → case-insensitive → ignoring spaces);
 * ambiguous or unknown names are dropped, never guessed.
 */
import { matchAssigneeName, type AssigneeCandidate } from "./assignees"

export const MENTION_NAME_MAX = 100

export type MentionSegment =
  | { type: "text"; text: string }
  | { type: "mention"; name: string; raw: string; bracket: boolean }

// 1: bracket name, 2: bare token. The lookbehind keeps e-mail addresses out.
const MENTION_RE = new RegExp(
  String.raw`(?<![\p{L}\p{N}_.+\-@])@(?:\[([^\]\r\n]{1,${MENTION_NAME_MAX}})\]|([^\s@\[\]()<>{}"'` + "`" + String.raw`、。，！？「」『』（）【】]{1,${MENTION_NAME_MAX}}))`,
  "gu",
)
const TRAILING_PUNCT_RE = /[.,!?;:、。，．！？；：)）」』】]+$/u

/**
 * Split a comment body into plain text and mention segments (in order).
 * Adjacent text is merged; the concatenation of `text` / `raw` equals the body.
 */
export function splitMentionSegments(body: string): MentionSegment[] {
  const segments: MentionSegment[] = []
  const pushText = (text: string) => {
    if (!text) return
    const last = segments[segments.length - 1]
    if (last?.type === "text") segments[segments.length - 1] = { type: "text", text: last.text + text }
    else segments.push({ type: "text", text })
  }
  let index = 0
  for (const match of body.matchAll(MENTION_RE)) {
    const start = match.index ?? 0
    pushText(body.slice(index, start))
    const bracketName = match[1]?.trim()
    if (bracketName) {
      segments.push({ type: "mention", name: bracketName, raw: match[0], bracket: true })
      index = start + match[0].length
      continue
    }
    const bare = (match[2] ?? "").replace(TRAILING_PUNCT_RE, "")
    if (!bare) {
      pushText(match[0])
      index = start + match[0].length
      continue
    }
    const raw = `@${bare}`
    segments.push({ type: "mention", name: bare, raw, bracket: false })
    index = start + raw.length
  }
  pushText(body.slice(index))
  return segments
}

/** Distinct mentioned names in order of appearance (case-sensitive, trimmed). */
export function extractMentionNames(body: string): string[] {
  const names: string[] = []
  for (const seg of splitMentionSegments(body)) {
    if (seg.type === "mention" && !names.includes(seg.name)) names.push(seg.name)
  }
  return names
}

/** Distinct user ids of the members mentioned in `body` (unknown / ambiguous names dropped). */
export function resolveMentionUserIds(body: string, members: readonly AssigneeCandidate[]): string[] {
  const ids: string[] = []
  for (const name of extractMentionNames(body)) {
    const match = matchAssigneeName(name, members)
    if (match.status === "matched" && !ids.includes(match.userId)) ids.push(match.userId)
  }
  return ids
}

/** The token the composer inserts for a member. `]` would end the token early, so it is dropped. */
export function mentionToken(name: string): string {
  return `@[${name.replace(/[\]\r\n]/g, "").trim().slice(0, MENTION_NAME_MAX)}]`
}

/** The name as it appears inside a token (`]` / line breaks dropped, trimmed, capped). */
export function mentionTokenName(name: string): string {
  return mentionToken(name).slice(2, -1)
}

/**
 * Composer display form of a stored body (A3-20): bracket tokens `@[Name]`
 * are shown as `@Name`, and the names are returned so that saving can turn
 * them back into tokens with `toStoredMentions`.
 */
export function toComposerText(body: string): { text: string; names: string[] } {
  const names: string[] = []
  const text = splitMentionSegments(body)
    .map((seg) => {
      if (seg.type !== "mention" || !seg.bracket) return seg.type === "mention" ? seg.raw : seg.text
      if (!names.includes(seg.name)) names.push(seg.name)
      return `@${seg.name}`
    })
    .join("")
  return { text, names }
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")

/**
 * Stored form of composer text: every `@Name` of a picked member becomes the
 * bracket token `@[Name]` (longest names first, so "Taro Yamada" wins over
 * "Taro"). A name must end at a non-letter, so "@Hanakosan" stays plain text.
 */
export function toStoredMentions(text: string, names: readonly string[]): string {
  const clean = [...new Set(names.map(mentionTokenName).filter(Boolean))].sort((a, b) => b.length - a.length)
  if (clean.length === 0) return text
  const re = new RegExp(String.raw`(?<![\p{L}\p{N}_.+\-@\[])@(${clean.map(escapeRe).join("|")})(?![\p{L}\p{N}_])`, "gu")
  return text.replace(re, (_m, name: string) => `@[${name}]`)
}

/** Plain-text rendering: `@[Name]` → `@Name`. */
export function mentionsToPlainText(body: string): string {
  return splitMentionSegments(body)
    .map((seg) => (seg.type === "mention" ? `@${seg.name}` : seg.text))
    .join("")
}

/**
 * Short one-line excerpt for notifications: mentions flattened, whitespace
 * collapsed, cut to `max` characters (with an ellipsis).
 */
export function commentExcerpt(body: string, max = 120): string {
  const flat = mentionsToPlainText(body).replace(/\s+/g, " ").trim()
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat
}

/**
 * The @-query being typed at `caret`: the text after the last `@` that starts
 * a token (start of text or after whitespace / an opening bracket), when it
 * contains no line break and is at most MENTION_NAME_MAX chars. Returns null
 * when the caret is not inside a mention query.
 */
export function activeMentionQuery(text: string, caret: number): { start: number; query: string } | null {
  const before = text.slice(0, caret)
  const at = before.lastIndexOf("@")
  if (at < 0) return null
  const prev = at > 0 ? before[at - 1] : ""
  if (prev && !/[\s(（「]/u.test(prev)) return null
  const query = before.slice(at + 1)
  if (query.startsWith("[")) return null
  if (/[\r\n]/.test(query) || query.length > MENTION_NAME_MAX) return null
  // A space ends a bare query unless it could still be a multi-word name (≤ 3 words).
  if (query.split(" ").length > 3) return null
  return { start: at, query }
}
