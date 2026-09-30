import { prisma } from "@/lib/prisma"
import { assigneeNamesOf } from "@/lib/assignees"
import { withFulltext } from "@/lib/fulltext/fallback"
import { trunc } from "@/lib/tool-helpers"
import { LIVE_PBI, NOT_DELETED } from "@/services/_shared/soft-delete"
import * as ft from "@/services/search/search.fulltext"
import { groupTranslationRanks, orderByRank, rankIds } from "@/services/search/search.query"

/**
 * Keyword search behind the chat tool `search_work_items`: PBIs, Icebox
 * requests and sprint tasks of ONE project (trashed rows excluded).
 * FULLTEXT (ngram, relevance-ordered, also matching the other language via
 * FieldTranslation) when available, else LIKE — see withFulltext.
 */

export const WORK_ITEM_SEARCH_LIMIT = 20

const ASSIGNEE_NAMES = { select: { user: { select: { name: true } } } } as const
const PBI_SELECT = { id: true, displayId: true, initiative: true, userStory: true, status: true, workloadScore: true } as const
const ICEBOX_SELECT = { id: true, displayId: true, request: true, status: true, author: true } as const
const TASK_SELECT = {
  id: true,
  taskName: true,
  status: true,
  assignee: true,
  assignees: ASSIGNEE_NAMES,
  sprint: { select: { sprintName: true, status: true } },
  pbItem: { select: { displayId: true } },
} as const

type IdFilter = { id: { in: string[] } }

function findPbis(projectId: string, filter: IdFilter | { OR: object[] }) {
  return prisma.productBacklogItem.findMany({
    where: { projectId, ...NOT_DELETED, ...filter },
    select: PBI_SELECT,
    take: WORK_ITEM_SEARCH_LIMIT,
  })
}

function findIcebox(projectId: string, filter: IdFilter | { OR: object[] }) {
  return prisma.iceboxItem.findMany({
    where: { projectId, ...NOT_DELETED, ...filter },
    select: ICEBOX_SELECT,
    take: WORK_ITEM_SEARCH_LIMIT,
  })
}

function findTasks(projectId: string, filter: IdFilter | { taskName: { contains: string } }) {
  return prisma.sprintBacklogItem.findMany({
    where: { sprint: { projectId }, ...LIVE_PBI, ...filter },
    select: TASK_SELECT,
    take: WORK_ITEM_SEARCH_LIMIT,
  })
}

interface Found {
  pbis: Awaited<ReturnType<typeof findPbis>>
  icebox: Awaited<ReturnType<typeof findIcebox>>
  tasks: Awaited<ReturnType<typeof findTasks>>
}

async function likeSearch(projectId: string, keyword: string): Promise<Found> {
  const [pbis, icebox, tasks] = await Promise.all([
    findPbis(projectId, {
      OR: [{ initiative: { contains: keyword } }, { epic: { contains: keyword } }, { userStory: { contains: keyword } }],
    }),
    findIcebox(projectId, { OR: [{ request: { contains: keyword } }, { background: { contains: keyword } }] }),
    findTasks(projectId, { taskName: { contains: keyword } }),
  ])
  return { pbis, icebox, tasks }
}

async function loadRanked<R extends { id: string }>(ids: string[], find: (f: IdFilter) => Promise<R[]>): Promise<R[]> {
  if (ids.length === 0) return []
  return orderByRank(await find({ id: { in: ids } }), ids)
}

async function fulltextSearch(projectId: string, booleanQuery: string): Promise<Found | null> {
  const scope = [projectId]
  const [pbiHits, iceboxHits, taskHits, translations] = await Promise.all([
    ft.fulltextPbiIds(prisma, scope, booleanQuery, WORK_ITEM_SEARCH_LIMIT),
    ft.fulltextIceboxIds(prisma, scope, booleanQuery, WORK_ITEM_SEARCH_LIMIT),
    ft.fulltextTaskIds(prisma, scope, booleanQuery, WORK_ITEM_SEARCH_LIMIT),
    ft.findTranslationFulltext(prisma, booleanQuery, ["pbi", "icebox", "task"]),
  ])
  const translated = groupTranslationRanks(translations)
  const pbiIds = rankIds(pbiHits, translated.backlog_item)
  const iceboxIds = rankIds(iceboxHits, translated.icebox_item)
  const taskIds = rankIds(taskHits, translated.sprint_task)
  if (pbiIds.length + iceboxIds.length + taskIds.length === 0) return null

  // Translation hits are not project scoped: the reload applies projectId + soft delete.
  const [pbis, icebox, tasks] = await Promise.all([
    loadRanked(pbiIds, (f) => findPbis(projectId, f)),
    loadRanked(iceboxIds, (f) => findIcebox(projectId, f)),
    loadRanked(taskIds, (f) => findTasks(projectId, f)),
  ])
  return { pbis, icebox, tasks }
}

/** Compact result rows for the LLM (PBIs, then Icebox, then tasks; at most WORK_ITEM_SEARCH_LIMIT). */
export async function searchWorkItems(projectId: string, keyword: string) {
  const { pbis, icebox, tasks } = await withFulltext(
    keyword,
    (booleanQuery) => fulltextSearch(projectId, booleanQuery),
    () => likeSearch(projectId, keyword)
  )
  return [
    ...pbis.map((b) => ({
      type: "pbi", id: `#${b.displayId}`, status: b.status, sp: b.workloadScore,
      title: trunc(b.initiative || b.userStory, 80),
    })),
    ...icebox.map((i) => ({
      type: "icebox", id: `#${i.displayId}`, status: i.status, author: i.author,
      title: trunc(i.request, 80),
    })),
    ...tasks.map((t) => ({
      type: "task", pbi: `#${t.pbItem.displayId}`, status: t.status,
      sprint: `${t.sprint.sprintName} (${t.sprint.status})`,
      assignee: assigneeNamesOf(t).join(", ") || null,
      title: trunc(t.taskName, 80),
    })),
  ].slice(0, WORK_ITEM_SEARCH_LIMIT)
}
