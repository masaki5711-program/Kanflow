import { Prisma } from "@/generated/prisma/client"
import { prisma } from "@/lib/prisma"
import { aiLog } from "@/lib/ai-monitor"
import { detectLocale, sourceHash, splitLegacyPairs } from "./detect-locale"
import {
  ENTITY_TABLES,
  TRANSLATABLE_FIELDS,
  translationPriority,
  type EntityI18n,
  type FieldTranslation,
  type TranslatableEntity,
  type TranslationLocale,
  type TranslationStatus,
} from "./types"

/**
 * Both-language storage for user-entered text.
 *
 * - enqueue*: called by the write side after the entity is saved. Fills the
 *   source-locale column and marks the row pending for the worker. Awaiting
 *   it only waits for one cheap upsert, never for the translation itself.
 * - attachI18n / getI18nFor: read side — one query per entity type, so lists
 *   never pay N+1.
 * - backfill: picks up rows that exist without a translation row (start-up
 *   and periodic). Legacy "ID line / JA line" pairs are split into both
 *   columns and stored as done instead of being sent to the model.
 */

/** enqueue input: undefined = leave alone, null / empty = delete the row, string = source text */
export type FieldInputs = Record<string, string | null | undefined>

/**
 * Any Prisma client the write side may run on: the global client or the `tx`
 * of an interactive `prisma.$transaction`. Passing `tx` makes the enqueue /
 * cleanup part of the caller's transaction (outbox style): the translation
 * row commits or rolls back together with the entity write.
 */
export type TranslationDb = Prisma.TransactionClient

type Row = Prisma.FieldTranslationGetPayload<Record<string, never>>

const LEGACY_MODEL = "legacy-pairs"

/** Upper bound of ids per `IN (...)` when deleting rows of many entities. */
const DELETE_CHUNK = 1000

/** The translatable subset of `record` as enqueue input (absent keys stay absent). */
export function pickTranslatableFields(entityType: TranslatableEntity, record: Record<string, unknown>): FieldInputs {
  const fields: FieldInputs = {}
  for (const field of Object.keys(TRANSLATABLE_FIELDS[entityType])) {
    if (!(field in record)) continue
    const v = record[field]
    fields[field] = typeof v === "string" ? v : v == null ? null : String(v)
  }
  return fields
}

/**
 * Pick the translatable fields out of an entity record and enqueue them.
 * Never throws. Pass `db` (a transaction client) to enqueue atomically with
 * the entity write; a failed statement does not abort a MySQL transaction.
 */
export async function enqueueTranslations(
  entityType: TranslatableEntity,
  entityId: string,
  record: Record<string, unknown>,
  db: TranslationDb = prisma
): Promise<void> {
  const fields = pickTranslatableFields(entityType, record)
  try {
    await enqueueNow(entityType, entityId, fields, db)
  } catch (err) {
    aiLog("XLATE_ENQUEUE", `failed ${entityType}/${entityId}: ${err instanceof Error ? err.message : String(err)}`)
  }
}

export async function enqueueNow(
  entityType: TranslatableEntity,
  entityId: string,
  fields: FieldInputs,
  db: TranslationDb = prisma
): Promise<void> {
  const allowed = TRANSLATABLE_FIELDS[entityType]
  for (const [field, raw] of Object.entries(fields)) {
    if (raw === undefined) continue
    if (!(field in allowed)) continue
    const text = raw?.trim() ?? ""
    if (!text) {
      await db.fieldTranslation.deleteMany({ where: { entityType, entityId, field } })
      continue
    }
    const hash = sourceHash(text)
    const priority = translationPriority(entityType, field)
    const legacy = splitLegacyPairs(text)
    const source: TranslationLocale = legacy ? "ja" : detectLocale(text)
    const textJa = legacy ? legacy.ja : source === "ja" ? text : null
    const textId = legacy ? legacy.id : source === "id" ? text : null
    const status: TranslationStatus = legacy ? "done" : "pending"
    const model = legacy ? LEGACY_MODEL : null
    const translatedAt = legacy ? new Date() : null
    // Same hash → leave the row alone (only refresh priority). Different hash
    // → reset to pending with the new source text and clear the other side.
    // `source_hash` is assigned last: MySQL evaluates the SET list in order.
    await db.$executeRaw`
      INSERT INTO field_translation
        (entity_type, entity_id, field, source_locale, source_hash, text_ja, text_id,
         status, priority, attempts, last_error, model, requested_at, started_at, translated_at, updated_at)
      VALUES
        (${entityType}, ${entityId}, ${field}, ${source}, ${hash}, ${textJa}, ${textId},
         ${status}, ${priority}, 0, NULL, ${model}, UTC_TIMESTAMP(3), NULL, ${translatedAt}, UTC_TIMESTAMP(3))
      AS new
      ON DUPLICATE KEY UPDATE
        text_ja       = IF(field_translation.source_hash = new.source_hash, field_translation.text_ja, new.text_ja),
        text_id       = IF(field_translation.source_hash = new.source_hash, field_translation.text_id, new.text_id),
        status        = IF(field_translation.source_hash = new.source_hash, field_translation.status, new.status),
        attempts      = IF(field_translation.source_hash = new.source_hash, field_translation.attempts, 0),
        last_error    = IF(field_translation.source_hash = new.source_hash, field_translation.last_error, NULL),
        model         = IF(field_translation.source_hash = new.source_hash, field_translation.model, new.model),
        requested_at  = IF(field_translation.source_hash = new.source_hash, field_translation.requested_at, UTC_TIMESTAMP(3)),
        started_at    = IF(field_translation.source_hash = new.source_hash, field_translation.started_at, NULL),
        translated_at = IF(field_translation.source_hash = new.source_hash, field_translation.translated_at, new.translated_at),
        source_locale = IF(field_translation.source_hash = new.source_hash, field_translation.source_locale, new.source_locale),
        priority      = new.priority,
        updated_at    = UTC_TIMESTAMP(3),
        source_hash   = new.source_hash
    `
  }
}

/** Drop every translation row of an entity (call from DELETE handlers). Never throws. */
export async function deleteTranslationsFor(
  entityType: TranslatableEntity,
  entityId: string,
  db: TranslationDb = prisma
): Promise<void> {
  try {
    await db.fieldTranslation.deleteMany({ where: { entityType, entityId } })
  } catch {
    // best effort — leftovers are removed by purgeOrphanTranslations()
  }
}

/**
 * Drop the translation rows of many entities of one type. Unlike
 * deleteTranslationsFor this THROWS, so a caller running it inside the entity
 * delete transaction rolls back instead of leaving orphans behind (pending
 * orphans keep the worker busy on text nobody can see).
 */
export async function deleteTranslationsForMany(
  entityType: TranslatableEntity,
  entityIds: readonly string[],
  db: TranslationDb = prisma
): Promise<number> {
  const unique = Array.from(new Set(entityIds.filter(Boolean)))
  let deleted = 0
  for (let i = 0; i < unique.length; i += DELETE_CHUNK) {
    const chunk = unique.slice(i, i + DELETE_CHUNK)
    const r = await db.fieldTranslation.deleteMany({ where: { entityType, entityId: { in: chunk } } })
    deleted += r.count
  }
  return deleted
}

// === read side ===

export async function getI18nFor(entityType: TranslatableEntity, ids: string[]): Promise<Map<string, EntityI18n>> {
  const out = new Map<string, EntityI18n>()
  const unique = Array.from(new Set(ids.filter(Boolean)))
  if (unique.length === 0) return out
  const rows = await prisma.fieldTranslation.findMany({
    where: { entityType, entityId: { in: unique } },
    select: { entityId: true, field: true, textJa: true, textId: true, sourceLocale: true, status: true },
  })
  for (const r of rows) {
    const entry = out.get(r.entityId) ?? {}
    entry[r.field] = toFieldTranslation(r)
    out.set(r.entityId, entry)
  }
  return out
}

/** Add `i18n` to every element (`{}` when the entity has no translation row). */
export async function attachI18n<T extends Record<string, unknown>>(
  entityType: TranslatableEntity,
  rows: T[],
  idKey: keyof T = "id" as keyof T
): Promise<Array<T & { i18n: EntityI18n }>> {
  const map = await getI18nFor(entityType, rows.map((r) => String(r[idKey])))
  return rows.map((r) => ({ ...r, i18n: map.get(String(r[idKey])) ?? {} }))
}

export async function attachI18nOne<T extends Record<string, unknown>>(
  entityType: TranslatableEntity,
  row: T,
  idKey: keyof T = "id" as keyof T
): Promise<T & { i18n: EntityI18n }> {
  const [out] = await attachI18n(entityType, [row], idKey)
  return out
}

function toFieldTranslation(r: Pick<Row, "textJa" | "textId" | "sourceLocale" | "status">): FieldTranslation {
  return {
    ja: r.textJa,
    id: r.textId,
    source: r.sourceLocale as TranslationLocale,
    status: r.status as TranslationStatus,
  }
}

// === admin ===

export interface StatusCounts {
  pending: number
  running: number
  done: number
  failed: number
  lastError: { entityType: string; entityId: string; field: string; error: string; at: string } | null
}

export async function translationCounts(): Promise<StatusCounts> {
  const groups = await prisma.fieldTranslation.groupBy({ by: ["status"], _count: { _all: true } })
  const by: Record<string, number> = {}
  for (const g of groups) by[g.status] = g._count._all
  const last = await prisma.fieldTranslation.findFirst({
    where: { lastError: { not: null } },
    orderBy: { updatedAt: "desc" },
    select: { entityType: true, entityId: true, field: true, lastError: true, updatedAt: true },
  })
  return {
    pending: by.pending ?? 0,
    running: by.running ?? 0,
    done: by.done ?? 0,
    failed: by.failed ?? 0,
    lastError: last
      ? {
          entityType: last.entityType,
          entityId: last.entityId,
          field: last.field,
          error: last.lastError ?? "",
          at: last.updatedAt.toISOString(),
        }
      : null,
  }
}

export async function retryFailedTranslations(): Promise<{ requeued: number }> {
  const r = await prisma.fieldTranslation.updateMany({
    where: { status: "failed" },
    data: { status: "pending", attempts: 0, lastError: null, requestedAt: new Date() },
  })
  return { requeued: r.count }
}

// === maintenance ===

/** Rows deleted per statement by purgeOrphanTranslations (keeps lock time short). */
const PURGE_BATCH = 5000

export interface OrphanPurgeResult {
  dryRun: boolean
  /** Orphan rows per entity type (deleted, or found when dryRun). */
  byEntity: Partial<Record<TranslatableEntity, number>>
  total: number
}

/**
 * Maintenance: remove FieldTranslation rows whose entity row no longer
 * exists (left behind by deletes that predate transactional cleanup, or by
 * DB-level cascades). Only known entity types are touched; `dryRun` counts
 * without deleting. Idempotent.
 */
export async function purgeOrphanTranslations(opts: { dryRun?: boolean } = {}): Promise<OrphanPurgeResult> {
  const dryRun = opts.dryRun ?? false
  const byEntity: Partial<Record<TranslatableEntity, number>> = {}
  let total = 0
  for (const entity of Object.keys(ENTITY_TABLES) as TranslatableEntity[]) {
    const n = dryRun ? await countOrphans(entity) : await deleteOrphans(entity)
    if (n > 0) byEntity[entity] = n
    total += n
  }
  aiLog("XLATE_PURGE", `${dryRun ? "found" : "deleted"} ${total} orphan translation row(s)`)
  return { dryRun, byEntity, total }
}

function orphanCondition(entity: TranslatableEntity): Prisma.Sql {
  const table = Prisma.raw(`\`${ENTITY_TABLES[entity]}\``)
  return Prisma.sql`entity_type = ${entity}
    AND NOT EXISTS (SELECT 1 FROM ${table} t WHERE t.\`id\` = field_translation.entity_id)`
}

async function countOrphans(entity: TranslatableEntity): Promise<number> {
  const rows = await prisma.$queryRaw<Array<{ n: bigint | number }>>`
    SELECT COUNT(*) AS n FROM field_translation WHERE ${orphanCondition(entity)}
  `
  return Number(rows[0]?.n ?? 0)
}

async function deleteOrphans(entity: TranslatableEntity): Promise<number> {
  let deleted = 0
  for (;;) {
    const n = await prisma.$executeRaw`
      DELETE FROM field_translation WHERE ${orphanCondition(entity)} LIMIT ${PURGE_BATCH}
    `
    deleted += n
    if (n < PURGE_BATCH) return deleted
  }
}

// === backfill ===

/**
 * Enqueue one backfill field only if the entity still exists. The entity row
 * is share-locked in the same transaction as the insert, so a concurrent
 * delete either commits first (→ nothing is created) or waits and then purges
 * the freshly inserted row. The text is re-read under the lock.
 */
async function enqueueIfEntityAlive(
  table: string,
  entity: TranslatableEntity,
  field: string,
  id: string
): Promise<boolean> {
  const col = Prisma.raw(`\`${field}\``)
  return prisma.$transaction(async (tx) => {
    const alive = await tx.$queryRaw<Array<{ txt: string | null }>>`
      SELECT ${col} AS txt FROM ${Prisma.raw(`\`${table}\``)} WHERE \`id\` = ${id} FOR SHARE
    `
    const txt = alive[0]?.txt
    if (!txt || !txt.trim()) return false
    await enqueueNow(entity, id, { [field]: txt }, tx)
    return true
  })
}

/**
 * Enqueue up to `limit` (entity, field) pairs whose source column is non-empty
 * but have no translation row yet. One query per field, ordered by id.
 */
export async function backfillTranslations(limit = 200): Promise<number> {
  let remaining = limit
  let enqueued = 0
  for (const entity of Object.keys(TRANSLATABLE_FIELDS) as TranslatableEntity[]) {
    if (remaining <= 0) break
    const table = ENTITY_TABLES[entity]
    for (const field of Object.keys(TRANSLATABLE_FIELDS[entity])) {
      if (remaining <= 0) break
      const col = Prisma.raw(`t.\`${field}\``)
      const rows = await prisma.$queryRaw<Array<{ id: string; txt: string }>>`
        SELECT t.\`id\` AS id, ${col} AS txt
        FROM ${Prisma.raw(`\`${table}\``)} t
        WHERE ${col} IS NOT NULL AND TRIM(${col}) <> ''
          AND NOT EXISTS (
            SELECT 1 FROM field_translation ft
            WHERE ft.entity_type = ${entity} AND ft.entity_id = t.\`id\` AND ft.field = ${field}
          )
        ORDER BY t.\`id\`
        LIMIT ${remaining}
      `
      for (const r of rows) {
        if (await enqueueIfEntityAlive(table, entity, field, r.id)) enqueued += 1
        remaining -= 1
      }
    }
  }
  if (enqueued > 0) aiLog("XLATE_BACKFILL", `enqueued ${enqueued} field(s)`)
  return enqueued
}
