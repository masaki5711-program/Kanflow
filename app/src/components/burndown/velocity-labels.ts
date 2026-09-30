/**
 * Pure: x-axis labels of the velocity chart. Sprint names are wrapped onto
 * two lines that fit the bar slot, and labels that would still read the same
 * (e.g. four "Sprint pe…") show the distinctive end of the name instead.
 * The full name is shown as the bar's tooltip.
 */

/** Double-width (CJK / fullwidth) characters take two units. */
const WIDE = /[ᄀ-ᅟ⺀-꓏가-힣豈-﫿︰-﹏＀-｠￠-￦]/
const ELLIPSIS = "…"
/** Average glyph advance of a narrow character, in em. */
const NARROW_EM = 0.55

const charUnits = (ch: string) => (WIDE.test(ch) ? 2 : 1)

export function textUnits(text: string): number {
  let units = 0
  for (const ch of text) units += charUnits(ch)
  return units
}

/** Narrow-character units that fit into `widthPx` at `fontPx` (at least 4). */
export function unitsForWidth(widthPx: number, fontPx: number): number {
  return Math.max(4, Math.floor(widthPx / (fontPx * NARROW_EM)))
}

/** Longest prefix of `text` within `max` units. */
function headWithin(text: string, max: number): string {
  let out = ""
  let units = 0
  for (const ch of text) {
    if (units + charUnits(ch) > max) break
    out += ch
    units += charUnits(ch)
  }
  return out
}

/** `text` cut to `max` units, ending with "…" when cut. */
export function clipText(text: string, max: number): string {
  if (textUnits(text) <= max) return text
  return `${headWithin(text, max - 1).trimEnd()}${ELLIPSIS}`
}

/** Words (space separated); words wider than a line are split into chunks. */
function tokens(text: string, max: number): string[] {
  return text.split(/\s+/).filter(Boolean).flatMap((word) => {
    const chunks: string[] = []
    let rest = word
    while (textUnits(rest) > max) {
      const head = headWithin(rest, max)
      chunks.push(head)
      rest = rest.slice(head.length)
    }
    return rest ? [...chunks, rest] : chunks
  })
}

/** Greedy wrap onto at most `maxLines` lines of `max` units; the last line ends with "…" when text is left. */
export function wrapLabel(text: string, max: number, maxLines = 2): string[] {
  const lines: string[] = []
  const words = tokens(text.trim(), max)
  let i = 0
  while (i < words.length && lines.length < maxLines) {
    let line = words[i++]
    while (i < words.length && textUnits(`${line} ${words[i]}`) <= max) line = `${line} ${words[i++]}`
    lines.push(line)
  }
  if (i < words.length && lines.length > 0) {
    const last = lines.length - 1
    lines[last] = clipText(`${lines[last]} ${words.slice(i).join(" ")}`, max)
  }
  return lines
}

/** The end of `text` within `max` units, whole trailing words when possible, led by "…". */
function tailLabel(text: string, max: number): string {
  const words = text.trim().split(/\s+/)
  let tail = ""
  for (let i = words.length - 1; i >= 0; i--) {
    const next = tail ? `${words[i]} ${tail}` : words[i]
    if (textUnits(next) > max - 1) break
    tail = next
  }
  if (!tail) {
    const chars = [...text.trim()]
    while (chars.length > 0 && textUnits(`${chars[chars.length - 1]}${tail}`) <= max - 1) tail = `${chars.pop()}${tail}`
  }
  return `${ELLIPSIS}${tail}`
}

const keyOf = (lines: readonly string[]) => lines.join("\n")

function duplicates(labels: readonly string[][]): Set<string> {
  const seen = new Map<string, number>()
  for (const l of labels) seen.set(keyOf(l), (seen.get(keyOf(l)) ?? 0) + 1)
  return new Set([...seen].filter(([, n]) => n > 1).map(([k]) => k))
}

/**
 * Axis labels (1–2 lines each) for `names`, each line within `max` units.
 * Colliding labels switch their second line to the end of the name; labels
 * that still collide (identical names) get their position appended.
 */
export function axisLabels(names: readonly string[], max: number): string[][] {
  const wrapped = names.map((n) => wrapLabel(n, max))
  const clash = duplicates(wrapped)
  const tailed = wrapped.map((lines, i) =>
    clash.has(keyOf(lines)) && textUnits(names[i]) > max ? [clipText(lines[0], max), tailLabel(names[i], max)] : lines,
  )
  const still = duplicates(tailed)
  return tailed.map((lines, i) => {
    if (!still.has(keyOf(lines))) return lines
    const suffix = ` (${i + 1})`
    const last = lines.length - 1
    return [...lines.slice(0, last), `${clipText(lines[last], max - suffix.length)}${suffix}`]
  })
}
