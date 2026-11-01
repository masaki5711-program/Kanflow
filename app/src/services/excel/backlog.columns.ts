/**
 * Backlog workbook columns, shared by the export and the import so an export
 * can be edited and imported back. Headers are localized (viewer language +
 * project-type wording, see ./backlog.headers); the import recognises a
 * header in ANY language and project type, or the raw field key.
 */
import { getTranslations, type Language, type Translations } from "@/lib/i18n"
import { getProjectTypeLabels, type ProjectType, type ProjectTypeLabels } from "@/lib/project-type-labels"
import { PBI_STATUSES, type PbiStatus } from "@/services/backlog/backlog.schemas"
import { BACKLOG_FIELDS, backlogHeader, statusLabel, type BacklogField } from "./backlog.headers"
import { EXCEL_LANGS } from "./excel.shared"

export * from "./backlog.headers"

const PROJECT_TYPES: readonly ProjectType[] = ["software", "process_improvement", "equipment", "general"]

/** NFKC + lower case + single spaces: "ユーザー ストーリー" / "User  Story" compare equal to their canonical forms. */
export function normalizeHeader(raw: string): string {
  return raw.normalize("NFKC").toLowerCase().replace(/\s+/g, " ").trim()
}

/** Label sets of every language; the given project type first (its wording wins on a clash). */
function labelSets(first: ProjectType): Array<{ t: Translations; pt: ProjectTypeLabels }> {
  const types = [first, ...PROJECT_TYPES.filter((x) => x !== first)]
  return types.flatMap((type) => EXCEL_LANGS.map((lang: Language) => ({ t: getTranslations(lang), pt: getProjectTypeLabels(type, lang) })))
}

/** Common spellings people type instead of the exported header. */
const HEADER_ALIASES: Partial<Record<BacklogField, readonly string[]>> = {
  displayId: ["pbi", "pbi id", "pbi no", "no", "no.", "番号", "#"],
  workloadScore: ["points", "point", "story points", "sp", "ポイント", "poin"],
  status: ["状態"],
}

const headerMaps = new Map<ProjectType, ReadonlyMap<string, BacklogField>>()

/**
 * Normalized header → field, for a project of `projectType`: that type's
 * labels in every language, then the field keys, then the other types' labels
 * (the same word can name different fields across types, e.g. "Initiative"
 * is the epic of a general project), then common aliases.
 */
export function backlogHeaderMap(projectType: ProjectType = "software"): ReadonlyMap<string, BacklogField> {
  const cached = headerMaps.get(projectType)
  if (cached) return cached
  const map = new Map<string, BacklogField>()
  const add = (label: string, field: BacklogField) => {
    const key = normalizeHeader(label)
    if (!map.has(key)) map.set(key, field)
  }
  const sets = labelSets(projectType)
  const own = sets.slice(0, EXCEL_LANGS.length)
  const others = sets.slice(EXCEL_LANGS.length)
  for (const { t, pt } of own) for (const field of BACKLOG_FIELDS) add(backlogHeader(field, t, pt), field)
  for (const field of BACKLOG_FIELDS) add(field, field)
  for (const { t, pt } of others) for (const field of BACKLOG_FIELDS) add(backlogHeader(field, t, pt), field)
  for (const [field, aliases] of Object.entries(HEADER_ALIASES)) {
    for (const alias of aliases ?? []) add(alias, field as BacklogField)
  }
  headerMaps.set(projectType, map)
  return map
}

let statusMap: ReadonlyMap<string, PbiStatus> | null = null

/** Normalized status text (key or label in any language) → status. */
export function backlogStatusMap(): ReadonlyMap<string, PbiStatus> {
  if (statusMap) return statusMap
  const map = new Map<string, PbiStatus>()
  for (const s of PBI_STATUSES) map.set(normalizeHeader(s), s)
  for (const lang of EXCEL_LANGS) {
    const t = getTranslations(lang)
    for (const s of PBI_STATUSES) map.set(normalizeHeader(statusLabel(s, t)), s)
  }
  statusMap = map
  return map
}
