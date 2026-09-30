import { defaultDb } from "@/services/_shared/db"
import { rethrowPrisma } from "@/services/_shared/errors"
import * as repo from "./categories.repository"
import type { CreateAdminCategoryInput, SectionFilter, UpdateAdminCategoryInput } from "./categories.schemas"

const DUPLICATE = "duplicate_name_in_scope"

/** Admin-managed project categories (global or per section). */
export function listAdminCategories(filter: SectionFilter) {
  return repo.findAdminCategories(defaultDb, filter)
}

export async function createAdminCategory(input: CreateAdminCategoryInput) {
  try {
    return await repo.insertAdminCategory(defaultDb, {
      name: input.name,
      color: input.color ?? "gray",
      sortOrder: input.sortOrder ?? 0,
      sectionId: input.sectionId ?? null,
    })
  } catch (err) {
    rethrowPrisma(err, { conflict: DUPLICATE, conflictCode: "DUPLICATE_NAME" })
  }
}

export async function updateAdminCategory(id: string, input: UpdateAdminCategoryInput) {
  try {
    return await repo.updateAdminCategory(defaultDb, id, input)
  } catch (err) {
    rethrowPrisma(err, { conflict: DUPLICATE, conflictCode: "DUPLICATE_NAME", notFound: "not_found" })
  }
}

export async function deleteAdminCategory(id: string): Promise<void> {
  try {
    await repo.deleteAdminCategory(defaultDb, id)
  } catch (err) {
    rethrowPrisma(err, { notFound: "not_found" })
  }
}
