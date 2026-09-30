import { defaultDb, withTransaction } from "@/services/_shared/db"
import { ConflictError, ForbiddenError, NotFoundError } from "@/services/_shared/errors"
import * as repo from "./user-categories.repository"
import type { CreateUserCategoryInput, UpdateUserCategoryInput } from "./user-categories.schemas"

const DUPLICATE = "同じ名前のカテゴリが既にあります"

/** A user's personal project categories (only ever the caller's own). */
export function listUserCategories(userId: string) {
  return repo.findUserCategories(defaultDb, userId)
}

export async function createUserCategory(userId: string, input: CreateUserCategoryInput) {
  return withTransaction(async (tx) => {
    if (await repo.findCategoryByName(tx, userId, input.name)) throw new ConflictError(DUPLICATE, {}, "DUPLICATE_NAME")
    const sortOrder = await repo.nextCategorySortOrder(tx, userId)
    return repo.insertUserCategory(tx, { userId, name: input.name, color: input.color, sortOrder })
  })
}

async function requireOwned(userId: string, categoryId: string) {
  const category = await repo.findOwnedCategory(defaultDb, userId, categoryId)
  if (!category) throw new NotFoundError()
  return category
}

export async function updateUserCategory(userId: string, categoryId: string, input: UpdateUserCategoryInput) {
  const existing = await requireOwned(userId, categoryId)
  if (input.name && input.name !== existing.name && (await repo.findCategoryByName(defaultDb, userId, input.name))) {
    throw new ConflictError(DUPLICATE, {}, "DUPLICATE_NAME")
  }
  return repo.updateUserCategory(defaultDb, categoryId, input)
}

export async function deleteUserCategory(userId: string, categoryId: string): Promise<void> {
  await requireOwned(userId, categoryId)
  await repo.deleteUserCategory(defaultDb, categoryId)
}

/** Only projects the user is an explicit member of can be categorized (403 otherwise). */
export async function assignProject(userId: string, categoryId: string, projectId: string) {
  await requireOwned(userId, categoryId)
  if (!(await repo.findMembership(defaultDb, projectId, userId))) throw new ForbiddenError("Forbidden")
  return repo.upsertAssignment(defaultDb, categoryId, projectId)
}

export async function unassignProject(userId: string, categoryId: string, projectId: string): Promise<void> {
  await requireOwned(userId, categoryId)
  await repo.deleteAssignments(defaultDb, categoryId, projectId)
}
