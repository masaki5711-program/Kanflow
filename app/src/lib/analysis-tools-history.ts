import { prisma } from "@/lib/prisma"
import { LIVE_PBI, NOT_DELETED } from "@/services/_shared/soft-delete"
import type { ToolDefinition, ToolHandler } from "@/lib/chat-tools-types"
import {
  DAY_MS, daysBetween, findSimilarPairs, intArg, isRealTask, iso, now, parseDisplayId, pct, round1, strArg, trunc,
} from "@/lib/tool-helpers"

/**
 * History pack (P3): sprint comparison, activity log, comments, Icebox triage.
 * Same contract as analysis-tools.ts (deterministic, capped, projectId-scoped,
 * trashed PBIs / Icebox items / deleted comments excluded).
 */

export const HISTORY_TOOL_DEFS: ToolDefinition[] = [
  {
    type: "function",
    function: {
      name: "compare_sprints",
      description:
        "Compare sprints side by side: committed vs completed story points (velocity), task completion rate, carry-over PBIs (unfinished and pulled into a later sprint), and scope change (tasks added after the sprint started). Give two sprints, or last_n for the most recent N.",
      parameters: {
        type: "object",
        properties: {
          sprint_a: { type: "string", description: "Sprint id or name (substring)." },
          sprint_b: { type: "string", description: "Second sprint id or name (substring)." },
          last_n: { type: "number", description: "Compare the most recent N sprints instead (2-6, default 2)." },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_recent_activity",
      description:
        "Change history of the project in a recent window: counts by action, entity type and person, plus the latest changes. Use for 'what changed this week', 'who has been updating what'.",
      parameters: {
        type: "object",
        properties: {
          days: { type: "number", description: "Look-back window in days (default 7, max 30)." },
          limit: { type: "number", description: "Latest entries to list (default 15, max 30)." },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_comments",
      description:
        "Newest comments on one PBI, sprint task or Icebox request (deleted comments excluded). Identify a PBI / Icebox item by its #number, a task by task_id or task_name.",
      parameters: {
        type: "object",
        properties: {
          entity: { type: "string", description: "pbi | task | icebox" },
          id: { type: "string", description: "#number for pbi/icebox, or the task id." },
          task_name: { type: "string", description: "For entity=task when the id is unknown (substring)." },
          limit: { type: "number", description: "Max comments (default 10, max 30)." },
        },
        required: ["entity"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "triage_icebox",
      description:
        "Triage the Icebox (idea box): open requests with age in days and PO flag, oldest first, plus likely duplicates (similar titles within the Icebox or against existing PBIs). Use for 'what should we review in the icebox', 'are there duplicate requests'.",
      parameters: {
        type: "object",
        properties: {
          limit: { type: "number", description: "Max requests to list (default 20, max 50)." },
        },
      },
    },
  },
]

// ── compare_sprints ─────────────────────────────────────────────────────────

export interface CompareSprint {
  id: string
  sprintName: string
  status: string
  startDate: Date
  endDate: Date
  capacity: number
  actualScore: number
}

export interface CompareTask {
  sprintId: string
  pbItemId: string
  taskName: string | null
  status: string
  createdAt: Date
  sp: number
}

/** PBI id → start dates of every sprint that contains it (for carry-over). */
export type PbiSprintStarts = ReadonlyMap<string, readonly number[]>

/** Tasks created later than this after the sprint start count as scope change. */
const SCOPE_GRACE_MS = DAY_MS

/** Pure: per-sprint comparison rows (same completed-SP rule as get_sprint_metrics). */
export function compareSprintRows(sprints: readonly CompareSprint[], tasks: readonly CompareTask[], later: PbiSprintStarts) {
  return sprints.map((s) => {
    const own = tasks.filter((t) => t.sprintId === s.id)
    const pbis = new Map<string, { sp: number; total: number; done: number }>()
    for (const t of own) {
      const e = pbis.get(t.pbItemId) ?? { sp: t.sp, total: 0, done: 0 }
      if (isRealTask(t)) {
        e.total++
        if (t.status === "done") e.done++
      }
      pbis.set(t.pbItemId, e)
    }
    const committed = Array.from(pbis.values()).reduce((x, p) => x + p.sp, 0)
    const completed = Array.from(pbis.values()).reduce((x, p) => x + (p.total > 0 ? (p.sp * p.done) / p.total : 0), 0)
    const real = own.filter(isRealTask)
    const doneTasks = real.filter((t) => t.status === "done").length
    const unfinished = Array.from(pbis.entries()).filter(([, p]) => p.total === 0 || p.done < p.total)
    const carried = unfinished.filter(([pbId]) => (later.get(pbId) ?? []).some((start) => start > s.startDate.getTime()))
    const added = real.filter((t) => t.createdAt.getTime() > s.startDate.getTime() + SCOPE_GRACE_MS)
    return {
      id: s.id,
      name: s.sprintName,
      status: s.status,
      period: `${iso(s.startDate)}..${iso(s.endDate)}`,
      capacity: s.capacity,
      committed_sp: committed,
      completed_sp: round1(completed),
      recorded_actual_score: s.actualScore,
      sp_completion_pct: pct(completed, committed),
      tasks_done: `${doneTasks}/${real.length}`,
      task_completion_pct: pct(doneTasks, real.length),
      pbi_count: pbis.size,
      carry_over_pbis: carried.length,
      scope_change: { tasks_added_after_start: added.length },
    }
  })
}

async function resolveCompareSprints(projectId: string, args: Record<string, unknown>) {
  const select = { id: true, sprintName: true, status: true, startDate: true, endDate: true, capacity: true, actualScore: true } as const
  const a = strArg(args.sprint_a, 100)
  const b = strArg(args.sprint_b, 100)
  if (a && b) {
    const find = (ref: string) =>
      prisma.sprint.findFirst({
        where: { projectId, OR: [{ id: ref }, { sprintName: { contains: ref } }] },
        orderBy: { startDate: "desc" },
        select,
      })
    const [sa, sb] = await Promise.all([find(a), find(b)])
    if (!sa || !sb) return { error: `sprint not found in this project: ${!sa ? a : b}` }
    return { sprints: [sa, sb] }
  }
  const n = intArg(args.last_n, 2, 2, 6)
  const sprints = await prisma.sprint.findMany({
    where: { projectId, status: { not: "planning" } },
    orderBy: { startDate: "desc" },
    take: n,
    select,
  })
  if (sprints.length < 2) return { error: "need at least two started sprints to compare" }
  return { sprints }
}

// ── get_recent_activity ─────────────────────────────────────────────────────

export interface ActivityRow {
  entityType: string
  entityId: string
  action: string
  actorName: string | null
  diff: string | null
  createdAt: Date
}

const ACTIVITY_SCAN_CAP = 1000

function diffSummary(diff: string | null): { label: string | null; fields: string[] } {
  if (!diff) return { label: null, fields: [] }
  try {
    const d = JSON.parse(diff) as { label?: unknown; changes?: Record<string, unknown> }
    return {
      label: typeof d.label === "string" ? trunc(d.label, 60) : null,
      fields: d.changes && typeof d.changes === "object" ? Object.keys(d.changes).slice(0, 6) : [],
    }
  } catch {
    return { label: null, fields: [] }
  }
}

function countBy<T>(rows: readonly T[], key: (r: T) => string): Record<string, number> {
  const out: Record<string, number> = {}
  for (const r of rows) out[key(r)] = (out[key(r)] ?? 0) + 1
  return out
}

/** Pure: counts + latest entries (rows are newest first). */
export function summarizeActivity(rows: readonly ActivityRow[], limit: number) {
  const byActor = Object.entries(countBy(rows, (r) => r.actorName || "(system)"))
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
  return {
    total: rows.length,
    by_action: countBy(rows, (r) => r.action),
    by_entity: countBy(rows, (r) => r.entityType),
    top_actors: Object.fromEntries(byActor),
    latest: rows.slice(0, limit).map((r) => {
      const d = diffSummary(r.diff)
      return {
        at: r.createdAt.toISOString().slice(0, 16).replace("T", " "),
        actor: r.actorName || "(system)",
        action: r.action,
        entity: r.entityType,
        label: d.label,
        fields: d.fields.length > 0 ? d.fields : undefined,
      }
    }),
  }
}

// ── get_comments ────────────────────────────────────────────────────────────

type CommentTarget = { entityType: "pbi" | "sprint_task" | "icebox"; entityId: string; label: string }

async function resolveCommentTarget(projectId: string, args: Record<string, unknown>): Promise<CommentTarget | { error: string }> {
  const entity = strArg(args.entity, 20)
  if (entity === "pbi" || entity === "icebox") {
    const displayId = parseDisplayId(args.id)
    if (displayId === null) return { error: `id must be the ${entity} #number` }
    if (entity === "pbi") {
      const row = await prisma.productBacklogItem.findFirst({
        where: { projectId, displayId, ...NOT_DELETED },
        select: { id: true, initiative: true, userStory: true },
      })
      return row ? { entityType: "pbi", entityId: row.id, label: `PBI #${displayId} ${trunc(row.initiative || row.userStory, 50)}` } : { error: `PBI #${displayId} not found` }
    }
    const row = await prisma.iceboxItem.findFirst({ where: { projectId, displayId, ...NOT_DELETED }, select: { id: true, request: true } })
    return row ? { entityType: "icebox", entityId: row.id, label: `Icebox #${displayId} ${trunc(row.request, 50)}` } : { error: `Icebox #${displayId} not found` }
  }
  if (entity === "task") {
    const taskId = strArg(args.id, 64)
    const name = strArg(args.task_name, 100)
    if (!taskId && !name) return { error: "task needs id or task_name" }
    const rows = await prisma.sprintBacklogItem.findMany({
      where: { sprint: { projectId }, ...LIVE_PBI, ...(taskId ? { id: taskId } : { taskName: { contains: name } }) },
      select: { id: true, taskName: true },
      take: 5,
    })
    if (rows.length === 0) return { error: "task not found" }
    if (rows.length > 1) return { error: `ambiguous task name; candidates: ${rows.map((r) => `${r.id} "${trunc(r.taskName, 40)}"`).join(", ")}` }
    return { entityType: "sprint_task", entityId: rows[0].id, label: `Task ${trunc(rows[0].taskName, 50)}` }
  }
  return { error: "entity must be pbi | task | icebox" }
}

// ── triage_icebox ───────────────────────────────────────────────────────────

const OPEN_ICEBOX = ["unreviewed", "reviewed"]
const DUPLICATE_THRESHOLD = 0.6

// ── handlers ────────────────────────────────────────────────────────────────

export const historyHandlers: Record<string, ToolHandler> = {
  async compare_sprints({ projectId, args }) {
    const resolved = await resolveCompareSprints(projectId, args)
    if ("error" in resolved) return JSON.stringify({ error: resolved.error })
    const sprints = [...resolved.sprints].sort((x, y) => x.startDate.getTime() - y.startDate.getTime())
    const items = await prisma.sprintBacklogItem.findMany({
      where: { sprintId: { in: sprints.map((s) => s.id) }, ...LIVE_PBI },
      select: { sprintId: true, pbItemId: true, taskName: true, status: true, createdAt: true, pbItem: { select: { workloadScore: true } } },
    })
    const tasks: CompareTask[] = items.map((t) => ({ ...t, sp: t.pbItem.workloadScore }))
    const pbIds = Array.from(new Set(tasks.map((t) => t.pbItemId)))
    const appearances = pbIds.length === 0 ? [] : await prisma.sprintBacklogItem.findMany({
      where: { pbItemId: { in: pbIds }, sprint: { projectId } },
      select: { pbItemId: true, sprint: { select: { startDate: true } } },
    })
    const later = new Map<string, number[]>()
    for (const a of appearances) later.set(a.pbItemId, [...(later.get(a.pbItemId) ?? []), a.sprint.startDate.getTime()])
    return JSON.stringify({
      as_of: iso(now()),
      sprints: compareSprintRows(sprints, tasks, later),
      note: "oldest first; completed_sp grows with each PBI's task completion ratio; carry_over = unfinished PBIs that appear in a later sprint; scope change = tasks created >1 day after sprint start",
    })
  },

  async get_recent_activity({ projectId, args }) {
    const days = intArg(args.days, 7, 1, 30)
    const limit = intArg(args.limit, 15, 1, 30)
    const since = new Date(now().getTime() - days * DAY_MS)
    const rows = await prisma.activityLog.findMany({
      where: { projectId, createdAt: { gte: since } },
      orderBy: { createdAt: "desc" },
      take: ACTIVITY_SCAN_CAP,
      select: { entityType: true, entityId: true, action: true, actorName: true, diff: true, createdAt: true },
    })
    return JSON.stringify({
      as_of: iso(now()),
      window_days: days,
      ...summarizeActivity(rows, limit),
      note: rows.length === ACTIVITY_SCAN_CAP ? `counts cover the newest ${ACTIVITY_SCAN_CAP} changes only` : undefined,
    })
  },

  async get_comments({ projectId, args }) {
    const target = await resolveCommentTarget(projectId, args)
    if ("error" in target) return JSON.stringify({ error: target.error })
    const limit = intArg(args.limit, 10, 1, 30)
    const comments = await prisma.comment.findMany({
      where: { projectId, entityType: target.entityType, entityId: target.entityId, deletedAt: null },
      orderBy: { createdAt: "desc" },
      take: limit,
      select: { body: true, createdAt: true, editedAt: true, author: { select: { name: true } } },
    })
    return JSON.stringify({
      as_of: iso(now()),
      target: target.label,
      count: comments.length,
      comments: comments.map((c) => ({
        at: c.createdAt.toISOString().slice(0, 16).replace("T", " "),
        author: c.author.name,
        edited: c.editedAt !== null,
        body: trunc(c.body, 300),
      })),
      note: "newest first",
    })
  },

  async triage_icebox({ projectId, args }) {
    const limit = intArg(args.limit, 20, 1, 50)
    const [items, pbis] = await Promise.all([
      prisma.iceboxItem.findMany({
        where: { projectId, ...NOT_DELETED, status: { in: OPEN_ICEBOX } },
        orderBy: { createdAt: "asc" },
        take: 200,
        select: { displayId: true, request: true, author: true, status: true, poFlag: true, assignedPo: true, createdAt: true },
      }),
      prisma.productBacklogItem.findMany({
        where: { projectId, ...NOT_DELETED },
        orderBy: { createdAt: "desc" },
        take: 200,
        select: { displayId: true, initiative: true, userStory: true },
      }),
    ])
    const today = now()
    const iceTitled = items.map((i) => ({ key: `icebox #${i.displayId}`, title: trunc(i.request, 120) }))
    const pbiTitled = pbis.map((p) => ({ key: `PBI #${p.displayId}`, title: trunc(p.initiative || p.userStory, 120) }))
    const withinIcebox = findSimilarPairs(iceTitled, DUPLICATE_THRESHOLD, 10)
    const againstPbis = findSimilarPairs([...iceTitled, ...pbiTitled], DUPLICATE_THRESHOLD, 40)
      .filter((p) => p.a.startsWith("icebox") !== p.b.startsWith("icebox"))
      .slice(0, 10)
    const ages = items.map((i) => daysBetween(i.createdAt, today))
    return JSON.stringify({
      as_of: iso(today),
      open_count: items.length,
      by_status: Object.fromEntries(OPEN_ICEBOX.map((s) => [s, items.filter((i) => i.status === s).length])),
      average_age_days: ages.length > 0 ? Math.round(ages.reduce((a, b) => a + b, 0) / ages.length) : null,
      items: items.slice(0, limit).map((i, idx) => ({
        id: `#${i.displayId}`,
        status: i.status,
        age_days: ages[idx],
        po_flag: i.poFlag || null,
        assigned_po: i.assignedPo || null,
        author: i.author,
        title: trunc(i.request, 80),
      })),
      likely_duplicates: { within_icebox: withinIcebox, against_pbis: againstPbis },
      note: `oldest first; no vote/priority field exists — po_flag is the PO's marker; duplicates = title similarity ≥ ${DUPLICATE_THRESHOLD} (heuristic, confirm before merging)`,
    })
  },
}
