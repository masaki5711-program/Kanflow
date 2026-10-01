import type { Language } from "@/lib/i18n"
import { pickText } from "@/lib/translation/pick-text"
import { dormantDays, lastActivityTime } from "./dormancy"
import type { Project, SortBy, TypeFilter } from "./types"

interface FilterOptions {
  query: string
  typeFilter: TypeFilter
  sortBy: SortBy
  language: Language
  isFav: (p: Project) => boolean
  /** Keep only dormant projects (no activity for DORMANT_DAYS). */
  dormantOnly?: boolean
  /** Reference time for dormancy. Default: now. */
  now?: Date
}

/** Unknown last activity sorts as the oldest. */
function activityTime(p: Project): number {
  return lastActivityTime(p) ?? 0
}

function matchesQuery(p: Project, q: string): boolean {
  const hay = [
    p.name,
    p.description ?? "",
    p.i18n?.name?.ja ?? "",
    p.i18n?.name?.id ?? "",
    p.i18n?.description?.ja ?? "",
    p.i18n?.description?.id ?? "",
    ...p.members.map((m) => m.user.name),
  ]
    .join(" ")
    .toLowerCase()
  return hay.includes(q)
}

/** Apply search, type filter and sort. Returns a new array; "updated" keeps server order. */
export function filterAndSortProjects(list: Project[], opts: FilterOptions): Project[] {
  const q = opts.query.trim().toLowerCase()
  const now = opts.now ?? new Date()
  const filtered = list.filter(
    (p) =>
      (opts.typeFilter === "all" || p.projectType === opts.typeFilter) &&
      (q.length === 0 || matchesQuery(p, q)) &&
      (!opts.dormantOnly || dormantDays(p, now) !== null),
  )
  const locale = opts.language === "ja" ? "ja" : "en"
  const shownName = (p: Project) => pickText(p.i18n, "name", p.name, opts.language).text
  switch (opts.sortBy) {
    case "name":
      return [...filtered].sort((a, b) => shownName(a).localeCompare(shownName(b), locale))
    case "name_asc":
      // Legacy key: "name_asc" is the Z→A option (label projectSortNameDesc).
      return [...filtered].sort((a, b) => shownName(b).localeCompare(shownName(a), locale))
    case "progress":
      return [...filtered].sort((a, b) => (b.progressPct ?? 0) - (a.progressPct ?? 0))
    case "activity_desc":
      return [...filtered].sort((a, b) => activityTime(b) - activityTime(a))
    case "activity_asc":
      return [...filtered].sort((a, b) => activityTime(a) - activityTime(b))
    case "favorite":
      // Stable sort: ties keep server order.
      return [...filtered].sort((a, b) => Number(opts.isFav(b)) - Number(opts.isFav(a)))
    default:
      return filtered
  }
}
