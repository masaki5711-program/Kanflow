import { TRANSLATABLE_FIELDS, type TranslatableEntity } from "./types"

/** enqueue input: undefined = leave alone, null / empty = delete the row, string = source text */
export type FieldInputs = Record<string, string | null | undefined>

/**
 * Pure: the translatable subset of `record` as enqueue input.
 *
 * Keys that are absent OR present with value `undefined` mean "not changed"
 * and are left out, so a partial patch (status move, reorder, progress sync)
 * never touches translations. Only an explicit `null` / "" clears a field's
 * translation; a string (re)enqueues it (a no-op when the text is unchanged).
 */
export function pickTranslatableFields(entityType: TranslatableEntity, record: Record<string, unknown>): FieldInputs {
  const fields: FieldInputs = {}
  for (const field of Object.keys(TRANSLATABLE_FIELDS[entityType])) {
    const v = record[field]
    if (v === undefined) continue
    fields[field] = typeof v === "string" ? v : v == null ? null : String(v)
  }
  return fields
}
