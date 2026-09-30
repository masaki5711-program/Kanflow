import { defaultDb } from "@/services/_shared/db"
import { rethrowPrisma } from "@/services/_shared/errors"
import * as repo from "./sections.repository"
import type { CreateSectionInput, UpdateSectionInput } from "./sections.schemas"

/** Admin table (with user / project / category counts). */
export function listSections() {
  return repo.findSectionsWithCounts(defaultDb)
}

/** id + name for any signed-in user (pickers). */
export function listSectionOptions() {
  return repo.findSectionOptions(defaultDb)
}

export async function createSection(input: CreateSectionInput) {
  try {
    return await repo.insertSection(defaultDb, {
      name: input.name,
      description: input.description ?? null,
      sortOrder: input.sortOrder ?? 0,
    })
  } catch (err) {
    rethrowPrisma(err, { conflict: "duplicate_name", conflictCode: "DUPLICATE_NAME" })
  }
}

export async function updateSection(id: string, input: UpdateSectionInput) {
  try {
    return await repo.updateSection(defaultDb, id, input)
  } catch (err) {
    rethrowPrisma(err, { conflict: "duplicate_name", conflictCode: "DUPLICATE_NAME", notFound: "not_found" })
  }
}

/** Project / user / category links cascade in the DB. */
export async function deleteSection(id: string): Promise<void> {
  try {
    await repo.deleteSection(defaultDb, id)
  } catch (err) {
    rethrowPrisma(err, { notFound: "not_found" })
  }
}
