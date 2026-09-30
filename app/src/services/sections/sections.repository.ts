import type { Db } from "@/services/_shared/db"
import { LIST_LIMITS } from "@/services/_shared/limits"
import type { UpdateSectionInput } from "./sections.schemas"

const ORDER = [{ sortOrder: "asc" as const }, { name: "asc" as const }]

export function findSectionsWithCounts(db: Db) {
  return db.section.findMany({
    orderBy: ORDER,
    // Trashed projects are not counted (they are listed in the admin trash instead).
    include: { _count: { select: { users: true, projects: { where: { project: { deletedAt: null } } }, categories: true } } },
    take: LIST_LIMITS.sections,
  })
}

export function findSectionOptions(db: Db) {
  return db.section.findMany({ orderBy: ORDER, select: { id: true, name: true }, take: LIST_LIMITS.sections })
}

export function insertSection(db: Db, data: { name: string; description: string | null; sortOrder: number }) {
  return db.section.create({ data })
}

export function updateSection(db: Db, id: string, data: UpdateSectionInput) {
  return db.section.update({ where: { id }, data })
}

export function deleteSection(db: Db, id: string) {
  return db.section.delete({ where: { id } })
}
