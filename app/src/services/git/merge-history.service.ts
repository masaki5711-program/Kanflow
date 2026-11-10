import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { pbiKey } from "@/lib/git/pbi-keys"
import { ValidationError } from "@/services/_shared/errors"
import { isGitEnabled } from "./git.service"

/**
 * マージの履歴 (N11): the merge requests of a project that were merged, newest
 * first, read from Kanflow's own synced copy (`git_link`) — never from the Git
 * server at request time, so the page works while GitLab / GitStation is down.
 *
 * Only merge requests linked to a (live) PBI are known to Kanflow; one linked
 * to several PBIs has one row per PBI and is shown once. Links a developer
 * declared are included: this is a display, never evidence of delivery.
 */

export const MERGE_HISTORY_LIMIT_DEFAULT = 25
export const MERGE_HISTORY_LIMIT_MAX = 100

/** GET …/git/merge-history?from=&to=&repositoryId=&cursor=&limit= (`from` inclusive, `to` exclusive). */
export const mergeHistoryQuerySchema = z.object({
  from: z.iso.datetime({ offset: true }).optional(),
  to: z.iso.datetime({ offset: true }).optional(),
  repositoryId: z.string().min(1).max(64).optional(),
  cursor: z.string().min(1).max(1024).optional(),
  limit: z.coerce.number().int().min(1).max(MERGE_HISTORY_LIMIT_MAX).default(MERGE_HISTORY_LIMIT_DEFAULT),
})

export type MergeHistoryQuery = z.infer<typeof mergeHistoryQuerySchema>

export interface MergeHistoryItemDto {
  /** `<repositoryId>:<ref>` — one per merge request. */
  id: string
  /** The merge request's number in its repository. */
  ref: string
  title: string
  url: string
  mergedAt: string
  /** Null = unknown (the source did not say, or it was merged before this was recorded). Same for the fields below. */
  openedAt: string | null
  author: string | null
  mergedBy: string | null
  sourceBranch: string | null
  targetBranch: string | null
  repository: { id: string; name: string }
  pbis: Array<{ id: string; displayId: number; title: string }>
}

export interface MergeHistoryDto {
  enabled: boolean
  items: MergeHistoryItemDto[]
  /** Pass back as `cursor` for the next (older) page; null = no more. */
  nextCursor: string | null
}

/** Where a page ended: merge time, then repository and ref to order merges of the same instant. */
interface Position {
  t: Date
  r: string
  f: string
}

const positionSchema = z.object({ t: z.iso.datetime(), r: z.string().min(1).max(64), f: z.string().min(1).max(255) })

export function encodeMergeHistoryCursor(p: Position): string {
  return Buffer.from(JSON.stringify({ t: p.t.toISOString(), r: p.r, f: p.f }), "utf8").toString("base64url")
}

/** The cursor is opaque to the client; one this code did not issue is a 400, never a silent first page. */
export function decodeMergeHistoryCursor(cursor: string): Position {
  try {
    const parsed = positionSchema.parse(JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")))
    return { t: new Date(parsed.t), r: parsed.r, f: parsed.f }
  } catch {
    throw new ValidationError("cursor が正しくありません", undefined, "VALIDATION")
  }
}

/** Rows strictly after `p` in the order (merge time, repository, ref), all descending. */
function after(p: Position) {
  return {
    OR: [
      { mergedAt: { _min: { lt: p.t } } },
      { mergedAt: { _min: { equals: p.t } }, repositoryId: { lt: p.r } },
      { mergedAt: { _min: { equals: p.t } }, repositoryId: p.r, ref: { lt: p.f } },
    ],
  }
}

export async function getMergeHistory(projectId: string, query: MergeHistoryQuery): Promise<MergeHistoryDto> {
  if (!(await isGitEnabled(projectId))) return { enabled: false, items: [], nextCursor: null }
  const position = query.cursor ? decodeMergeHistoryCursor(query.cursor) : null

  const where = {
    projectId,
    kind: "mr",
    state: "merged",
    mergedAt: { not: null },
    backlogItem: { deletedAt: null },
    ...(query.repositoryId ? { repositoryId: query.repositoryId } : {}),
  }
  // One group per merge request; its merge time is the earliest its rows carry
  // (rows of one MR are written by different syncs and may differ slightly).
  const period = [
    ...(query.from ? [{ mergedAt: { _min: { gte: new Date(query.from) } } }] : []),
    ...(query.to ? [{ mergedAt: { _min: { lt: new Date(query.to) } } }] : []),
  ]
  const groups = await prisma.gitLink.groupBy({
    by: ["repositoryId", "ref"],
    where,
    _min: { mergedAt: true },
    having: { AND: [...period, ...(position ? [after(position)] : [])] },
    orderBy: [{ _min: { mergedAt: "desc" } }, { repositoryId: "desc" }, { ref: "desc" }],
    take: query.limit + 1,
  })
  const page = groups.slice(0, query.limit)
  if (page.length === 0) return { enabled: true, items: [], nextCursor: null }

  const rows = await prisma.gitLink.findMany({
    where: { ...where, OR: page.map((g) => ({ repositoryId: g.repositoryId, ref: g.ref })) },
    orderBy: [{ occurredAt: "desc" }, { id: "asc" }],
    select: {
      repositoryId: true,
      ref: true,
      title: true,
      url: true,
      author: true,
      mergedBy: true,
      sourceBranch: true,
      targetBranch: true,
      openedAt: true,
      repository: { select: { id: true, name: true } },
      backlogItem: { select: { id: true, displayId: true, initiative: true, userStory: true } },
    },
  })
  const byMr = new Map<string, typeof rows>()
  for (const row of rows) {
    const key = mrKey(row.repositoryId, row.ref)
    byMr.set(key, [...(byMr.get(key) ?? []), row])
  }

  const items = page.flatMap((g): MergeHistoryItemDto[] => {
    const mine = byMr.get(mrKey(g.repositoryId, g.ref))
    const mergedAt = g._min.mergedAt
    // Gone between the two reads (unlinked, PBI deleted): not part of this page.
    if (!mine || !mergedAt) return []
    const latest = mine[0]
    const opened = mine.flatMap((r) => (r.openedAt ? [r.openedAt.getTime()] : []))
    const pbis = new Map(mine.map((r) => [r.backlogItem.id, r.backlogItem]))
    return [
      {
        id: mrKey(g.repositoryId, g.ref),
        ref: g.ref,
        title: latest.title,
        url: latest.url,
        mergedAt: mergedAt.toISOString(),
        openedAt: opened.length > 0 ? new Date(Math.min(...opened)).toISOString() : null,
        author: firstKnown(mine.map((r) => r.author)),
        mergedBy: firstKnown(mine.map((r) => r.mergedBy)),
        sourceBranch: firstKnown(mine.map((r) => r.sourceBranch)),
        targetBranch: firstKnown(mine.map((r) => r.targetBranch)),
        repository: latest.repository,
        pbis: [...pbis.values()]
          .sort((a, b) => a.displayId - b.displayId)
          .map((p) => ({ id: p.id, displayId: p.displayId, title: p.initiative || p.userStory?.slice(0, 80) || pbiKey(p.displayId) })),
      },
    ]
  })

  const last = page[page.length - 1]
  const more = groups.length > query.limit && last._min.mergedAt
  return { enabled: true, items, nextCursor: more ? encodeMergeHistoryCursor({ t: more, r: last.repositoryId, f: last.ref }) : null }
}

const mrKey = (repositoryId: string, ref: string) => `${repositoryId}:${ref}`

/** The first value that is known, taking the most recently changed row first. */
function firstKnown(values: Array<string | null>): string | null {
  return values.find((v) => v !== null && v !== "") ?? null
}
