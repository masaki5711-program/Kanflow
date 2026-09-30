/**
 * Pure: labels of the plan's PBI link picker in the viewer's language (A4-04).
 * The API sends `i18n.title` (the translation of the field the title comes
 * from) and `planItem.i18n.name`. Legacy "ID line / JA line" text without a
 * translation row is reduced to the viewer's side as well.
 */
import { pickBilingualLines } from "@/components/ai-report-language"
import type { Language } from "@/lib/i18n"
import { pickText } from "@/lib/translation/pick-text"
import type { EntityI18n } from "@/lib/translation/types"

/** One line: the viewer's side of the text, remaining lines joined by " / ". */
function oneLine(text: string, language: Language): string {
  return pickBilingualLines(text, language)
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .join(" / ")
}

export function linkTitle(p: { title: string; i18n?: EntityI18n }, language: Language): string {
  return oneLine(pickText(p.i18n, "title", p.title, language).text, language)
}

export function linkPlanName(item: { name: string; i18n?: EntityI18n }, language: Language): string {
  return oneLine(pickText(item.i18n, "name", item.name, language).text, language)
}
