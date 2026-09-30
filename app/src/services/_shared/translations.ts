/**
 * The translation seam every domain service uses (one mock point for tests).
 *
 * Write side (outbox style): services call `enqueueIn(tx, ...)` and
 * `purgeIn(tx, ...)` INSIDE the transaction that writes / deletes the entity,
 * so a rolled-back write never leaves a pending translation row behind and a
 * committed delete never leaves orphans for the worker to burn GPU on.
 */
import { applyGlossaryMarkup } from "@/lib/translation/glossary-service"
import {
  attachI18n,
  attachI18nOne,
  deleteTranslationsForMany,
  enqueueTranslations,
  getI18nFor,
} from "@/lib/translation/service"
import type { TranslatableEntity } from "@/lib/translation/types"
import type { Db } from "./db"

export { attachI18n, attachI18nOne, getI18nFor }
export type { TranslatableEntity }

/** Entity ids to purge, grouped by entity type (a delete and its cascades). */
export type TranslationTree = Partial<Record<TranslatableEntity, readonly string[]>>

/**
 * Strip `用語<<訳語>>` glossary markup from free-text input and register the
 * pairs. Runs before (outside) the entity transaction — glossary rows are
 * shared, independent data.
 */
export async function prepareText<T extends Record<string, unknown>>(data: T, actorId: string | null): Promise<T> {
  const { fields } = await applyGlossaryMarkup(data, actorId)
  return fields
}

/** Enqueue the translatable fields present in `record` within `tx`. Never throws. */
export function enqueueIn(
  tx: Db,
  entityType: TranslatableEntity,
  entityId: string,
  record: Record<string, unknown>
): Promise<void> {
  return enqueueTranslations(entityType, entityId, record, tx)
}

/** Delete every translation row of the given entities within `tx`. Throws (rolls the delete back). */
export async function purgeIn(tx: Db, tree: TranslationTree): Promise<number> {
  let total = 0
  for (const [entityType, ids] of Object.entries(tree) as Array<[TranslatableEntity, readonly string[]]>) {
    if (!ids || ids.length === 0) continue
    total += await deleteTranslationsForMany(entityType, ids, tx)
  }
  return total
}
