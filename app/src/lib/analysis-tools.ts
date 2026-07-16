import { prisma } from "@/lib/prisma"
import type { ToolDefinition, ToolHandler, ToolHandlerArgs } from "@/lib/chat-tools-types"

/**
 * Pre-built analysis tools for the chat LLM (MCP-style).
 *
 * Each tool runs a DETERMINISTIC aggregation in TypeScript/Prisma and returns
 * a compact JSON string. The model is instructed to quote numbers verbatim
 * from these results instead of computing them itself — this is the core of
 * the anti-hallucination design: the LLM narrates, the code calculates.
 *
 * Output guards (keep results well under the chat num_ctx budget):
 * - lists are capped (top-N) and long text fields truncated
 * - every payload carries `as_of` so the model can state data freshness
 */

const now = () => new Date()
const iso = (d: Date) => d.toISOString().slice(0, 10)

function trunc(s: string | null | undefined, max: number): string {
  if (!s) return ""
  const t = s.trim().replace(/\s+/g, " ")
  return t.length <= max ? t : t.slice(0, max) + "…"
}

/** Split the comma-separated assignee field used by SprintBacklogItem. */
function splitAssignees(assignee: string | null): string[] {
  return (assignee ?? "").split(",").map((a) => a.trim()).filter(Boolean)
}

const isRealTask = (t: { taskName: string | null }) =>
  (t.taskName ?? "").trim().length > 0

/** Days between two dates, floored; negative = past. */
function daysUntil(d: Date): number {
  return Math.floor((d.getTime() - now().getTime()) / 86_400_000)
}

/**
 * Resolve the target sprint: by name substring when given, otherwise
 * active → planning → most recently started.
 */
async function resolveSprint(projectId: string, sprintName?: string) {
  if (sprintName) {
    return prisma.sprint.findFirst({
      where: { projectId, sprintName: { contains: sprintName } },
      orderBy: { startDate: "desc" },
    })
  }
  const byStatus = await prisma.sprint.findMany({
    where: { projectId, status: { in: ["active", "planning"] } },
    orderBy: { startDate: "desc" },
  })
  const active = byStatus.find((s) => s.status === "active")
  if (active) return active
  if (byStatus[0]) return byStatus[0]
  return prisma.sprint.findFirst({
    where: { projectId },
    orderBy: { startDate: "desc" },
  })
}

const STALLED_DAYS = 3

export const ANALYSIS_TOOL_DEFS: ToolDefinition[] = [
  {
    type: "function",
    function: {
      name: "get_sprint_metrics",
      description:
        "Compute exact progress metrics for one sprint (default: the current active/planning sprint): capacity vs committed vs completed story points, task counts by status, per-PBI progress, per-assignee counts, stalled in-progress tasks, and days remaining. Use for questions like 'how is the sprint going', 'are we on track', 'what is delayed'.",
      parameters: {
        type: "object",
        properties: {
          sprint_name: {
            type: "string",
            description: "Optional sprint name (substring match). Omit for the current sprint.",
          },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_velocity_history",
      description:
        "Return the completion history of past (done/archived) sprints: capacity, actual score, consumption rate, and task completion ratio per sprint, plus averages. Use for velocity/trend questions and for estimating a reasonable capacity for the next sprint.",
      parameters: {
        type: "object",
        properties: {
          limit: { type: "number", description: "Max sprints to include (default 6, newest first)." },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_backlog_summary",
      description:
        "Aggregate the product backlog: item counts and story-point totals by status (ready / not_ready / completed) and by epic, how many ready items are already adopted into an open sprint, and quality flags (items missing user story, acceptance criteria, or estimate). Use for 'backlog health', 'what is ready', 'quality of PBIs' questions.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "get_member_workload",
      description:
        "Break down task load per assignee for the current (or named) sprint: task counts by status and estimated/actual point sums, plus the number of unassigned tasks. Use for 'who is overloaded', 'is work balanced', 'who is free' questions.",
      parameters: {
        type: "object",
        properties: {
          sprint_name: {
            type: "string",
            description: "Optional sprint name (substring match). Omit for the current sprint.",
          },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "search_work_items",
      description:
        "Keyword search across backlog items (PBI), icebox requests, and sprint tasks in this project. Returns type, id, title, and status for up to 20 matches. Use when the user references a work item by topic or partial name, e.g. 'what happened to the login feature'.",
      parameters: {
        type: "object",
        properties: {
          keyword: { type: "string", description: "Search keyword (matched against titles/描述 fields)." },
        },
        required: ["keyword"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_backlog_items",
      description:
        "List existing product backlog items compactly (id, status, story points, epic, title). Use to check for duplicates before proposing new PBIs, to align epic names, or when the user asks to enumerate backlog items.",
      parameters: {
        type: "object",
        properties: {
          status: {
            type: "string",
            description: "Filter: ready | not_ready | completed | all (default all).",
          },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_estimation_reference",
      description:
        "Story-point calibration data from this team's own history: completed-sprint velocity, the distribution of story points across completed PBIs, and example completed PBIs per SP value. Use when estimating a new PBI's workloadScore or judging whether an estimate is realistic.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "get_daily_scrum_summary",
      description:
        "Return recent Daily Scrum notes (date, author, content excerpt) for the current or named sprint. Use for 'recent blockers', 'what did the team report', 'daily standup summary' questions.",
      parameters: {
        type: "object",
        properties: {
          days: { type: "number", description: "Look-back window in days (default 7)." },
          sprint_name: {
            type: "string",
            description: "Optional sprint name (substring match). Omit for the current sprint.",
          },
        },
      },
    },
  },
]

export const analysisHandlers: Record<string, ToolHandler> = {
  async get_sprint_metrics({ projectId, args }: ToolHandlerArgs) {
    const sprint = await resolveSprint(
      projectId,
      typeof args.sprint_name === "string" ? args.sprint_name : undefined
    )
    if (!sprint) return JSON.stringify({ error: "no sprint found in this project" })

    const items = await prisma.sprintBacklogItem.findMany({
      where: { sprintId: sprint.id },
      include: {
        pbItem: { select: { id: true, displayId: true, initiative: true, userStory: true, workloadScore: true } },
      },
    })

    // Committed = sum of unique PBI story points (same rule as the UI gauge).
    const pbiMap = new Map<string, {
      displayId: number; title: string; sp: number
      total: number; done: number; inProgress: number
      estSum: number; actSum: number
    }>()
    const statusCount = { todo: 0, in_progress: 0, done: 0 }
    const assigneeCount = new Map<string, number>()
    const stalled: { task: string; assignee: string; idleDays: number }[] = []
    const cutoff = now().getTime() - STALLED_DAYS * 86_400_000

    for (const it of items) {
      const pb = it.pbItem
      if (!pbiMap.has(pb.id)) {
        pbiMap.set(pb.id, {
          displayId: pb.displayId,
          title: trunc(pb.initiative || pb.userStory, 60) || "(untitled)",
          sp: pb.workloadScore,
          total: 0, done: 0, inProgress: 0, estSum: 0, actSum: 0,
        })
      }
      if (!isRealTask(it)) continue
      const entry = pbiMap.get(pb.id)!
      entry.total++
      entry.estSum += it.estimatedHours ?? 0
      entry.actSum += it.actualHours ?? 0
      if (it.status === "done") entry.done++
      else if (it.status === "in_progress") entry.inProgress++
      if (it.status in statusCount) statusCount[it.status as keyof typeof statusCount]++
      for (const a of splitAssignees(it.assignee)) {
        assigneeCount.set(a, (assigneeCount.get(a) ?? 0) + 1)
      }
      if (it.status === "in_progress" && it.updatedAt.getTime() < cutoff) {
        stalled.push({
          task: trunc(it.taskName, 50),
          assignee: splitAssignees(it.assignee).join(", ") || "(unassigned)",
          idleDays: Math.floor((now().getTime() - it.updatedAt.getTime()) / 86_400_000),
        })
      }
    }

    const pbis = Array.from(pbiMap.values())
    const committedSp = pbis.reduce((s, p) => s + p.sp, 0)
    // Completed SP grows with per-PBI task completion ratio (matches UI).
    const completedSp = pbis.reduce(
      (s, p) => s + (p.total > 0 ? (p.sp * p.done) / p.total : 0), 0
    )

    return JSON.stringify({
      as_of: iso(now()),
      sprint: {
        name: sprint.sprintName,
        status: sprint.status,
        period: `${iso(sprint.startDate)}..${iso(sprint.endDate)}`,
        days_remaining: daysUntil(sprint.endDate),
        goal: trunc(sprint.sprintGoal, 120) || null,
      },
      story_points: {
        capacity: sprint.capacity,
        committed: committedSp,
        completed: Math.round(completedSp * 10) / 10,
        completion_rate_pct: committedSp > 0 ? Math.round((completedSp / committedSp) * 100) : null,
        over_capacity: committedSp > sprint.capacity,
      },
      tasks: statusCount,
      per_pbi: pbis.map((p) => ({
        id: `#${p.displayId}`, title: p.title, sp: p.sp,
        tasks_done: `${p.done}/${p.total}`, in_progress: p.inProgress,
        est_sum: p.estSum, act_sum: p.actSum,
      })),
      per_assignee_task_count: Object.fromEntries(assigneeCount),
      stalled_tasks: stalled.slice(0, 10),
      stalled_rule: `in_progress & no update for >=${STALLED_DAYS} days`,
    })
  },

  async get_velocity_history({ projectId, args }: ToolHandlerArgs) {
    const limit = Math.min(Math.max(Number(args.limit) || 6, 1), 12)
    const sprints = await prisma.sprint.findMany({
      where: { projectId, status: { in: ["done", "archived"] } },
      orderBy: { startDate: "desc" },
      take: limit,
      include: { items: { select: { taskName: true, status: true } } },
    })
    if (sprints.length === 0) {
      return JSON.stringify({ as_of: iso(now()), sprints: [], note: "no completed sprints yet" })
    }
    const rows = sprints.map((s) => {
      const real = s.items.filter(isRealTask)
      const done = real.filter((t) => t.status === "done").length
      return {
        name: s.sprintName,
        period: `${iso(s.startDate)}..${iso(s.endDate)}`,
        capacity: s.capacity,
        actual_score: s.actualScore,
        consumption_pct: s.capacity > 0 ? Math.round((s.actualScore / s.capacity) * 100) : null,
        tasks_done: `${done}/${real.length}`,
        has_retrospective: Boolean(s.retrospectiveKeep || s.retrospectiveProblem || s.retrospectiveTry || s.retrospectiveMemo),
      }
    })
    const avgScore = Math.round(rows.reduce((x, r) => x + r.actual_score, 0) / rows.length)
    return JSON.stringify({
      as_of: iso(now()),
      sprints: rows,
      average_actual_score: avgScore,
      note: "newest first; average_actual_score is a velocity hint for next-sprint capacity",
    })
  },

  async get_backlog_summary({ projectId }: ToolHandlerArgs) {
    const items = await prisma.productBacklogItem.findMany({
      where: { projectId },
      select: {
        displayId: true, initiative: true, epic: true, userStory: true,
        acceptanceCriteria: true, workloadScore: true, status: true,
        sprintItems: {
          where: { sprint: { status: { in: ["planning", "active"] } } },
          select: { sprintId: true },
        },
      },
    })
    const byStatus: Record<string, { count: number; sp: number }> = {}
    const byEpic: Record<string, { count: number; sp: number }> = {}
    const flags = { missing_user_story: 0, missing_acceptance_criteria: 0, missing_estimate: 0 }
    const flaggedIds: string[] = []
    let readyAdopted = 0
    let readyWaiting = 0

    for (const b of items) {
      const st = (byStatus[b.status] ??= { count: 0, sp: 0 })
      st.count++; st.sp += b.workloadScore
      const epicKey = b.epic?.trim() || "(no epic)"
      const ep = (byEpic[epicKey] ??= { count: 0, sp: 0 })
      ep.count++; ep.sp += b.workloadScore

      if (b.status !== "completed") {
        let flagged = false
        if (!b.userStory?.trim()) { flags.missing_user_story++; flagged = true }
        if (!b.acceptanceCriteria?.trim()) { flags.missing_acceptance_criteria++; flagged = true }
        if (b.workloadScore === 0) { flags.missing_estimate++; flagged = true }
        if (flagged && flaggedIds.length < 10) flaggedIds.push(`#${b.displayId}`)
      }
      if (b.status === "ready") {
        if (b.sprintItems.length > 0) readyAdopted++
        else readyWaiting++
      }
    }

    return JSON.stringify({
      as_of: iso(now()),
      total_items: items.length,
      by_status: byStatus,
      by_epic: byEpic,
      ready_items: { adopted_in_open_sprint: readyAdopted, waiting: readyWaiting },
      quality_flags: flags,
      flagged_item_ids: flaggedIds,
      note: "sp = story points sum; quality flags exclude completed items",
    })
  },

  async get_member_workload({ projectId, args }: ToolHandlerArgs) {
    const sprint = await resolveSprint(
      projectId,
      typeof args.sprint_name === "string" ? args.sprint_name : undefined
    )
    if (!sprint) return JSON.stringify({ error: "no sprint found in this project" })
    const items = await prisma.sprintBacklogItem.findMany({
      where: { sprintId: sprint.id },
      select: { taskName: true, assignee: true, status: true, estimatedHours: true, actualHours: true },
    })
    const per = new Map<string, { todo: number; in_progress: number; done: number; est: number; act: number }>()
    let unassigned = 0
    for (const it of items) {
      if (!isRealTask(it)) continue
      const names = splitAssignees(it.assignee)
      if (names.length === 0) { unassigned++; continue }
      for (const n of names) {
        const e = per.get(n) ?? { todo: 0, in_progress: 0, done: 0, est: 0, act: 0 }
        if (it.status === "todo") e.todo++
        else if (it.status === "in_progress") e.in_progress++
        else if (it.status === "done") e.done++
        // Split shared estimates evenly across co-assignees.
        e.est += (it.estimatedHours ?? 0) / names.length
        e.act += (it.actualHours ?? 0) / names.length
        per.set(n, e)
      }
    }
    const members = Object.fromEntries(
      Array.from(per.entries()).map(([n, e]) => [n, {
        ...e, est: Math.round(e.est * 10) / 10, act: Math.round(e.act * 10) / 10,
        open: e.todo + e.in_progress,
      }])
    )
    return JSON.stringify({
      as_of: iso(now()),
      sprint: { name: sprint.sprintName, status: sprint.status },
      members,
      unassigned_tasks: unassigned,
      note: "est/act are point sums (shared tasks split evenly); open = todo + in_progress",
    })
  },

  async search_work_items({ projectId, args }: ToolHandlerArgs) {
    const keyword = typeof args.keyword === "string" ? args.keyword.trim() : ""
    if (!keyword) return JSON.stringify({ error: "keyword is required" })
    const LIMIT = 20

    const [pbis, icebox, tasks] = await Promise.all([
      prisma.productBacklogItem.findMany({
        where: {
          projectId,
          OR: [
            { initiative: { contains: keyword } },
            { epic: { contains: keyword } },
            { userStory: { contains: keyword } },
          ],
        },
        select: { displayId: true, initiative: true, userStory: true, status: true, workloadScore: true },
        take: LIMIT,
      }),
      prisma.iceboxItem.findMany({
        where: {
          projectId,
          OR: [{ request: { contains: keyword } }, { background: { contains: keyword } }],
        },
        select: { displayId: true, request: true, status: true, author: true },
        take: LIMIT,
      }),
      prisma.sprintBacklogItem.findMany({
        where: {
          sprint: { projectId },
          taskName: { contains: keyword },
        },
        select: {
          taskName: true, status: true, assignee: true,
          sprint: { select: { sprintName: true, status: true } },
          pbItem: { select: { displayId: true } },
        },
        take: LIMIT,
      }),
    ])

    const results = [
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
        assignee: splitAssignees(t.assignee).join(", ") || null,
        title: trunc(t.taskName, 80),
      })),
    ].slice(0, LIMIT)

    return JSON.stringify({
      as_of: iso(now()),
      keyword,
      hit_count: results.length,
      results,
      note: results.length === LIMIT ? `capped at ${LIMIT}; refine the keyword for more precision` : undefined,
    })
  },

  async list_backlog_items({ projectId, args }: ToolHandlerArgs) {
    const statusArg = typeof args.status === "string" ? args.status : "all"
    const where: Record<string, unknown> = { projectId }
    if (statusArg === "ready" || statusArg === "not_ready" || statusArg === "completed") {
      where.status = statusArg
    }
    const items = await prisma.productBacklogItem.findMany({
      where,
      orderBy: [{ status: "asc" }, { sortOrder: "asc" }],
      take: 40,
      select: {
        displayId: true, status: true, workloadScore: true,
        epic: true, initiative: true, userStory: true,
      },
    })
    return JSON.stringify({
      as_of: iso(now()),
      count: items.length,
      items: items.map((b) => ({
        id: `#${b.displayId}`,
        status: b.status,
        sp: b.workloadScore,
        epic: b.epic?.trim() || null,
        title: trunc(b.initiative || b.userStory, 70) || "(untitled)",
      })),
      note: items.length === 40 ? "capped at 40 items" : undefined,
    })
  },

  async get_estimation_reference({ projectId }: ToolHandlerArgs) {
    // Velocity from completed sprints (same basis as get_velocity_history).
    const doneSprints = await prisma.sprint.findMany({
      where: { projectId, status: { in: ["done", "archived"] } },
      orderBy: { startDate: "desc" },
      take: 6,
      select: { sprintName: true, capacity: true, actualScore: true },
    })
    const avgVelocity = doneSprints.length > 0
      ? Math.round(doneSprints.reduce((s, x) => s + x.actualScore, 0) / doneSprints.length)
      : null

    // SP distribution + examples from PBIs that actually reached completion —
    // the team's own sense of "what an SP=N item looks like".
    const completedPbis = await prisma.productBacklogItem.findMany({
      where: { projectId, status: "completed" },
      orderBy: { completedAt: "desc" },
      take: 60,
      select: { displayId: true, workloadScore: true, initiative: true, userStory: true },
    })
    const bySp = new Map<number, { count: number; examples: string[] }>()
    for (const b of completedPbis) {
      const e = bySp.get(b.workloadScore) ?? { count: 0, examples: [] }
      e.count++
      if (e.examples.length < 3) {
        e.examples.push(`#${b.displayId} ${trunc(b.initiative || b.userStory, 50)}`)
      }
      bySp.set(b.workloadScore, e)
    }
    const distribution = Array.from(bySp.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([sp, e]) => ({ sp, completed_count: e.count, examples: e.examples }))

    return JSON.stringify({
      as_of: iso(now()),
      velocity: {
        completed_sprints: doneSprints.length,
        average_actual_score_per_sprint: avgVelocity,
      },
      completed_pbi_sp_distribution: distribution,
      point_scale: [0, 1, 2, 3, 5, 8, 13, 21],
      note: distribution.length === 0
        ? "no completed PBIs yet — estimate from general agile experience and say so"
        : "calibrate new estimates against these completed examples (similar size → similar SP)",
    })
  },

  async get_daily_scrum_summary({ projectId, args }: ToolHandlerArgs) {
    const sprint = await resolveSprint(
      projectId,
      typeof args.sprint_name === "string" ? args.sprint_name : undefined
    )
    if (!sprint) return JSON.stringify({ error: "no sprint found in this project" })
    const days = Math.min(Math.max(Number(args.days) || 7, 1), 30)
    const since = new Date(now().getTime() - days * 86_400_000)
    const notes = await prisma.dailyScrumNote.findMany({
      where: { sprintId: sprint.id, archivedAt: null, date: { gte: since } },
      orderBy: { date: "desc" },
      take: 20,
    })
    return JSON.stringify({
      as_of: iso(now()),
      sprint: { name: sprint.sprintName, status: sprint.status },
      window_days: days,
      note_count: notes.length,
      notes: notes.map((n) => ({
        date: iso(n.date),
        author: n.author || null,
        content: trunc(n.content, 300),
      })),
    })
  },
}
