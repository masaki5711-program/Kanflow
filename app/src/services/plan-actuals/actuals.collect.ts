/**
 * Reads everything 実績を確定 freezes (plan 12 §2.2 / §2.4, E1) and computes it with the pure functions of
 * src/lib/plan-actuals. Read-only: `finalizeActuals` writes what this returns, the preview shows its issues.
 *
 * Bounded reads: one project's live plan rows (≤ 2,000), the activity rows of those leaves, the tasks / MR links of the
 * leaves' PBIs, and — for owner concurrency — only the actual SPANS of the same owners' other leaves that overlap this
 * project's actual dates (no names, no project ids are selected). Every lookup is grouped into a Map once (no
 * per-leaf scans of whole arrays).
 *
 * Days of change-history timestamps are Asia/Tokyo calendar days, like every other "today" of the plan
 * (src/lib/plan-progress.ts `tokyoDateKey`); stored plan dates are UTC-midnight calendar days.
 */
import { logger } from "@/lib/logger"
import {
  computeLeafActuals,
  pbiHours,
  pbiMrFacts,
  pbiReopenCount,
  repositoryReadable,
  type ActualsIssue,
  type LeafActuals,
  type LeafInput,
  type PbiMrFacts,
  type RepoInput,
  type StatusChange,
} from "@/lib/plan-actuals/compute"
import { dateKeyOf, dayNumber } from "@/lib/plan-estimate/dates"
import { tokyoDateKey } from "@/lib/plan-progress"
import { baseScheduleSchema, type BaseScheduleItem } from "@/lib/plan-schedule/base-schedule"
import type { Db } from "@/services/_shared/db"
import { NotFoundError } from "@/services/_shared/errors"

const log = logger.child({ module: "plan-actuals" })

/** Method version of the frozen numbers (stored on every snapshot). */
export const ACTUALS_METHOD_VERSION = "e1-v1"

/** The owners' other spans read for concurrency; past this, concurrency is unknown rather than understated. */
const OWNER_INTERVALS_MAX = 20_000

const DAY_MS = 86_400_000
/** A stored calendar day (UTC midnight) as "YYYY-MM-DD". */
const dayKey = (d: Date | null): string | null => (d ? dateKeyOf(Math.floor(d.getTime() / DAY_MS)) : null)

export type CollectIssue =
  | ActualsIssue
  | { kind: "repository_unreadable"; repositoryRef: string }
  /** No base schedule was loaded: days are counted as calendar days and the lineage is this project only. */
  | { kind: "no_schedule_load" }
  /** The loaded schedule could not be read back: roles and template days are unknown. */
  | { kind: "schedule_unreadable" }

export interface CollectedPbi {
  backlogItemId: string
  effortHours: number | null
  estimatedHours: number | null
  reworkCount: number
  mr: PbiMrFacts
}

export interface CollectedItem {
  leaf: LeafInput
  actuals: LeafActuals
  pbis: CollectedPbi[]
}

export interface CollectedActuals {
  projectType: string
  lineage: string
  scheduleLoadId: string | null
  scheduleHash: string | null
  skipWeekends: boolean
  /** Latest actual end of a leaf (null = none: finalizing is refused then). */
  closedAt: string | null
  repoCount: number
  items: CollectedItem[]
  issues: CollectIssue[]
}

type ParsedChange = { from: string | null; to: string | null } | "unreadable" | null

/** `{ changes: { status: { from, to } } }` of an activity row; null = not a status change; "unreadable" = broken row. */
function statusChangeOf(diff: string | null): ParsedChange {
  if (!diff) return null
  try {
    const parsed = JSON.parse(diff) as { changes?: { status?: { from?: unknown; to?: unknown } } }
    const s = parsed?.changes?.status
    if (!s || typeof s !== "object" || !("from" in s || "to" in s)) return null
    return { from: typeof s.from === "string" ? s.from : null, to: typeof s.to === "string" ? s.to : null }
  } catch {
    return "unreadable"
  }
}

/** Roles and durations of the loaded schedule by key (formerKeys included); null when the content does not parse. */
function scheduleIndex(content: unknown): Map<string, Pick<BaseScheduleItem, "role" | "durationDays">> | null {
  const parsed = baseScheduleSchema.safeParse(content)
  if (!parsed.success) return null
  const out = new Map<string, Pick<BaseScheduleItem, "role" | "durationDays">>()
  const walk = (items: readonly BaseScheduleItem[]) => {
    for (const it of items) {
      const value = { role: it.role, durationDays: it.durationDays }
      out.set(it.key, value)
      for (const k of it.formerKeys ?? []) if (!out.has(k)) out.set(k, value)
      if (it.children) walk(it.children)
    }
  }
  walk(parsed.data.items)
  return out
}

function groupBy<T, K>(rows: readonly T[], key: (row: T) => K): Map<K, T[]> {
  const out = new Map<K, T[]>()
  for (const r of rows) {
    const k = key(r)
    const list = out.get(k)
    if (list) list.push(r)
    else out.set(k, [r])
  }
  return out
}

export async function collectActuals(db: Db, projectId: string): Promise<CollectedActuals> {
  const [project, load, rows, deps, repos] = await Promise.all([
    db.project.findUnique({ where: { id: projectId }, select: { projectType: true } }),
    db.planScheduleLoad.findFirst({ where: { projectId }, orderBy: [{ loadedAt: "desc" }, { id: "desc" }], select: { id: true, lineage: true, scheduleHash: true, skipWeekends: true, content: true } }),
    db.planItem.findMany({
      where: { projectId, deletedAt: null },
      select: {
        id: true,
        parentId: true,
        name: true,
        templateKey: true,
        isMilestone: true,
        durationDays: true,
        status: true,
        ownerId: true,
        baselineStart: true,
        baselineEnd: true,
        plannedStart: true,
        plannedEnd: true,
        actualStart: true,
        actualEnd: true,
      },
    }),
    db.planItemDependency.findMany({ where: { projectId }, select: { predecessorId: true, successorId: true } }),
    db.gitRepository.findMany({ where: { projectId }, select: { id: true, repoPath: true, syncedAt: true, lastErrorAt: true, stationRereadAt: true }, orderBy: { sortOrder: "asc" } }),
  ])
  if (!project) throw new NotFoundError("プロジェクトが見つかりません")
  const issues: CollectIssue[] = []
  if (!load) issues.push({ kind: "no_schedule_load" })
  const skipWeekends = load?.skipWeekends ?? false
  const byKey = load ? scheduleIndex(load.content) : new Map<string, Pick<BaseScheduleItem, "role" | "durationDays">>()
  if (byKey === null) {
    log.warn("loaded base schedule does not parse; roles and template days are unknown", { projectId, scheduleLoadId: load?.id })
    issues.push({ kind: "schedule_unreadable" })
  }

  const parents = new Set(rows.map((r) => r.parentId).filter((x): x is string => x !== null))
  const byId = new Map(rows.map((r) => [r.id, r]))
  const leaves = rows.filter((r) => !parents.has(r.id))
  const leafIds = leaves.map((l) => l.id)
  const preds = groupBy(deps, (d) => d.successorId)

  // Owner concurrency: other leaves of the same owners overlapping this project's actual dates (spans only).
  const ownerIds = [...new Set(leaves.map((l) => l.ownerId).filter((x): x is string => x !== null))]
  const starts = leaves.map((l) => l.actualStart).filter((d): d is Date => d !== null)
  const ends = leaves.map((l) => l.actualEnd).filter((d): d is Date => d !== null)
  const span = starts.length && ends.length ? { from: new Date(Math.min(...starts.map((d) => d.getTime()))), to: new Date(Math.max(...ends.map((d) => d.getTime()))) } : null

  const [activity, others, pbis] = await Promise.all([
    leafIds.length
      ? db.activityLog.findMany({ where: { projectId, entityType: "plan_item", entityId: { in: leafIds } }, select: { entityId: true, diff: true, createdAt: true }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] })
      : [],
    ownerIds.length && span
      ? db.planItem.findMany({
          where: {
            ownerId: { in: ownerIds },
            deletedAt: null,
            actualStart: { not: null, lte: span.to },
            actualEnd: { not: null, gte: span.from },
            children: { none: { deletedAt: null } },
          },
          select: { id: true, ownerId: true, actualStart: true, actualEnd: true },
          orderBy: { id: "asc" },
          take: OWNER_INTERVALS_MAX + 1,
        })
      : [],
    leafIds.length ? db.productBacklogItem.findMany({ where: { planItemId: { in: leafIds }, deletedAt: null }, select: { id: true, planItemId: true } }) : [],
  ])
  const ownerIntervalsIncomplete = others.length > OWNER_INTERVALS_MAX
  if (ownerIntervalsIncomplete) log.warn("owner spans over the read limit; owner concurrency left unknown", { projectId, limit: OWNER_INTERVALS_MAX })

  const history = new Map<string, StatusChange[]>()
  const unreadableHistory = new Set<string>()
  for (const a of activity) {
    const change = statusChangeOf(a.diff)
    if (change === "unreadable") {
      unreadableHistory.add(a.entityId)
      continue
    }
    if (!change) continue
    const list = history.get(a.entityId) ?? []
    list.push({ at: tokyoDateKey(a.createdAt), ...change })
    history.set(a.entityId, list)
  }
  if (unreadableHistory.size) log.warn("unreadable plan status history rows; on-hold days left unknown for those leaves", { projectId, leaves: unreadableHistory.size })

  const pbiIds = pbis.map((p) => p.id)
  const [tasks, links, pbiActivity] = await Promise.all([
    pbiIds.length ? db.sprintBacklogItem.findMany({ where: { pbItemId: { in: pbiIds } }, select: { pbItemId: true, estimatedHours: true, actualHours: true, _count: { select: { carriedCopies: true } } } }) : [],
    pbiIds.length
      ? db.gitLink.findMany({ where: { backlogItemId: { in: pbiIds }, kind: "mr" }, select: { backlogItemId: true, repositoryId: true, state: true, openedAt: true, mergedAt: true, versionCount: true, additions: true, deletions: true } })
      : [],
    pbiIds.length ? db.activityLog.findMany({ where: { projectId, entityType: "pbi", entityId: { in: pbiIds } }, select: { entityId: true, diff: true }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] }) : [],
  ])
  const pbisByLeaf = groupBy(pbis, (p) => p.planItemId)
  const tasksByPbi = groupBy(tasks, (t) => t.pbItemId)
  const linksByPbi = groupBy(links, (l) => l.backlogItemId)
  const pbiActivityById = groupBy(pbiActivity, (a) => a.entityId)
  const othersByOwner = groupBy(others.slice(0, OWNER_INTERVALS_MAX), (o) => o.ownerId)

  const repoInputs: RepoInput[] = repos.map((r) => ({ repositoryId: r.id, repositoryRef: r.repoPath, readable: repositoryReadable(r) }))
  const actualEndById = new Map(rows.map((r) => [r.id, dayKey(r.actualEnd)]))
  for (const r of repoInputs) if (!r.readable) issues.push({ kind: "repository_unreadable", repositoryRef: r.repositoryRef })

  const items: CollectedItem[] = leaves.map((l) => {
    const fromSchedule = l.templateKey && byKey ? byKey.get(l.templateKey) : undefined
    const parent = l.parentId ? byId.get(l.parentId) : undefined
    const leaf: LeafInput = {
      planItemId: l.id,
      templateKey: l.templateKey,
      name: l.name,
      parentKey: parent?.templateKey ?? null,
      isMilestone: l.isMilestone,
      templateDays: fromSchedule?.durationDays ?? l.durationDays ?? null,
      baselineStart: dayKey(l.baselineStart),
      baselineEnd: dayKey(l.baselineEnd),
      plannedStart: dayKey(l.plannedStart),
      plannedEnd: dayKey(l.plannedEnd),
      actualStart: dayKey(l.actualStart),
      actualEnd: dayKey(l.actualEnd),
      ownerId: l.ownerId,
      role: fromSchedule?.role ?? null,
      status: l.status,
      predecessorIds: (preds.get(l.id) ?? []).map((d) => d.predecessorId),
    }
    const ownerIntervals = l.ownerId
      ? (othersByOwner.get(l.ownerId) ?? []).filter((o) => o.id !== l.id).map((o) => ({ start: dayKey(o.actualStart) as string, end: dayKey(o.actualEnd) as string }))
      : []
    const actuals = computeLeafActuals(leaf, {
      skipWeekends,
      actualEndById,
      statusHistory: history.get(l.id) ?? [],
      historyUnreadable: unreadableHistory.has(l.id),
      ownerIntervals,
      ownerIntervalsIncomplete,
    })
    issues.push(...actuals.issues)
    const leafPbis = (pbisByLeaf.get(l.id) ?? []).map((p) => {
      const hours = pbiHours((tasksByPbi.get(p.id) ?? []).map((t) => ({ estimatedHours: t.estimatedHours, actualHours: t.actualHours, hasCarriedCopy: t._count.carriedCopies > 0 })))
      const changes = (pbiActivityById.get(p.id) ?? []).map((a) => statusChangeOf(a.diff)).filter((c): c is { from: string | null; to: string | null } => c !== null && c !== "unreadable")
      return { backlogItemId: p.id, ...hours, reworkCount: pbiReopenCount(changes), mr: pbiMrFacts(linksByPbi.get(p.id) ?? [], repoInputs) }
    })
    return { leaf, actuals, pbis: leafPbis }
  })

  const endKeys = items.map((i) => i.leaf.actualEnd).filter((e): e is string => e !== null)
  return {
    projectType: project.projectType,
    lineage: load?.lineage ?? `manual:${projectId}`,
    scheduleLoadId: load?.id ?? null,
    scheduleHash: load?.scheduleHash ?? null,
    skipWeekends,
    closedAt: endKeys.length ? dateKeyOf(Math.max(...endKeys.map(dayNumber))) : null,
    repoCount: repos.length,
    items,
    issues,
  }
}
