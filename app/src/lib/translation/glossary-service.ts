import { prisma } from "@/lib/prisma"
import { aiLog } from "@/lib/ai-monitor"
import { detectLocale, oppositeLocale } from "./detect-locale"
import { extractGlossaryMarkers, hasGlossaryMarkup, matchGlossary, normalizeTerm } from "./glossary-markup"
import type { GlossaryEntry, GlossaryTerm, TranslationLocale } from "./types"

/**
 * Shared translation glossary.
 *
 * - applyGlossaryMarkup: strip `用語<<訳語>>` from a write payload right before
 *   saving and upsert the pair (both directions).
 * - findGlossaryForText: terms contained in a source text, longest first (≤50).
 * - Any glossary change resets the done rows that contain the term to
 *   pending so they are re-translated on the next idle tick.
 */

export interface ApplyResult<T extends Record<string, unknown>> {
  fields: T
  registered: GlossaryTerm[]
}

/**
 * Remove markup from every string field and register the pairs. Registration
 * failures never block the write (the markup is still removed).
 */
export async function applyGlossaryMarkup<T extends Record<string, unknown>>(
  fields: T,
  actorId: string | null
): Promise<ApplyResult<T>> {
  const out: Record<string, unknown> = { ...fields }
  const registered: GlossaryTerm[] = []
  for (const [key, value] of Object.entries(fields)) {
    if (typeof value !== "string" || !hasGlossaryMarkup(value)) continue
    const { cleaned, entries } = extractGlossaryMarkers(value)
    out[key] = cleaned
    if (entries.length === 0) continue
    const source = detectLocale(cleaned)
    for (const e of entries) {
      try {
        await upsertGlossary({ sourceLocale: source, targetLocale: oppositeLocale(source), ...e }, actorId, true)
        registered.push(e)
      } catch (err) {
        aiLog("GLOSSARY", `upsert failed for "${e.term}": ${err instanceof Error ? err.message : String(err)}`)
      }
    }
  }
  return { fields: out as T, registered }
}

export interface GlossaryUpsertInput {
  sourceLocale: TranslationLocale
  targetLocale: TranslationLocale
  term: string
  translation: string
  note?: string | null
}

/**
 * Same (source, target, term_norm) → overwrite the translation. The reverse
 * direction is auto-registered unless a hand-edited reverse row exists.
 */
export async function upsertGlossary(
  input: GlossaryUpsertInput,
  actorId: string | null,
  withReverse = true
): Promise<GlossaryEntry> {
  const term = input.term.trim()
  const translation = input.translation.trim()
  if (!term || !translation) throw new Error("term and translation are required")
  const key = { sourceLocale: input.sourceLocale, targetLocale: input.targetLocale, termNorm: normalizeTerm(term) }
  const row = await prisma.glossary.upsert({
    where: { sourceLocale_targetLocale_termNorm: key },
    create: {
      ...key,
      term,
      translation,
      note: input.note ?? null,
      autoReverse: false,
      createdBy: actorId,
      updatedBy: actorId,
    },
    update: {
      term,
      translation,
      ...(input.note === undefined ? {} : { note: input.note }),
      autoReverse: false,
      updatedBy: actorId,
    },
  })
  if (withReverse) {
    const reverseKey = {
      sourceLocale: input.targetLocale,
      targetLocale: input.sourceLocale,
      termNorm: normalizeTerm(translation),
    }
    const existing = await prisma.glossary.findUnique({
      where: { sourceLocale_targetLocale_termNorm: reverseKey },
      select: { autoReverse: true },
    })
    if (!existing || existing.autoReverse) {
      await prisma.glossary.upsert({
        where: { sourceLocale_targetLocale_termNorm: reverseKey },
        create: { ...reverseKey, term: translation, translation: term, autoReverse: true, createdBy: actorId, updatedBy: actorId },
        update: { translation: term, updatedBy: actorId },
      })
    }
  }
  void invalidateTerm(input.sourceLocale, term).catch(() => undefined)
  return toEntry(row)
}

// === at translation time ===

export async function findGlossaryForText(
  text: string,
  source: TranslationLocale,
  target: TranslationLocale,
  limit = 50
): Promise<Array<GlossaryTerm & { id: string }>> {
  const rows = await prisma.glossary.findMany({
    where: { sourceLocale: source, targetLocale: target },
    select: { id: true, term: true, termNorm: true, translation: true },
  })
  return matchGlossary(text, rows, limit).map((r) => ({ id: r.id, term: r.term, translation: r.translation }))
}

export async function bumpGlossaryUsage(ids: string[]): Promise<void> {
  if (ids.length === 0) return
  await prisma.glossary.updateMany({ where: { id: { in: ids } }, data: { usageCount: { increment: 1 } } })
}

// === admin ===

export async function listGlossary(q: {
  q?: string
  source?: TranslationLocale
  limit: number
  offset: number
}): Promise<{ rows: GlossaryEntry[]; total: number }> {
  const where = {
    ...(q.source ? { sourceLocale: q.source } : {}),
    ...(q.q?.trim()
      ? { OR: [{ term: { contains: q.q.trim() } }, { translation: { contains: q.q.trim() } }] }
      : {}),
  }
  const [rows, total] = await Promise.all([
    prisma.glossary.findMany({ where, orderBy: { updatedAt: "desc" }, take: q.limit, skip: q.offset }),
    prisma.glossary.count({ where }),
  ])
  return { rows: rows.map(toEntry), total }
}

export async function updateGlossary(
  id: string,
  patch: { term?: string; translation?: string; note?: string | null },
  actorId: string
): Promise<GlossaryEntry | null> {
  const current = await prisma.glossary.findUnique({ where: { id } })
  if (!current) return null
  const term = patch.term?.trim() || current.term
  const row = await prisma.glossary.update({
    where: { id },
    data: {
      term,
      termNorm: normalizeTerm(term),
      translation: patch.translation?.trim() || current.translation,
      ...(patch.note === undefined ? {} : { note: patch.note }),
      autoReverse: false,
      updatedBy: actorId,
    },
  })
  const source = current.sourceLocale as TranslationLocale
  void invalidateTerm(source, current.term).catch(() => undefined)
  if (term !== current.term) void invalidateTerm(source, term).catch(() => undefined)
  return toEntry(row)
}

export async function removeGlossary(id: string): Promise<boolean> {
  const current = await prisma.glossary.findUnique({ where: { id } })
  if (!current) return false
  await prisma.glossary.delete({ where: { id } })
  void invalidateTerm(current.sourceLocale as TranslationLocale, current.term).catch(() => undefined)
  return true
}

/** Reset the done rows containing the given (or all) glossary terms to pending. */
export async function retranslateGlossary(ids?: string[]): Promise<{ requeued: number }> {
  const rows = await prisma.glossary.findMany({
    where: ids && ids.length > 0 ? { id: { in: ids } } : {},
    select: { sourceLocale: true, term: true },
  })
  let requeued = 0
  for (const r of rows) requeued += await invalidateTerm(r.sourceLocale as TranslationLocale, r.term)
  return { requeued }
}

/** Done rows whose source text contains `term` go back to pending. Returns the count. */
async function invalidateTerm(source: TranslationLocale, term: string): Promise<number> {
  const textWhere = source === "ja" ? { textJa: { contains: term } } : { textId: { contains: term } }
  const r = await prisma.fieldTranslation.updateMany({
    where: { status: "done", sourceLocale: source, ...textWhere },
    data: { status: "pending", attempts: 0, lastError: null, requestedAt: new Date() },
  })
  return r.count
}

function toEntry(r: {
  id: string
  sourceLocale: string
  targetLocale: string
  term: string
  translation: string
  note: string | null
  autoReverse: boolean
  usageCount: number
  updatedAt: Date
}): GlossaryEntry {
  return {
    id: r.id,
    sourceLocale: r.sourceLocale as TranslationLocale,
    targetLocale: r.targetLocale as TranslationLocale,
    term: r.term,
    translation: r.translation,
    note: r.note,
    autoReverse: r.autoReverse,
    usageCount: r.usageCount,
    updatedAt: r.updatedAt.toISOString(),
  }
}
