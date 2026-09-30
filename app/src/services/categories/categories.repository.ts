import type { Db } from "@/services/_shared/db"
import { LIST_LIMITS } from "@/services/_shared/limits"
import type { SectionFilter, UpdateAdminCategoryInput } from "./categories.schemas"

function whereOf(filter: SectionFilter) {
  if (filter.kind === "all") return {}
  return { sectionId: filter.kind === "global" ? null : filter.sectionId }
}

export function findAdminCategories(db: Db, filter: SectionFilter) {
  return db.adminCategory.findMany({
    where: whereOf(filter),
    orderBy: [{ sectionId: "asc" }, { sortOrder: "asc" }, { name: "asc" }],
    include: {
      section: { select: { id: true, name: true } },
      _count: { select: { assignments: true } },
    },
    take: LIST_LIMITS.adminCategories,
  })
}

export function insertAdminCategory(
  db: Db,
  data: { name: string; color: string; sortOrder: number; sectionId: string | null }
) {
  return db.adminCategory.create({ data })
}

export function updateAdminCategory(db: Db, id: string, data: UpdateAdminCategoryInput) {
  return db.adminCategory.update({ where: { id }, data })
}

export function deleteAdminCategory(db: Db, id: string) {
  return db.adminCategory.delete({ where: { id } })
}
