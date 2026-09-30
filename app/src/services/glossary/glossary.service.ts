/**
 * Admin glossary use cases. Data access lives in the existing
 * lib/translation/glossary-service (shared with the translation worker and
 * the `用語<<訳語>>` markup path); this layer adds the HTTP-independent rules.
 */
import {
  listGlossary,
  removeGlossary,
  retranslateGlossary,
  updateGlossary,
  upsertGlossary,
} from "@/lib/translation/glossary-service"
import { NotFoundError, ValidationError } from "@/services/_shared/errors"
import type { CreateGlossaryInput, ListGlossaryInput, UpdateGlossaryInput } from "./glossary.schemas"

export async function listTerms(q: ListGlossaryInput) {
  const { rows, total } = await listGlossary(q)
  return { data: rows, total }
}

/** Add or overwrite one term; the reverse direction is auto-registered. */
export async function createTerm(input: CreateGlossaryInput, actorId: string) {
  if (input.sourceLocale === input.targetLocale) throw new ValidationError("source and target must differ", {}, "GLOSSARY_SAME_LOCALE")
  return upsertGlossary(input, actorId, true)
}

export async function updateTerm(id: string, input: UpdateGlossaryInput, actorId: string) {
  const entry = await updateGlossary(id, input, actorId)
  if (!entry) throw new NotFoundError()
  return entry
}

export async function deleteTerm(id: string): Promise<void> {
  if (!(await removeGlossary(id))) throw new NotFoundError()
}

/** Re-queue done translations containing the given (or all) terms. */
export function retranslate(ids: string[] | undefined) {
  return retranslateGlossary(ids)
}
