import { Prisma } from "@/generated/prisma/client"
import type { Db } from "@/services/_shared/db"
import { SEARCH_FIELDS, TRANSLATION_ENTITY, type RankedId, type SearchType } from "./search.query"
import type { ProjectScope } from "./search.repository"

export type { RankedId }

/**
 * FULLTEXT (ngram) candidate lookups for the global search and the chat's
 * search_work_items tool. Each query returns only `id` + relevance `score`,
 * already restricted to the given (accessible, live) project ids and to
 * non-trashed rows; callers then load the rows through Prisma with the usual
 * scope filters again. The boolean query comes from buildBooleanQuery and is
 * always a bound parameter.
 *
 * The MATCH column lists must equal the FULLTEXT indexes of migration
 * 20261003010000_fulltext_search (and the @@fulltext attributes in
 * schema.prisma); otherwise MySQL raises 1191 and withFulltext falls back to LIKE.
 */

/** Max FULLTEXT candidates per entity type (the UI shows at most 10 per type). */
export const FULLTEXT_CANDIDATE_CAP = 50
/** Max translation hits considered per search (all entity types together). */
export const TRANSLATION_FULLTEXT_CAP = 300

type ScoreRow = { id: string; score: number | string }

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

export function fulltextPbiIds(db: Db, projectIds: readonly string[], q: string, cap: number) {
  return run(db, projectIds, (ids) => Prisma.sql`
    SELECT \`id\`, MATCH(\`initiative\`, \`epic\`, \`userStory\`, \`acceptanceCriteria\`) AGAINST (${q} IN BOOLEAN MODE) AS score
    FROM \`ProductBacklogItem\`
    WHERE \`projectId\` IN (${ids}) AND \`deletedAt\` IS NULL
      AND MATCH(\`initiative\`, \`epic\`, \`userStory\`, \`acceptanceCriteria\`) AGAINST (${q} IN BOOLEAN MODE)
    ORDER BY score DESC, \`updatedAt\` DESC LIMIT ${cap}`)
}

export function fulltextTaskIds(db: Db, projectIds: readonly string[], q: string, cap: number) {
  return run(db, projectIds, (ids) => Prisma.sql`
    SELECT t.\`id\`, MATCH(t.\`taskName\`) AGAINST (${q} IN BOOLEAN MODE) AS score
    FROM \`SprintBacklogItem\` t
    JOIN \`Sprint\` s ON s.\`id\` = t.\`sprintId\`
    JOIN \`ProductBacklogItem\` p ON p.\`id\` = t.\`pbItemId\`
    WHERE s.\`projectId\` IN (${ids}) AND p.\`deletedAt\` IS NULL
      AND MATCH(t.\`taskName\`) AGAINST (${q} IN BOOLEAN MODE)
    ORDER BY score DESC, t.\`updatedAt\` DESC LIMIT ${cap}`)
}

export function fulltextIceboxIds(db: Db, projectIds: readonly string[], q: string, cap: number) {
  return run(db, projectIds, (ids) => Prisma.sql`
    SELECT \`id\`, MATCH(\`request\`, \`background\`, \`pbEpic\`) AGAINST (${q} IN BOOLEAN MODE) AS score
    FROM \`IceboxItem\`
    WHERE \`projectId\` IN (${ids}) AND \`deletedAt\` IS NULL
      AND MATCH(\`request\`, \`background\`, \`pbEpic\`) AGAINST (${q} IN BOOLEAN MODE)
    ORDER BY score DESC, \`updatedAt\` DESC LIMIT ${cap}`)
}

export function fulltextProjectIds(db: Db, projectIds: readonly string[], q: string, cap: number) {
  return run(db, projectIds, (ids) => Prisma.sql`
    SELECT \`id\`, MATCH(\`name\`) AGAINST (${q} IN BOOLEAN MODE) AS score
    FROM \`Project\`
    WHERE \`id\` IN (${ids}) AND \`deletedAt\` IS NULL
      AND MATCH(\`name\`) AGAINST (${q} IN BOOLEAN MODE)
    ORDER BY score DESC, \`updatedAt\` DESC LIMIT ${cap}`)
}

export function fulltextGoalIds(db: Db, projectIds: readonly string[], q: string, cap: number) {
  return run(db, projectIds, (ids) => Prisma.sql`
    SELECT \`id\`, MATCH(\`title\`, \`description\`) AGAINST (${q} IN BOOLEAN MODE) AS score
    FROM \`ProductGoal\`
    WHERE \`projectId\` IN (${ids})
      AND MATCH(\`title\`, \`description\`) AGAINST (${q} IN BOOLEAN MODE)
    ORDER BY score DESC, \`updatedAt\` DESC LIMIT ${cap}`)
}

export type FulltextCandidates = Record<SearchType, RankedId[]>

/** Direct column hits of every searched type (5 queries in parallel). */
export async function findFulltextCandidates(
  db: Db,
  projectIds: readonly string[],
  q: string,
  cap = FULLTEXT_CANDIDATE_CAP
): Promise<FulltextCandidates> {
  const [pbi, task, icebox, project, goal] = await Promise.all([
    fulltextPbiIds(db, projectIds, q, cap),
    fulltextTaskIds(db, projectIds, q, cap),
    fulltextIceboxIds(db, projectIds, q, cap),
    fulltextProjectIds(db, projectIds, q, cap),
    fulltextGoalIds(db, projectIds, q, cap),
  ])
  return { pbi, task, icebox, project, goal }
}

export interface TranslationHit {
  entityType: string
  entityId: string
  score: number
}

/**
 * Entities whose JA or ID translation of a searched field matches (so a
 * Japanese query finds Indonesian source text and vice versa). One row per
 * matching field (an entity may repeat; rankIds keeps its best score). Not
 * project scoped — callers must load the entities through their scoped queries.
 */
export async function findTranslationFulltext(
  db: Db,
  q: string,
  types: readonly SearchType[] = Object.keys(SEARCH_FIELDS) as SearchType[]
): Promise<TranslationHit[]> {
  const targets = types.map(
    (type) => Prisma.sql`(\`entity_type\` = ${TRANSLATION_ENTITY[type]} AND \`field\` IN (${Prisma.join([...SEARCH_FIELDS[type]])}))`
  )
  const rows = await db.$queryRaw<Array<{ entityType: string; entityId: string; score: number | string }>>(Prisma.sql`
    SELECT \`entity_type\` AS entityType, \`entity_id\` AS entityId, MATCH(\`text_ja\`, \`text_id\`) AGAINST (${q} IN BOOLEAN MODE) AS score
    FROM \`field_translation\`
    WHERE MATCH(\`text_ja\`, \`text_id\`) AGAINST (${q} IN BOOLEAN MODE)
      AND (${Prisma.join(targets, " OR ")})
    ORDER BY score DESC LIMIT ${TRANSLATION_FULLTEXT_CAP}`)
  return rows.map((r) => ({ entityType: r.entityType, entityId: r.entityId, score: Number(r.score) }))
}
