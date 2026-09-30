import { defaultDb } from "@/services/_shared/db"
import { getI18nFor } from "@/services/_shared/translations"
import type { EntityI18n } from "@/lib/translation/types"
import { withFulltext } from "@/lib/fulltext/fallback"
import * as repo from "./search.repository"
import * as ft from "./search.fulltext"
import {
  accessibleProjectWhere,
  escapeLike,
  groupTranslationMatches,
  groupTranslationRanks,
  orderByRank,
  parseDisplayId,
  rankIds,
  searchHref,
  SEARCH_TYPES,
  TRANSLATION_ENTITY,
  type SearchType,
  type SearchViewer,
} from "./search.query"
import type { SearchQuery } from "./search.schemas"
import type { SearchGroupDto, SearchHitDto, SearchResultDto } from "./search.types"

export type { SearchGroupDto, SearchHitDto, SearchResultDto }

type ProjectRef = { id: string; name: string }

interface RawHit {
  type: SearchType
  id: string
  project: ProjectRef
  title: string
  titleField: string
  displayId: number | null
  context: string | null
  status: string | null
}

type Rows<F extends (...args: never[]) => Promise<unknown[]>> = Awaited<ReturnType<F>>

function pbiHits(rows: Rows<typeof repo.findPbis>, displayId: number | null): RawHit[] {
  const hits = rows.map((r): RawHit => {
    const byInitiative = !!r.initiative?.trim()
    return {
      type: "pbi",
      id: r.id,
      project: r.project,
      title: (byInitiative ? r.initiative : r.userStory) ?? "",
      titleField: byInitiative ? "initiative" : "userStory",
      displayId: r.displayId,
      context: null,
      status: r.status,
    }
  })
  // The exact "PBI-12" match first.
  return displayId === null ? hits : hits.toSorted((a, b) => Number(b.displayId === displayId) - Number(a.displayId === displayId))
}

function taskHits(rows: Rows<typeof repo.findTasks>): RawHit[] {
  return rows.map((r) => ({
    type: "task",
    id: r.id,
    project: r.sprint.project,
    title: r.taskName ?? "",
    titleField: "taskName",
    displayId: null,
    context: r.sprint.sprintName,
    status: r.status,
  }))
}

function iceboxHits(rows: Rows<typeof repo.findIceboxItems>): RawHit[] {
  return rows.map((r) => ({
    type: "icebox",
    id: r.id,
    project: r.project,
    title: r.request,
    titleField: "request",
    displayId: r.displayId,
    context: null,
    status: r.status,
  }))
}

function projectHits(rows: Rows<typeof repo.findProjects>): RawHit[] {
  return rows.map((r) => ({
    type: "project",
    id: r.id,
    project: { id: r.id, name: r.name },
    title: r.name,
    titleField: "name",
    displayId: null,
    context: null,
    status: r.status,
  }))
}

function goalHits(rows: Rows<typeof repo.findGoals>): RawHit[] {
  return rows.map((r) => ({
    type: "goal",
    id: r.id,
    project: r.project,
    title: r.title,
    titleField: "title",
    displayId: null,
    context: null,
    status: null,
  }))
}

/** Only the one field of an entity's translations (keeps the payload small). */
function pickField(i18n: EntityI18n | undefined, field: string): EntityI18n {
  const entry = i18n?.[field]
  return entry ? { [field]: entry } : {}
}

function toDto(h: RawHit, i18n: Map<string, EntityI18n>, projectI18n: Map<string, EntityI18n>): SearchHitDto {
  return {
    type: h.type,
    id: h.id,
    projectId: h.project.id,
    projectName: h.project.name,
    projectI18n: pickField(projectI18n.get(h.project.id), "name"),
    title: h.title,
    titleField: h.titleField,
    i18n: pickField(i18n.get(h.id), h.titleField),
    displayId: h.displayId,
    context: h.context,
    status: h.status,
    href: searchHref(h.type, h.project.id, h.id),
  }
}

/** Both-language titles and project names; empty groups are dropped. */
async function attachI18n(groups: RawHit[][]): Promise<SearchGroupDto[]> {
  const present = groups.filter((hits) => hits.length > 0)
  const projectIds = [...new Set(present.flat().map((h) => h.project.id))]
  const [projectI18n, ...perGroup] = await Promise.all([
    getI18nFor("project", projectIds),
    ...present.map((hits) => getI18nFor(TRANSLATION_ENTITY[hits[0].type], hits.map((h) => h.id))),
  ])
  return present.map((hits, i) => ({ type: hits[0].type, items: hits.map((h) => toDto(h, perGroup[i], projectI18n)) }))
}

interface Found {
  pbis: Rows<typeof repo.findPbis>
  tasks: Rows<typeof repo.findTasks>
  icebox: Rows<typeof repo.findIceboxItems>
  projects: Rows<typeof repo.findProjects>
  goals: Rows<typeof repo.findGoals>
}

const NOTHING_FOUND: Found = { pbis: [], tasks: [], icebox: [], projects: [], goals: [] }

interface SearchInput {
  scope: repo.ProjectScope
  q: string
  limit: number
  displayId: number | null
}

/** LIKE '%q%' on the source columns OR the other language's text (FieldTranslation). */
async function likeSearch({ scope, q, limit, displayId }: SearchInput): Promise<Found> {
  const pattern = escapeLike(q)
  const translated = groupTranslationMatches(await repo.findTranslationMatches(defaultDb, pattern))
  const match = (type: SearchType) => ({ pattern, ids: translated[TRANSLATION_ENTITY[type]], take: limit })

  const [pbis, tasks, icebox, projects, goals] = await Promise.all([
    repo.findPbis(defaultDb, scope, { ...match("pbi"), displayId }),
    repo.findTasks(defaultDb, scope, match("task")),
    repo.findIceboxItems(defaultDb, scope, match("icebox")),
    repo.findProjects(defaultDb, scope, match("project")),
    repo.findGoals(defaultDb, scope, match("goal")),
  ])
  return { pbis, tasks, icebox, projects, goals }
}

/**
 * Loads the ranked candidates of one type through its scoped repository query
 * (so authz and soft-delete filters apply again — translation hits are not
 * project scoped) and keeps the `limit` most relevant.
 */
async function loadRanked<R extends { id: string }>(
  ids: string[],
  limit: number,
  find: (m: repo.EntityMatch) => Promise<R[]>
): Promise<R[]> {
  if (ids.length === 0) return []
  const rows = await find({ pattern: null, ids, take: ids.length })
  return orderByRank(rows, ids).slice(0, limit)
}

/** PBIs additionally match an exact displayId ("PBI-12"), which is kept first. */
async function loadRankedPbis(ids: string[], { scope, limit, displayId }: SearchInput) {
  if (ids.length === 0 && displayId === null) return []
  const rows = await repo.findPbis(defaultDb, scope, { pattern: null, ids, take: ids.length + (displayId === null ? 0 : 1), displayId })
  const exactFirst = (r: { displayId: number }) => Number(r.displayId !== displayId)
  return orderByRank(rows, ids).toSorted((a, b) => exactFirst(a) - exactFirst(b)).slice(0, limit)
}

/**
 * MATCH … AGAINST (ngram) candidates of the accessible projects, merged with
 * translation hits and ordered by relevance. Returns null when there is no
 * candidate at all, so the caller retries with LIKE.
 */
async function fulltextSearch(input: SearchInput, booleanQuery: string): Promise<Found | null> {
  const projectIds = await ft.findAccessibleProjectIds(defaultDb, input.scope)
  if (projectIds.length === 0) return NOTHING_FOUND
  const [direct, translations] = await Promise.all([
    ft.findFulltextCandidates(defaultDb, projectIds, booleanQuery),
    ft.findTranslationFulltext(defaultDb, booleanQuery),
  ])
  const translated = groupTranslationRanks(translations)
  const ranked = Object.fromEntries(
    SEARCH_TYPES.map((type) => [type, rankIds(direct[type], translated[TRANSLATION_ENTITY[type]])])
  ) as Record<SearchType, string[]>
  if (SEARCH_TYPES.every((type) => ranked[type].length === 0)) return null

  const { scope, limit } = input
  const [pbis, tasks, icebox, projects, goals] = await Promise.all([
    loadRankedPbis(ranked.pbi, input),
    loadRanked(ranked.task, limit, (m) => repo.findTasks(defaultDb, scope, m)),
    loadRanked(ranked.icebox, limit, (m) => repo.findIceboxItems(defaultDb, scope, m)),
    loadRanked(ranked.project, limit, (m) => repo.findProjects(defaultDb, scope, m)),
    loadRanked(ranked.goal, limit, (m) => repo.findGoals(defaultDb, scope, m)),
  ])
  return { pbis, tasks, icebox, projects, goals }
}

/**
 * Global search over PBIs, sprint tasks, Icebox items, projects and product
 * goals of the projects the viewer can access (trashed rows excluded).
 * Text matches either language (source columns + FieldTranslation). FULLTEXT
 * (ngram, relevance-ordered) when available, else LIKE — see withFulltext.
 * At most `limit` hits per type; empty groups are omitted.
 */
export async function searchEverything(viewer: SearchViewer, query: SearchQuery): Promise<SearchResultDto> {
  const input: SearchInput = {
    scope: accessibleProjectWhere(viewer),
    q: query.q,
    limit: query.limit,
    displayId: parseDisplayId(query.q),
  }
  const found = await withFulltext(
    query.q,
    (booleanQuery) => fulltextSearch(input, booleanQuery),
    () => likeSearch(input)
  )

  const groups = await attachI18n([
    pbiHits(found.pbis, input.displayId),
    taskHits(found.tasks),
    iceboxHits(found.icebox),
    projectHits(found.projects),
    goalHits(found.goals),
  ])
  return { query: query.q, groups }
}
