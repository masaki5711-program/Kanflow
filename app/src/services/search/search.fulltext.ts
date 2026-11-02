import { Prisma } from "@/generated/prisma/client"
import type { Db } from "@/services/_shared/db"
import { termsMatch, termsScore } from "@/lib/fulltext/trigram-sql"
import { SEARCH_FIELDS, TRANSLATION_ENTITY, type RankedId, type SearchType } from "./search.query"
import type { ProjectScope } from "./search.repository"

export type { RankedId }

/**
 * Trigram ("fulltext") candidate lookups for the global search and the chat's
 * search_work_items tool. Each query returns only `id` + relevance `score`,
 * already restricted to the given (accessible, live) project ids and to
 * non-trashed rows; callers then load the rows through Prisma with the usual
 * scope filters again.
 *
 * PostgreSQL: every term must occur (case-insensitive substring, `ILIKE`) in
 * at least one searched column; the columns carry pg_trgm GIN indexes
 * (`*_trgm_idx`, migration 0_init, `@@index(..., type: Gin)` in schema.prisma)
 * that serve these ILIKE filters (lib/fulltext/trigram-sql). The score is the sum over the
 * terms of `word_similarity(term, columns)` (pg_trgm; 1.0 = the term occurs as a word).
 * Terms come from buildSearchTerms and are always bound parameters; column
 * names are static.
 */

/** Max candidates per entity type (the UI shows at most 10 per type). */
export const FULLTEXT_CANDIDATE_CAP = 50
/** Max translation hits considered per search (all entity types together). */
export const TRANSLATION_FULLTEXT_CAP = 300

type ScoreRow = { id: string; score: number | string }

function col(name: string, alias?: string): Prisma.Sql {
  return Prisma.raw(alias ? `${alias}."${name}"` : `"${name}"`)
}

function toRanked(rows: readonly ScoreRow[]): RankedId[] {
  return rows.map((r) => ({ id: r.id, score: Number(r.score) }))
}

/** Live project ids matching the viewer's scope (see accessibleProjectWhere). */
export async function findAccessibleProjectIds(db: Db, scope: ProjectScope): Promise<string[]> {
  const rows = await db.project.findMany({ where: scope, select: { id: true } })
  return rows.map((r) => r.id)
}

async function run(db: Db, projectIds: readonly string[], sql: (ids: Prisma.Sql) => Prisma.Sql): Promise<RankedId[]> {
  if (projectIds.length === 0) return []
  return toRanked(await db.$queryRaw<ScoreRow[]>(sql(Prisma.join([...projectIds]))))
}

const PBI_COLS = SEARCH_FIELDS.pbi.map((f) => col(f))
const ICEBOX_COLS = SEARCH_FIELDS.icebox.map((f) => col(f))
const PROJECT_COLS = SEARCH_FIELDS.project.map((f) => col(f))
const GOAL_COLS = SEARCH_FIELDS.goal.map((f) => col(f))
const TASK_COLS = SEARCH_FIELDS.task.map((f) => col(f, "t"))

export function fulltextPbiIds(db: Db, projectIds: readonly string[], terms: readonly string[], cap: number) {
  return run(db, projectIds, (ids) => Prisma.sql`
    SELECT "id", ${termsScore(PBI_COLS, terms)} AS score
    FROM "ProductBacklogItem"
    WHERE "projectId" IN (${ids}) AND "deletedAt" IS NULL
      AND ${termsMatch(PBI_COLS, terms)}
    ORDER BY score DESC, "updatedAt" DESC LIMIT ${cap}`)
}

export function fulltextTaskIds(db: Db, projectIds: readonly string[], terms: readonly string[], cap: number) {
  return run(db, projectIds, (ids) => Prisma.sql`
    SELECT t."id", ${termsScore(TASK_COLS, terms)} AS score
    FROM "SprintBacklogItem" t
    JOIN "Sprint" s ON s."id" = t."sprintId"
    JOIN "ProductBacklogItem" p ON p."id" = t."pbItemId"
    WHERE s."projectId" IN (${ids}) AND p."deletedAt" IS NULL
      AND ${termsMatch(TASK_COLS, terms)}
    ORDER BY score DESC, t."updatedAt" DESC LIMIT ${cap}`)
}

export function fulltextIceboxIds(db: Db, projectIds: readonly string[], terms: readonly string[], cap: number) {
  return run(db, projectIds, (ids) => Prisma.sql`
    SELECT "id", ${termsScore(ICEBOX_COLS, terms)} AS score
    FROM "IceboxItem"
    WHERE "projectId" IN (${ids}) AND "deletedAt" IS NULL
      AND ${termsMatch(ICEBOX_COLS, terms)}
    ORDER BY score DESC, "updatedAt" DESC LIMIT ${cap}`)
}

export function fulltextProjectIds(db: Db, projectIds: readonly string[], terms: readonly string[], cap: number) {
  return run(db, projectIds, (ids) => Prisma.sql`
    SELECT "id", ${termsScore(PROJECT_COLS, terms)} AS score
    FROM "Project"
    WHERE "id" IN (${ids}) AND "deletedAt" IS NULL
      AND ${termsMatch(PROJECT_COLS, terms)}
    ORDER BY score DESC, "updatedAt" DESC LIMIT ${cap}`)
}

export function fulltextGoalIds(db: Db, projectIds: readonly string[], terms: readonly string[], cap: number) {
  return run(db, projectIds, (ids) => Prisma.sql`
    SELECT "id", ${termsScore(GOAL_COLS, terms)} AS score
    FROM "ProductGoal"
    WHERE "projectId" IN (${ids})
      AND ${termsMatch(GOAL_COLS, terms)}
    ORDER BY score DESC, "updatedAt" DESC LIMIT ${cap}`)
}

export type FulltextCandidates = Record<SearchType, RankedId[]>

/** Direct column hits of every searched type (5 queries in parallel). */
export async function findFulltextCandidates(
  db: Db,
  projectIds: readonly string[],
  terms: readonly string[],
  cap = FULLTEXT_CANDIDATE_CAP
): Promise<FulltextCandidates> {
  const [pbi, task, icebox, project, goal] = await Promise.all([
    fulltextPbiIds(db, projectIds, terms, cap),
    fulltextTaskIds(db, projectIds, terms, cap),
    fulltextIceboxIds(db, projectIds, terms, cap),
    fulltextProjectIds(db, projectIds, terms, cap),
    fulltextGoalIds(db, projectIds, terms, cap),
  ])
  return { pbi, task, icebox, project, goal }
}

export interface TranslationHit {
  entityType: string
  entityId: string
  score: number
}

/** The translation columns searched (trigram-indexed): the JA and ID sides, like the former FULLTEXT index. */
const TRANSLATION_COLS = [col("text_ja"), col("text_id")]

/**
 * Entities whose JA or ID translation of a searched field matches (so a
 * Japanese query finds Indonesian source text and vice versa). One row per
 * matching field (an entity may repeat; rankIds keeps its best score). Not
 * project scoped — callers must load the entities through their scoped queries.
 */
export async function findTranslationFulltext(
  db: Db,
  terms: readonly string[],
  types: readonly SearchType[] = Object.keys(SEARCH_FIELDS) as SearchType[]
): Promise<TranslationHit[]> {
  const targets = types.map(
    (type) => Prisma.sql`("entity_type" = ${TRANSLATION_ENTITY[type]} AND "field" IN (${Prisma.join([...SEARCH_FIELDS[type]])}))`
  )
  const rows = await db.$queryRaw<Array<{ entityType: string; entityId: string; score: number | string }>>(Prisma.sql`
    SELECT "entity_type" AS "entityType", "entity_id" AS "entityId", ${termsScore(TRANSLATION_COLS, terms)} AS score
    FROM "field_translation"
    WHERE ${termsMatch(TRANSLATION_COLS, terms)}
      AND (${Prisma.join(targets, " OR ")})
    ORDER BY score DESC LIMIT ${TRANSLATION_FULLTEXT_CAP}`)
  return rows.map((r) => ({ entityType: r.entityType, entityId: r.entityId, score: Number(r.score) }))
}
