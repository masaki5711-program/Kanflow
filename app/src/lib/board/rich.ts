import { BOARD_LIMITS } from "./limits"
import type { FontFamily, StrokeKey, TextRun, TextRuns } from "./model"

/**
 * Formatted text (part of a text in bold, larger, in another colour …) as runs: stretches of text with their own
 * marks. Pure; the editor overlay and the drawing both use these.
 */

/** The marks a run may carry (everything but its text). */
export type RunMarks = Omit<TextRun, "text">

export const MARK_KEYS = ["bold", "italic", "underline", "fontSize", "fontFamily", "color"] as const satisfies readonly (keyof RunMarks)[]

/** What a box gives a run that does not set a mark itself. */
export interface BaseMarks {
  bold: boolean
  italic: boolean
  underline: boolean
  fontSize: number
  fontFamily: FontFamily
  /** Palette key, or "fg" (the theme's foreground). */
  color: StrokeKey | "fg"
}

/** A run's marks resolved against the box. */
export function effectiveMarks(run: RunMarks, base: BaseMarks): BaseMarks {
  return {
    bold: run.bold ?? base.bold,
    italic: run.italic ?? base.italic,
    underline: run.underline ?? base.underline,
    fontSize: run.fontSize ?? base.fontSize,
    fontFamily: run.fontFamily ?? base.fontFamily,
    color: run.color ?? base.color,
  }
}

function marksOf(run: TextRun): RunMarks {
  const marks: RunMarks = {}
  for (const key of MARK_KEYS) if (run[key] !== undefined) (marks as Record<string, unknown>)[key] = run[key]
  return marks
}

function sameMarks(a: RunMarks, b: RunMarks): boolean {
  return MARK_KEYS.every((key) => a[key] === b[key])
}

/** The runs to draw for a text: its runs when they add up to it, otherwise null (draw it plain). */
export function runsFor(text: string, runs: TextRuns | null | undefined): TextRuns | null {
  if (!runs || runs.length === 0) return null
  let joined = ""
  for (const run of runs) joined += run.text
  return joined === text ? runs : null
}

/**
 * Runs in their stored form: empty runs dropped, neighbours with the same marks joined. Null when nothing is
 * formatted (the plain text says it all) or when there would be more runs than the server accepts.
 */
export function normalizeRuns(runs: readonly TextRun[]): TextRuns | null {
  const out: TextRun[] = []
  for (const run of runs) {
    if (run.text === "") continue
    const last = out[out.length - 1]
    if (last && sameMarks(marksOf(last), marksOf(run))) out[out.length - 1] = { ...last, text: last.text + run.text }
    else out.push({ ...marksOf(run), text: run.text })
  }
  if (out.every((run) => Object.keys(marksOf(run)).length === 0)) return null
  if (out.length > BOARD_LIMITS.runsPerText) return null
  return out
}

/** Plain text of runs. */
export function runsText(runs: readonly TextRun[]): string {
  return runs.map((run) => run.text).join("")
}

/** Runs split so that `at` (a character offset) falls on a boundary. */
function splitAt(runs: readonly TextRun[], at: number): TextRun[] {
  const out: TextRun[] = []
  let pos = 0
  for (const run of runs) {
    const end = pos + run.text.length
    if (at > pos && at < end) {
      out.push({ ...run, text: run.text.slice(0, at - pos) }, { ...run, text: run.text.slice(at - pos) })
    } else out.push(run)
    pos = end
  }
  return out
}

/**
 * Sets marks on the characters [start, end). A mark given as `undefined` is removed from the stretch (it takes the
 * box's setting again). The result is normalized (possibly null: nothing formatted any more).
 */
export function applyMarks(runs: readonly TextRun[], start: number, end: number, marks: Partial<RunMarks>): TextRuns | null {
  if (end <= start) return normalizeRuns(runs)
  const parts = splitAt(splitAt(runs, start), end)
  let pos = 0
  const out = parts.map((run) => {
    const from = pos
    pos += run.text.length
    if (from < start || from >= end) return run
    const next: Record<string, unknown> = { ...run }
    for (const [key, value] of Object.entries(marks)) {
      if (value === undefined) delete next[key]
      else next[key] = value
    }
    return next as unknown as TextRun
  })
  return normalizeRuns(out)
}

/** The runs covering [start, end) (empty when the range is empty). */
export function runsIn(runs: readonly TextRun[], start: number, end: number): TextRun[] {
  if (end <= start) return []
  let pos = 0
  return splitAt(splitAt(runs, start), end).filter((run) => {
    const from = pos
    pos += run.text.length
    return from >= start && from < end && run.text !== ""
  })
}

/** True when every character of [start, end) shows the mark (resolved against the box). */
export function rangeHas(runs: readonly TextRun[], start: number, end: number, base: BaseMarks, mark: "bold" | "italic" | "underline"): boolean {
  const covered = runsIn(runs, start, end)
  return covered.length > 0 && covered.every((run) => effectiveMarks(run, base)[mark])
}

/** The text size shared by all of [start, end), or null when it varies. */
export function rangeFontSize(runs: readonly TextRun[], start: number, end: number, base: BaseMarks): number | null {
  const sizes = new Set(runsIn(runs, start, end).map((run) => effectiveMarks(run, base).fontSize))
  return sizes.size === 1 ? [...sizes][0] : null
}

/** One plain run for a text without runs (what the editor starts from). */
export function plainRuns(text: string): TextRun[] {
  return text === "" ? [] : [{ text }]
}

/**
 * Runs cut to `max` characters (the server's limit of the text they format), kept in step with the plain text
 * cut the same way.
 */
export function truncateRuns(runs: readonly TextRun[], max: number): TextRun[] {
  const out: TextRun[] = []
  let left = max
  for (const run of runs) {
    if (left <= 0) break
    const text = run.text.slice(0, left)
    out.push({ ...run, text })
    left -= text.length
  }
  return out
}
