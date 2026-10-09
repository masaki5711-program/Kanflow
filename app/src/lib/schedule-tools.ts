import { prisma } from "@/lib/prisma"
import { NOT_DELETED } from "@/services/_shared/soft-delete"
import type { ToolDefinition, ToolHandler } from "@/lib/chat-tools-types"
import { PLAN_STATUSES } from "@/lib/plan-progress"
import { templateContentSchema, countNodes, type PlanTemplateContent } from "@/lib/plan-templates/schema"
import {
  PLAN_OP_MAX,
  SHIFT_FOLLOWERS,
  type CreateTemplateProposal,
  type PlanEditProposal,
  type PlanOp,
  type SprintScheduleProposal,
} from "@/lib/chat-proposals"
import { OPEN_SPRINTS, err, proposalIdOf, reply } from "@/lib/proposal-tools"
import { DAY_MS, iso, now, strArg, trunc } from "@/lib/tool-helpers"

/**
 * Schedule pack: look at the schedule (master plan + sprints) and propose
 * changes to it — dates, new stages, sprint period, plan templates. Like the
 * other proposal tools these NEVER write: they validate, do the date
 * arithmetic on the server (the model never adds days itself) and return an
 * approval card (lib/chat-proposals.ts).
 */

export const SCHEDULE_TOOL_DEFS: ToolDefinition[] = [
  {
    type: "function",
    function: {
      name: "list_plan_schedule",
      description:
        "The master plan (全体計画) as a list: each stage with parent, planned start/end, status, milestone flag, whether it is late and what it waits for. Read this before proposing any schedule change. Items are referred to by name.",
      parameters: {
        type: "object",
        properties: { under: { type: "string", description: "Only the stages below this stage name (substring). Optional." } },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_sprint_schedule",
      description: "Sprints with period, status, capacity, planned points and the PBIs in each. Use it to see the sprint calendar before moving anything.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "propose_plan_edit",
      description:
        "Propose edits to the master plan (add stages, change dates/name/status, or shift an item by N days with the stages after it). Up to 20 operations in one approval card. Nothing is written until the user approves. Dates are YYYY-MM-DD.",
      parameters: {
        type: "object",
        properties: {
          operations: {
            type: "array",
            description:
              'Each: {"action":"create","name":"UAT","parent":"Release","start":"2026-11-02","end":"2026-11-06","milestone":false} | {"action":"update","item":"Build","start":"..","end":"..","status":"in_progress","new_name":".."} | {"action":"shift","item":"Test","days":7,"followers":"dependents"}. followers: none | dependents | later. Leave dates out for an undated stage.',
            items: { type: "object", properties: { action: { type: "string" }, item: { type: "string" }, name: { type: "string" } }, required: ["action"] },
          },
          reason: { type: "string", description: "One sentence on why." },
        },
        required: ["operations"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "propose_sprint_schedule",
      description:
        "Propose a new period for a sprint (planning/active/review). Give start and end, or shift_days to move both. Nothing is written until the user approves.",
      parameters: {
        type: "object",
        properties: {
          sprint: { type: "string", description: "Sprint name (substring). Omit for the newest open sprint." },
          start: { type: "string", description: "New start YYYY-MM-DD (optional)." },
          end: { type: "string", description: "New end YYYY-MM-DD (optional)." },
          shift_days: { type: "number", description: "Move the whole sprint by this many days (+ later). Optional." },
          reason: { type: "string", description: "One sentence on why." },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "propose_template",
      description:
        "Propose saving a plan template (計画テンプレート) built in the conversation. Stages nest up to 3 levels. Only call it after the user has agreed to the outline. Nothing is saved until the user approves.",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string", description: "Template name." },
          description: { type: "string", description: "What the template is for (optional)." },
          visibility: { type: "string", description: "private (only me, default) | public (everyone)." },
          stages: {
            type: "array",
            description:
              'Stage tree: [{"name":"Design","duration_days":10,"milestone":false,"description":"..","checklist":["done criterion"],"children":[{...}]}]',
            items: { type: "object", properties: { name: { type: "string" } }, required: ["name"] },
          },
          check_label: { type: "string", description: "Name of the check items, e.g. 検収 (optional)." },
          checks: { type: "array", description: 'Check items: [{"name":"..","criterion":".."}] (optional)', items: { type: "object", properties: { name: { type: "string" } } } },
          documents: { type: "array", description: "Hand-over documents (optional).", items: { type: "string" } },
          reason: { type: "string", description: "One sentence on the purpose." },
        },
        required: ["name", "stages"],
      },
    },
  },
]

// ── dates ───────────────────────────────────────────────────────────────────

const YMD = /^\d{4}-\d{2}-\d{2}$/

/** True for a real calendar day written YYYY-MM-DD. */
export function isYmd(value: unknown): value is string {
  if (typeof value !== "string" || !YMD.test(value)) return false
  const d = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(d.getTime()) && iso(d) === value
}

/** `days` later (negative = earlier) than `ymd`, on UTC calendar days. */
export function addDays(ymd: string, days: number): string {
  return iso(new Date(new Date(`${ymd}T00:00:00Z`).getTime() + days * DAY_MS))
}

const dayOrNull = (d: Date | null): string | null => (d ? iso(d) : null)

// ── reading the schedule ────────────────────────────────────────────────────

const PLAN_ROWS_MAX = 80
const PLAN_NAME_MAX = 60

async function listPlanSchedule(projectId: string, args: Record<string, unknown>): Promise<string> {
  const rows = await prisma.planItem.findMany({
    where: { projectId, ...NOT_DELETED },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    take: 500,
    select: { id: true, parentId: true, name: true, plannedStart: true, plannedEnd: true, status: true, isMilestone: true, progressPct: true },
  })
  const deps = await prisma.planItemDependency.findMany({ where: { projectId }, select: { predecessorId: true, successorId: true } })
  const nameOf = new Map(rows.map((r) => [r.id, r.name]))
  const hasChild = new Set(rows.flatMap((r) => (r.parentId ? [r.parentId] : [])))
  const waitsFor = new Map<string, string[]>()
  for (const d of deps) {
    const pre = nameOf.get(d.predecessorId)
    if (pre) waitsFor.set(d.successorId, [...(waitsFor.get(d.successorId) ?? []), trunc(pre, 40)])
  }
  const under = strArg(args.under, 100)
  let scope = rows
  if (under) {
    const roots = rows.filter((r) => r.name.includes(under)).map((r) => r.id)
    if (roots.length === 0) return err(`no plan stage matches "${under}"`)
    const keep = new Set(roots)
    for (let grew = true; grew; ) {
      grew = false
      for (const r of rows) if (r.parentId && keep.has(r.parentId) && !keep.has(r.id)) { keep.add(r.id); grew = true }
    }
    scope = rows.filter((r) => keep.has(r.id))
  }
  const today = iso(now())
  const items = scope.slice(0, PLAN_ROWS_MAX).map((r) => {
    const end = dayOrNull(r.plannedEnd)
    return {
      name: trunc(r.name, PLAN_NAME_MAX),
      ...(r.parentId && nameOf.has(r.parentId) && { parent: trunc(nameOf.get(r.parentId), 40) }),
      start: dayOrNull(r.plannedStart),
      end,
      status: r.status,
      ...(r.isMilestone && { milestone: true }),
      ...(hasChild.has(r.id) && { group: true }),
      ...(end && end < today && r.status !== "done" && { late: true }),
      ...(waitsFor.has(r.id) && { waitsFor: waitsFor.get(r.id) }),
    }
  })
  return JSON.stringify({ as_of: today, total: scope.length, shown: items.length, items })
}

async function listSprintSchedule(projectId: string): Promise<string> {
  const sprints = await prisma.sprint.findMany({
    where: { projectId, status: { not: "archived" } },
    orderBy: { startDate: "desc" },
    take: 8,
    select: {
      sprintName: true, startDate: true, endDate: true, status: true, capacity: true,
      items: { select: { pbItem: { select: { displayId: true, workloadScore: true } } } },
    },
  })
  const out = sprints.map((s) => {
    const pbis = new Map(s.items.map((i) => [i.pbItem.displayId, i.pbItem.workloadScore ?? 0]))
    return {
      name: trunc(s.sprintName, 60),
      start: iso(s.startDate),
      end: iso(s.endDate),
      status: s.status,
      capacity: s.capacity,
      plannedPoints: [...pbis.values()].reduce((a, b) => a + b, 0),
      pbis: [...pbis.keys()].slice(0, 30).map((n) => `#${n}`),
    }
  })
  return JSON.stringify({ as_of: iso(now()), sprints: out })
}

// ── propose_plan_edit ───────────────────────────────────────────────────────

interface PlanRow {
  id: string
  parentId: string | null
  name: string
  plannedStart: Date | null
  plannedEnd: Date | null
  status: string
  version: number
}

type Resolved = { row: PlanRow } | { error: string }

/** The one plan row `ref` names (exact name first, then substring); an error that lists the choices otherwise. */
export function resolvePlanItem(rows: readonly PlanRow[], ref: unknown): Resolved {
  const text = strArg(ref, 255)
  if (!text) return { error: "item is required (the stage name)" }
  const byId = rows.find((r) => r.id === text)
  if (byId) return { row: byId }
  const exact = rows.filter((r) => r.name === text)
  const hits = exact.length > 0 ? exact : rows.filter((r) => r.name.includes(text))
  if (hits.length === 0) return { error: `no plan stage matches "${text}" (call list_plan_schedule)` }
  if (hits.length > 1) return { error: `"${text}" matches several stages; ask the user which one: ${hits.slice(0, 5).map((h) => `"${trunc(h.name, 40)}"`).join(", ")}` }
  return { row: hits[0] }
}

type OpArgs = Record<string, unknown>

function parseDay(value: unknown, label: string): { day: string | null | undefined } | { error: string } {
  if (value === undefined) return { day: undefined }
  if (value === null || value === "") return { day: null }
  return isYmd(value) ? { day: value } : { error: `${label} must be a real date YYYY-MM-DD` }
}

function buildCreate(rows: readonly PlanRow[], a: OpArgs): PlanOp | { error: string } {
  const name = strArg(a.name ?? a.item, 255)
  if (!name) return { error: "create needs a name" }
  let parent: { id: string; name: string } | null = null
  if (strArg(a.parent, 255)) {
    const found = resolvePlanItem(rows, a.parent)
    if ("error" in found) return found
    parent = { id: found.row.id, name: trunc(found.row.name, 120) }
  }
  const start = parseDay(a.start, "start")
  if ("error" in start) return start
  const end = parseDay(a.end, "end")
  if ("error" in end) return end
  const hasStart = (start.day ?? null) !== null
  const hasEnd = (end.day ?? null) !== null
  if (hasStart !== hasEnd) return { error: "give both start and end, or neither (undated stage)" }
  if (start.day && end.day && start.day > end.day) return { error: "start must not be after end" }
  const duration = a.duration_days === undefined ? null : Number(a.duration_days)
  if (duration !== null && !(Number.isInteger(duration) && duration >= 1 && duration <= 3650)) return { error: "duration_days must be 1-3650" }
  return {
    op: "create", name, parent, plannedStart: start.day ?? null, plannedEnd: end.day ?? null,
    isMilestone: a.milestone === true, durationDays: duration,
  }
}

function buildUpdate(rows: readonly PlanRow[], hasChild: ReadonlySet<string>, a: OpArgs): PlanOp | { error: string } {
  const found = resolvePlanItem(rows, a.item ?? a.name)
  if ("error" in found) return found
  const row = found.row
  const start = parseDay(a.start, "start")
  if ("error" in start) return start
  const end = parseDay(a.end, "end")
  if ("error" in end) return end
  const status = strArg(a.status, 32)
  if (status && !(PLAN_STATUSES as readonly string[]).includes(status)) return { error: `status must be one of ${PLAN_STATUSES.join(", ")}` }
  const newName = strArg(a.new_name, 255)
  const touchesDates = start.day !== undefined || end.day !== undefined
  if (touchesDates && hasChild.has(row.id)) {
    return { error: `"${trunc(row.name, 40)}" is a group: its dates come from its sub-stages. Edit those instead.` }
  }
  const nextStart = start.day !== undefined ? start.day : dayOrNull(row.plannedStart)
  const nextEnd = end.day !== undefined ? end.day : dayOrNull(row.plannedEnd)
  if (touchesDates && (nextStart === null) !== (nextEnd === null)) return { error: "a stage needs both start and end (or neither)" }
  if (nextStart && nextEnd && nextStart > nextEnd) return { error: "start must not be after end" }
  const changes: Extract<PlanOp, { op: "update" }>["changes"] = {
    ...(newName && newName !== row.name && { name: newName }),
    ...(touchesDates && nextStart !== dayOrNull(row.plannedStart) && { plannedStart: nextStart }),
    ...(touchesDates && nextEnd !== dayOrNull(row.plannedEnd) && { plannedEnd: nextEnd }),
    ...(status && status !== row.status && { status }),
  }
  if (touchesDates && (changes.plannedStart !== undefined || changes.plannedEnd !== undefined)) {
    // The API takes the pair together.
    changes.plannedStart = nextStart
    changes.plannedEnd = nextEnd
  }
  if (Object.keys(changes).length === 0) return { error: `nothing changes for "${trunc(row.name, 40)}"` }
  return {
    op: "update", target: { id: row.id, name: trunc(row.name, 120) }, version: row.version, changes,
    before: { name: trunc(row.name, 255), plannedStart: dayOrNull(row.plannedStart), plannedEnd: dayOrNull(row.plannedEnd), status: row.status },
  }
}

function buildShift(rows: readonly PlanRow[], hasChild: ReadonlySet<string>, a: OpArgs): PlanOp | { error: string } {
  const found = resolvePlanItem(rows, a.item ?? a.name)
  if ("error" in found) return found
  const row = found.row
  const days = Number(a.days)
  if (!Number.isInteger(days) || days === 0 || Math.abs(days) > 3650) return { error: "days must be a non-zero whole number" }
  const followers = strArg(a.followers, 12) ?? "none"
  if (!(SHIFT_FOLLOWERS as readonly string[]).includes(followers)) return { error: `followers must be one of ${SHIFT_FOLLOWERS.join(", ")}` }
  const start = dayOrNull(row.plannedStart)
  const end = dayOrNull(row.plannedEnd)
  if (!start || !end) return { error: `"${trunc(row.name, 40)}" has no dates to shift` }
  if (hasChild.has(row.id)) return { error: `"${trunc(row.name, 40)}" is a group: shift its sub-stages instead.` }
  return {
    op: "shift", target: { id: row.id, name: trunc(row.name, 120) }, version: row.version, days,
    before: { plannedStart: start, plannedEnd: end },
    after: { plannedStart: addDays(start, days), plannedEnd: addDays(end, days) },
    followers: followers as (typeof SHIFT_FOLLOWERS)[number],
  }
}

/** Pure: operations the model sent → validated ops, or the first error. */
export function buildPlanOps(rows: readonly PlanRow[], rawOps: unknown): PlanOp[] | { error: string } {
  if (!Array.isArray(rawOps) || rawOps.length === 0) return { error: "operations must be a non-empty array" }
  if (rawOps.length > PLAN_OP_MAX) return { error: `at most ${PLAN_OP_MAX} operations` }
  const hasChild = new Set(rows.flatMap((r) => (r.parentId ? [r.parentId] : [])))
  const ops: PlanOp[] = []
  const touched = new Set<string>()
  for (const raw of rawOps) {
    const a = (typeof raw === "object" && raw !== null ? raw : {}) as OpArgs
    const action = strArg(a.action, 10)
    const op = action === "create" ? buildCreate(rows, a)
      : action === "update" ? buildUpdate(rows, hasChild, a)
      : action === "shift" ? buildShift(rows, hasChild, a)
      : { error: "action must be create | update | shift" }
    if ("error" in op) return op
    if (op.op !== "create") {
      // One version per row: a second edit of the same stage would be rejected as stale.
      if (touched.has(op.target.id)) return { error: `"${trunc(op.target.name, 40)}" is edited twice; combine it into one operation` }
      touched.add(op.target.id)
    }
    ops.push(op)
  }
  // Moving the following stages changes their versions (and rolls up parents): the
  // other edits of the card would then be rejected as stale, so such a shift stands alone.
  const movesFollowers = ops.some((o) => o.op === "shift" && o.followers !== "none")
  if (movesFollowers && ops.some((o) => o.op !== "create") && ops.filter((o) => o.op !== "create").length > 1) {
    return { error: "a shift that also moves the following stages must be proposed on its own (new stages may accompany it)" }
  }
  return ops
}

async function proposePlanEdit(projectId: string, args: Record<string, unknown>): Promise<string> {
  const rows = await prisma.planItem.findMany({
    where: { projectId, ...NOT_DELETED },
    take: 500,
    select: { id: true, parentId: true, name: true, plannedStart: true, plannedEnd: true, status: true, version: true },
  })
  const ops = buildPlanOps(rows, args.operations)
  if ("error" in ops) return err(ops.error)
  const proposal: PlanEditProposal = {
    kind: "plan_edit",
    proposalId: proposalIdOf("plan_edit", { ops, versions: ops.map((o) => (o.op === "create" ? 0 : o.version)) }),
    ops,
    reason: strArg(args.reason, 1000) ?? "",
  }
  return reply(proposal)
}

// ── propose_sprint_schedule ─────────────────────────────────────────────────

async function proposeSprintSchedule(projectId: string, args: Record<string, unknown>): Promise<string> {
  const name = strArg(args.sprint, 100)
  const sprints = await prisma.sprint.findMany({
    where: { projectId, status: { in: OPEN_SPRINTS }, ...(name ? { sprintName: { contains: name } } : {}) },
    orderBy: { startDate: "desc" },
    take: 5,
    select: { id: true, sprintName: true, startDate: true, endDate: true, version: true },
  })
  if (sprints.length === 0) return err("no matching open sprint (planning / active / review)")
  if (name && sprints.length > 1) return err(`ambiguous sprint name; ask the user which one: ${sprints.map((s) => `"${trunc(s.sprintName, 40)}"`).join(", ")}`)
  const sprint = sprints[0]
  const before = { startDate: iso(sprint.startDate), endDate: iso(sprint.endDate) }
  let after = { ...before }
  if (args.shift_days !== undefined && args.shift_days !== null && args.shift_days !== "") {
    const days = Number(args.shift_days)
    if (!Number.isInteger(days) || days === 0 || Math.abs(days) > 3650) return err("shift_days must be a non-zero whole number")
    after = { startDate: addDays(before.startDate, days), endDate: addDays(before.endDate, days) }
  }
  const start = parseDay(args.start, "start")
  if ("error" in start) return err(start.error)
  const end = parseDay(args.end, "end")
  if ("error" in end) return err(end.error)
  after = { startDate: start.day ?? after.startDate, endDate: end.day ?? after.endDate }
  if (after.startDate > after.endDate) return err("start must not be after end")
  if (after.startDate === before.startDate && after.endDate === before.endDate) return err("the period does not change")
  const proposal: SprintScheduleProposal = {
    kind: "sprint_schedule",
    proposalId: proposalIdOf("sprint_schedule", { id: sprint.id, after, version: sprint.version }),
    sprint: { id: sprint.id, name: trunc(sprint.sprintName, 120) },
    version: sprint.version,
    before,
    after,
    reason: strArg(args.reason, 1000) ?? "",
  }
  return reply(proposal)
}

// ── propose_template ────────────────────────────────────────────────────────

type StageIn = { [key: string]: unknown }

/** snake_case stages from the model → the template stage tree (unknown keys dropped). */
export function toTemplateStages(raw: unknown): unknown[] {
  if (!Array.isArray(raw)) return []
  return raw.map((s: StageIn) => {
    const checklist = Array.isArray(s?.checklist) ? s.checklist.filter((c) => typeof c === "string" && c.trim()) : undefined
    const children = toTemplateStages(s?.children)
    return {
      name: typeof s?.name === "string" ? s.name : "",
      ...(typeof s?.description === "string" && s.description.trim() && { description: s.description }),
      ...(s?.milestone === true && { isMilestone: true }),
      ...(s?.duration_days !== undefined && s.duration_days !== null && { durationDays: Number(s.duration_days) }),
      ...(checklist && checklist.length > 0 && { checklist }),
      ...(children.length > 0 && { children }),
    }
  })
}

/** Pure: the model's template arguments → validated content, or the first problem. */
export function buildTemplateContent(args: Record<string, unknown>): PlanTemplateContent | { error: string } {
  const checks = Array.isArray(args.checks)
    ? args.checks.map((c: StageIn) => ({ name: typeof c?.name === "string" ? c.name : "", ...(typeof c?.criterion === "string" && c.criterion.trim() && { criterion: c.criterion }) }))
    : undefined
  const documents = Array.isArray(args.documents) ? args.documents.filter((d) => typeof d === "string" && d.trim()) : undefined
  const parsed = templateContentSchema.safeParse({
    stages: toTemplateStages(args.stages),
    ...(strArg(args.check_label, 40) && { checkLabel: strArg(args.check_label, 40) }),
    ...(checks && checks.length > 0 && { checks }),
    ...(documents && documents.length > 0 && { documents }),
  })
  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    return { error: `template content is invalid at ${issue.path.join(".") || "root"}: ${issue.message}` }
  }
  if (parsed.data.stages.length === 0) return { error: "a template needs at least one stage" }
  return parsed.data
}

async function proposeTemplate(_projectId: string, args: Record<string, unknown>): Promise<string> {
  const name = strArg(args.name, 255)
  if (!name) return err("name is required")
  const content = buildTemplateContent(args)
  if ("error" in content) return err(content.error)
  const visibility = strArg(args.visibility, 10) === "public" ? "public" : "private"
  const proposal: CreateTemplateProposal = {
    kind: "create_template",
    proposalId: proposalIdOf("create_template", { name, visibility, content }),
    name,
    description: strArg(args.description, 2000) ?? "",
    visibility,
    content,
    stageCount: countNodes(content.stages),
    reason: strArg(args.reason, 1000) ?? "",
  }
  return reply(proposal)
}

export const scheduleHandlers: Record<string, ToolHandler> = {
  list_plan_schedule: ({ projectId, args }) => listPlanSchedule(projectId, args),
  list_sprint_schedule: ({ projectId }) => listSprintSchedule(projectId),
  propose_plan_edit: ({ projectId, args }) => proposePlanEdit(projectId, args),
  propose_sprint_schedule: ({ projectId, args }) => proposeSprintSchedule(projectId, args),
  propose_template: ({ projectId, args }) => proposeTemplate(projectId, args),
}
