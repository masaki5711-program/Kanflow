import type { Db } from "@/services/_shared/db"
import { LIST_LIMITS } from "@/services/_shared/limits"
import type { UpdateUserCategoryInput } from "./user-categories.schemas"

const WITH_ASSIGNMENTS = { assignments: { select: { projectId: true } } } as const

export function findUserCategories(db: Db, userId: string) {
  return db.userProjectCategory.findMany({
    where: { userId },
    include: WITH_ASSIGNMENTS,
    orderBy: { sortOrder: "asc" },
    take: LIST_LIMITS.userCategories,
  })
}

export function findCategoryByName(db: Db, userId: string, name: string) {
  return db.userProjectCategory.findUnique({ where: { userId_name: { userId, name } }, select: { id: true } })
}

export function findOwnedCategory(db: Db, userId: string, categoryId: string) {
  return db.userProjectCategory.findFirst({ where: { id: categoryId, userId }, select: { id: true, name: true } })
}

export async function nextCategorySortOrder(db: Db, userId: string): Promise<number> {
  const agg = await db.userProjectCategory.aggregate({ where: { userId }, _max: { sortOrder: true } })
  return (agg._max.sortOrder ?? 0) + 1
}

export function insertUserCategory(db: Db, data: { userId: string; name: string; color: string; sortOrder: number }) {
  return db.userProjectCategory.create({ data, include: WITH_ASSIGNMENTS })
}

export function updateUserCategory(db: Db, categoryId: string, data: UpdateUserCategoryInput) {
  return db.userProjectCategory.update({ where: { id: categoryId }, data, include: WITH_ASSIGNMENTS })
}

export function deleteUserCategory(db: Db, categoryId: string) {
  return db.userProjectCategory.delete({ where: { id: categoryId } })
}

export function findMembership(db: Db, projectId: string, userId: string) {
  return db.projectMember.findFirst({ where: { projectId, userId }, select: { id: true } })
}

export function upsertAssignment(db: Db, categoryId: string, projectId: string) {
  return db.userProjectCategoryAssignment.upsert({
    where: { categoryId_projectId: { categoryId, projectId } },
    create: { categoryId, projectId },
    update: {},
  })
}

export function deleteAssignments(db: Db, categoryId: string, projectId: string) {
  return db.userProjectCategoryAssignment.deleteMany({ where: { categoryId, projectId } })
}
