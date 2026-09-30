import type { Prisma } from "@/generated/prisma/client"
import type { Db } from "@/services/_shared/db"
import { NOT_DELETED } from "@/services/_shared/soft-delete"
import { containsAny, SEARCH_FIELDS, TRANSLATION_ENTITY, type SearchType } from "./search.query"

/**
 * Global search reads. Every entity query is scoped with `project: scope`
 * (the viewer's accessible, live projects — see accessibleProjectWhere) and
 * excludes trashed rows. Matching is LIKE `%pattern%` on the listed columns
 * (the pattern is escaped by the caller) OR an id found in the other
 * language through FieldTranslation. FULLTEXT replaces this in P3.
 */

/** Cap of translation hits considered per search (all types together). */
export const TRANSLATION_MATCH_CAP = 300

/** `ProjectWhereInput` produced by accessibleProjectWhere. */
export type ProjectScope = Prisma.ProjectWhereInput

export interface EntityMatch {
  /** Escaped LIKE pattern (without the surrounding %). */
  pattern: string
  /** Ids matched through the translated text. */
  ids: readonly string[]
  take: number
}

const PROJECT_REF = { select: { id: true, name: true } } as const

/** OR list: any searched column contains the pattern, or the id matched in the other language. */
function textOr<W>(type: SearchType, m: EntityMatch, extra: readonly W[] = []): W[] {
  const byText = containsAny(SEARCH_FIELDS[type], m.pattern) as W[]
  const byTranslation = (m.ids.length > 0 ? [{ id: { in: [...m.ids] } }] : []) as W[]
  return [...byText, ...byTranslation, ...extra]
}

/** Entity ids whose JA or ID text of a searched field matches. */
export function findTranslationMatches(db: Db, pattern: string) {
  const targets = (Object.keys(SEARCH_FIELDS) as SearchType[]).map((type) => ({
    entityType: TRANSLATION_ENTITY[type],
    field: { in: [...SEARCH_FIELDS[type]] },
  }))
  return db.fieldTranslation.findMany({
    where: {
      OR: targets,
      AND: [{ OR: [{ textJa: { contains: pattern } }, { textId: { contains: pattern } }] }],
    },
    select: { entityType: true, entityId: true },
    orderBy: { updatedAt: "desc" },
    take: TRANSLATION_MATCH_CAP,
  })
}

export function findPbis(db: Db, scope: ProjectScope, m: EntityMatch & { displayId: number | null }) {
  return db.productBacklogItem.findMany({
    where: {
      ...NOT_DELETED,
      project: scope,
      OR: textOr<Prisma.ProductBacklogItemWhereInput>("pbi", m, m.displayId !== null ? [{ displayId: m.displayId }] : []),
    },
    select: { id: true, displayId: true, initiative: true, userStory: true, status: true, project: PROJECT_REF },
    orderBy: { updatedAt: "desc" },
    take: m.take,
  })
}

export function findTasks(db: Db, scope: ProjectScope, m: EntityMatch) {
  return db.sprintBacklogItem.findMany({
    where: { pbItem: NOT_DELETED, sprint: { project: scope }, OR: textOr<Prisma.SprintBacklogItemWhereInput>("task", m) },
    select: {
      id: true,
      taskName: true,
      status: true,
      sprint: { select: { id: true, sprintName: true, project: PROJECT_REF } },
    },
    orderBy: { updatedAt: "desc" },
    take: m.take,
  })
}

export function findIceboxItems(db: Db, scope: ProjectScope, m: EntityMatch) {
  return db.iceboxItem.findMany({
    where: { ...NOT_DELETED, project: scope, OR: textOr<Prisma.IceboxItemWhereInput>("icebox", m) },
    select: { id: true, displayId: true, request: true, status: true, project: PROJECT_REF },
    orderBy: { updatedAt: "desc" },
    take: m.take,
  })
}

export function findProjects(db: Db, scope: ProjectScope, m: EntityMatch) {
  return db.project.findMany({
    // AND: the scope may carry its own OR (section managers).
    where: { AND: [scope, { OR: textOr<Prisma.ProjectWhereInput>("project", m) }] },
    select: { id: true, name: true, status: true },
    orderBy: { updatedAt: "desc" },
    take: m.take,
  })
}

export function findGoals(db: Db, scope: ProjectScope, m: EntityMatch) {
  return db.productGoal.findMany({
    where: { project: scope, OR: textOr<Prisma.ProductGoalWhereInput>("goal", m) },
    select: { id: true, title: true, project: PROJECT_REF },
    orderBy: { updatedAt: "desc" },
    take: m.take,
  })
}
