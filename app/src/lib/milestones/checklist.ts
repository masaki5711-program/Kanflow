/**
 * 完了条件 of a stage on the マイルストーン・検収ボード. The condition texts
 * live in the plan item's notes (the "完了条件:" bullet block written by plan
 * templates, see lib/plan-templates/tree.ts); the board stores only which of
 * them are ticked, keyed by the (trimmed, capped) text. Pure, client-safe.
 */
import { CHECKLIST_HEADING, checklistToNotes, notesToChecklist } from "@/lib/plan-templates/tree"

/** Ticks are keyed by the condition text, capped to the label column (VARCHAR 255). */
export const CHECKLIST_LABEL_MAX = 255

export function checklistKey(text: string): string {
  return text.trim().slice(0, CHECKLIST_LABEL_MAX)
}

/** The stage's conditions (deduplicated by key, notes order). */
export function stageConditions(notes: string | null | undefined): string[] {
  const seen = new Set<string>()
  return notesToChecklist(notes).filter((c) => {
    const key = checklistKey(c)
    if (!key || seen.has(key)) return false
    seen.add(key)
    return true
  })
}

/**
 * Notes with the 完了条件 block replaced by `items` (removed when empty);
 * the rest of the notes is kept as written. A missing block is appended.
 */
export function replaceConditionsInNotes(notes: string | null | undefined, items: readonly string[]): string | null {
  const lines = (notes ?? "").split(/\r?\n/)
  const start = lines.findIndex((l) => l.trim() === CHECKLIST_HEADING)
  const block = checklistToNotes(items)
  if (start < 0) {
    const base = (notes ?? "").trimEnd()
    if (!block) return base || null
    return base ? `${base}\n\n${block}` : block
  }
  let end = start + 1
  while (end < lines.length && /^\s*[-・*]\s*(.+)$/.test(lines[end])) end += 1
  const next = [...lines.slice(0, start), ...(block ? block.split("\n") : []), ...lines.slice(end)].join("\n").trim()
  return next || null
}
