/**
 * Splits an indexed repository file into searchable passages (pure).
 *
 * - Markdown: one chunk per section, with the heading path
 *   ("06 OEE/OLE 計算 > 2.3 定義") and GitLab's heading anchor for citations.
 *   Headings inside fenced code blocks are ignored; long sections are split
 *   into windows that keep the section's heading.
 * - Everything else (text, code, CSV, Office / PDF text): ~2,000-character
 *   windows with overlap, cut at a line / sentence end (CJK aware). Text and
 *   code chunks carry a GitLab line anchor ("L120").
 */

export interface Chunk {
  heading: string | null
  anchor: string | null
  content: string
}

/** Target window size and overlap (characters). */
export const CHUNK_SIZE = 2000
export const CHUNK_OVERLAP = 200
/** Hard cap per file (≈ 600k characters); the rest of a huge file is not indexed. */
export const MAX_CHUNKS_PER_FILE = 300
/** repo_chunk.heading / anchor column widths. */
const HEADING_MAX = 500
const ANCHOR_MAX = 255

const MARKDOWN_EXT = /\.(md|markdown|mdx)$/i
const FENCE = /^\s{0,3}(```|~~~)/
const ATX_HEADING = /^\s{0,3}(#{1,6})\s+(.+?)\s*#*\s*$/

export function isMarkdownPath(path: string): boolean {
  return MARKDOWN_EXT.test(path)
}

/**
 * GitLab's heading anchor (Banzai TableOfContentsFilter): lower-case, drop
 * everything but letters / digits / "_" / "-" / space, spaces → "-", squeeze
 * "-"; repeated headings get "-1", "-2" … in document order.
 */
export function gitlabSlug(heading: string, seen: Map<string, number>): string {
  const base = heading
    .toLowerCase()
    .replace(/[^\p{L}\p{M}\p{N}_\- ]/gu, "")
    .replace(/ /g, "-")
    .replace(/-+/g, "-")
  const count = seen.get(base) ?? 0
  seen.set(base, count + 1)
  return count === 0 ? base : `${base}-${count}`
}

/** Plain heading text: inline markdown (links, emphasis, code ticks) removed. */
function headingText(raw: string): string {
  return raw
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/[*`~]/g, "")
    // _emphasis_ markers go, underscores inside words (4_Pemetaan_PFS) stay — as GitLab renders them.
    .replace(/(^|\s)_+|_+(?=\s|$)/g, "$1")
    .trim()
}

/** Index of the best cut at or before `end`: paragraph, line, then sentence end. */
function cutPoint(text: string, start: number, end: number): number {
  if (end >= text.length) return text.length
  const minCut = start + Math.floor((end - start) / 2)
  for (const sep of ["\n\n", "\n", "。", ". ", "．", "！", "？", "; ", "、", " "]) {
    const at = text.lastIndexOf(sep, end - 1)
    if (at >= minCut) return at + sep.length
  }
  return end
}

/** Windows of ~size characters with `overlap` characters repeated between neighbours. */
export function splitWindows(text: string, size = CHUNK_SIZE, overlap = CHUNK_OVERLAP): Array<{ start: number; text: string }> {
  const out: Array<{ start: number; text: string }> = []
  let start = 0
  while (start < text.length && out.length < MAX_CHUNKS_PER_FILE) {
    const end = cutPoint(text, start, start + size)
    const piece = text.slice(start, end).trim()
    if (piece) out.push({ start, text: piece })
    if (end >= text.length) break
    start = Math.max(end - overlap, start + 1)
  }
  return out
}

interface Section {
  path: string[]
  anchor: string | null
  body: string
}

/** Markdown → sections; text before the first heading is a section without heading. */
function markdownSections(text: string): Section[] {
  const sections: Section[] = []
  const stack: Array<{ level: number; title: string }> = []
  const seen = new Map<string, number>()
  let current: Section = { path: [], anchor: null, body: "" }
  let inFence = false
  for (const line of text.split("\n")) {
    if (FENCE.test(line)) inFence = !inFence
    const m = inFence ? null : ATX_HEADING.exec(line)
    if (!m) {
      current = { ...current, body: `${current.body}${line}\n` }
      continue
    }
    sections.push(current)
    const level = m[1].length
    const title = headingText(m[2])
    while (stack.length > 0 && stack[stack.length - 1].level >= level) stack.pop()
    stack.push({ level, title })
    current = { path: stack.map((s) => s.title), anchor: gitlabSlug(title, seen), body: `${line}\n` }
  }
  sections.push(current)
  // A heading directly followed by a sub-heading has no text of its own (its title lives on in the children's path).
  return sections.filter((s) => (s.anchor ? s.body.slice(s.body.indexOf("\n") + 1) : s.body).trim() !== "")
}

function chunkMarkdown(text: string): Chunk[] {
  const out: Chunk[] = []
  for (const section of markdownSections(text)) {
    const heading = section.path.length > 0 ? section.path.join(" > ").slice(0, HEADING_MAX) : null
    const anchor = section.anchor ? section.anchor.slice(0, ANCHOR_MAX) : null
    for (const w of splitWindows(section.body.trim())) {
      if (out.length >= MAX_CHUNKS_PER_FILE) return out
      // A continuation window repeats the heading line so search hits keep their context.
      const content = w.start > 0 && heading ? `${section.path[section.path.length - 1]}（続き）\n${w.text}` : w.text
      out.push({ heading, anchor, content })
    }
  }
  return out
}

function chunkPlain(text: string, withLines: boolean): Chunk[] {
  // Line numbers are counted incrementally (windows come in order), not from the start each time.
  let line = 1
  let counted = 0
  return splitWindows(text).map((w) => {
    for (; counted < w.start; counted++) if (text.charCodeAt(counted) === 10) line++
    return { heading: null, anchor: withLines ? `L${line}` : null, content: w.text }
  })
}

/** Chunks of one file. `lineAnchors` = the text is the file itself (not extracted Office / PDF text). */
export function chunkFile(path: string, text: string, lineAnchors = true): Chunk[] {
  const normalized = text.replace(/\r\n?/g, "\n").replace(/^\uFEFF/, "")
  if (!normalized.trim()) return []
  return lineAnchors && isMarkdownPath(path) ? chunkMarkdown(normalized) : chunkPlain(normalized, lineAnchors)
}
