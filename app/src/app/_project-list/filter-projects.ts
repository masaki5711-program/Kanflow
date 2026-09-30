import type { Language } from "@/lib/i18n"
import { pickText } from "@/lib/translation/pick-text"
import type { Project, SortBy, TypeFilter } from "./types"

interface FilterOptions {
  query: string
  typeFilter: TypeFilter
  sortBy: SortBy
  language: Language
  isFav: (p: Project) => boolean
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
  const filtered = list.filter(
    (p) => (opts.typeFilter === "all" || p.projectType === opts.typeFilter) && (q.length === 0 || matchesQuery(p, q)),
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
    case "favorite":
      // Stable sort: ties keep server order.
      return [...filtered].sort((a, b) => Number(opts.isFav(b)) - Number(opts.isFav(a)))
    default:
      return filtered
  }
}
