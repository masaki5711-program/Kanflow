import { pickText } from "./pick-text"
import type { EntityI18n, TranslatableEntity } from "./types"

/**
 * Stored entity labels (activity entries, notifications) are snapshots of a
 * title as written — first line, maybe cut with "…", PBIs as "#12 title".
 * These pure helpers show such a label in the viewer's language when it
 * still matches the source text of one of the entity's translated fields.
 */

/** Activity / notification entity type → translatable entity. */
export const LABEL_ENTITY: Readonly<Record<string, TranslatableEntity>> = {
  pbi: "backlog_item",
  sprint_task: "sprint_task",
  sprint: "sprint",
  icebox: "icebox_item",
  goal: "product_goal",
  release: "release_item",
  plan_item: "plan_item",
  project: "project",
}

/** Fields whose text is used as the label, per activity / notification entity type. */
export const LABEL_FIELDS: Readonly<Record<string, readonly string[]>> = {
  pbi: ["initiative", "userStory"],
  sprint_task: ["taskName"],
  sprint: ["sprintName"],
  icebox: ["request"],
  goal: ["title"],
  release: ["userStory"],
  plan_item: ["name"],
  project: ["name"],
}

const ELLIPSIS = "…"

function firstLine(text: string | null | undefined): string | null {
  const line = text?.trim().split(/\r?\n/)[0]?.trim()
  return line ? line : null
}

function matches(label: string, source: string): boolean {
  if (label === source) return true
  return label.endsWith(ELLIPSIS) && label.length > 1 && source.startsWith(label.slice(0, -1))
}

function localizePlain(label: string, i18n: EntityI18n, fields: readonly string[], locale: string): string {
  for (const field of fields) {
    const entry = i18n[field]
    const source = entry ? firstLine(entry.source === "ja" ? entry.ja : entry.id) : null
    if (!source || !matches(label, source)) continue
    return firstLine(pickText(i18n, field, source, locale).text) ?? label
  }
  return label
}

/**
 * The label in `locale` (ja / id) when it is (a cut of) the first line of one
 * of `fields`' source text; otherwise the label unchanged (renamed since,
 * untranslated, or an "en" viewer). A "#12 " prefix is kept.
 */
export function localizeLabel(label: string, i18n: EntityI18n | null | undefined, fields: readonly string[], locale: string): string {
  if (!i18n || fields.length === 0) return label
  const numbered = /^(#\d+\s+)([\s\S]+)$/.exec(label)
  if (numbered) return numbered[1] + localizePlain(numbered[2], i18n, fields, locale)
  return localizePlain(label, i18n, fields, locale)
}
