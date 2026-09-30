/**
 * Master plan (全体計画) progress / status / schedule model.
 *
 * Pure rules (unit-tested in src/lib/__tests__/plan-progress.test.ts):
 *  - Leaf, progressMode "manual" (or "linked" without linked PBIs):
 *      status is the user's; % = statusToProgress(status).
 *  - Leaf, progressMode "linked" with live linked PBIs:
 *      % = done points / total points (by count when no points are set);
 *      status = all done → done; any PBI completed or in a sprint → in_progress;
 *      else not_started.
 *  - Parent: % = duration-weighted average of the children (weight = planned
 *      calendar days, inclusive; milestones weigh 0 unless every child is a
 *      milestone, then equal weights); status = all done → done; all on_hold →
 *      on_hold; any in_progress / done → in_progress; else not_started;
 *      plannedStart / plannedEnd = min / max of the children.
 *  - scheduleState (computed per request, never stored): done | on_hold |
 *      delayed | at_risk | not_started | on_track against "today" in Asia/Tokyo.
 *
 * Dates are date-only: stored as UTC midnight of the calendar day. Rows that
 * carry a time part (legacy JST-midnight writes) are read as the NEAREST UTC
 * midnight (toDateKey), the same rule the 20261004000000_plan_linkage
 * migration applied to existing rows.
 *
 * recalc* functions persist derived values (progressPct, status, parent
 * dates) of the touched items and every ancestor. They do NOT bump `version`:
 * derived columns are not user edits, and PATCH never writes them back.
 * They take the client explicitly (normally the caller's transaction); this
 * module deliberately does not import the Prisma singleton so the pure rules
 * stay importable anywhere (schemas, client-safe code, tests).
 */
import type { Prisma } from "@/generated/prisma/client"

type Db = Prisma.TransactionClient

export const PLAN_STATUSES = ["not_started", "in_progress", "done", "on_hold"] as const
export type PlanStatus = (typeof PLAN_STATUSES)[number]

export const PROGRESS_MODES = ["manual", "linked"] as const
export type ProgressMode = (typeof PROGRESS_MODES)[number]

export const SCHEDULE_STATES = ["done", "delayed", "at_risk", "not_started", "on_track", "on_hold"] as const
export type ScheduleState = (typeof SCHEDULE_STATES)[number]

/** An item is at risk when its progress trails the elapsed share of its window by more than this. */
export const AT_RISK_MARGIN_PCT = 15

const DAY_MS = 86_400_000
const HALF_DAY_MS = DAY_MS / 2
const TOKYO_OFFSET_MS = 9 * 60 * 60 * 1000
const DATE_KEY_RE = /^(\d{4})-(\d{2})-(\d{2})$/

// ── dates ───────────────────────────────────────────────────────────────────

/** Days since 1970-01-01 of the nearest UTC midnight. */
export function dayIndex(d: Date): number {
  return Math.floor((d.getTime() + HALF_DAY_MS) / DAY_MS)
}

/** "YYYY-MM-DD" of a stored plan date (nearest UTC midnight). */
export function toDateKey(d: Date): string {
  return new Date(dayIndex(d) * DAY_MS).toISOString().slice(0, 10)
}

/** `toDateKey`, null-safe. */
export function toDateKeyOrNull(d: Date | null | undefined): string | null {
  return d ? toDateKey(d) : null
}

/** Calendar day "YYYY-MM-DD" in Asia/Tokyo (no DST) of an instant. */
export function tokyoDateKey(now: Date): string {
  return new Date(now.getTime() + TOKYO_OFFSET_MS).toISOString().slice(0, 10)
}

/** UTC midnight of a valid "YYYY-MM-DD" (null for anything else, incl. 2026-02-30). */
export function dateFromKey(key: string): Date | null {
  const m = DATE_KEY_RE.exec(key)
  if (!m) return null
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])))
  return d.toISOString().slice(0, 10) === key ? d : null
}

/**
 * Normalize API input to a stored plan date (UTC midnight):
 *  - "YYYY-MM-DD" → that calendar day;
 *  - an ISO date-time (with zone) → its calendar day in Asia/Tokyo;
 *  - anything else → null (the caller answers 400 INVALID_DATE).
 */
export function normalizePlanDate(value: string): Date | null {
  const trimmed = value.trim()
  if (DATE_KEY_RE.test(trimmed)) return dateFromKey(trimmed)
  if (!/^\d{4}-\d{2}-\d{2}T/.test(trimmed)) return null
  const instant = new Date(trimmed)
  if (Number.isNaN(instant.getTime())) return null
  return dateFromKey(tokyoDateKey(instant))
}

/** Planned calendar days, both ends included (≥ 1 for a valid range). */
export function inclusiveDays(start: Date, end: Date): number {
  return dayIndex(end) - dayIndex(start) + 1
}

/** plannedEnd − baselineEnd in days (positive = later than the baseline); null without a baseline. */
export function baselineVarianceDays(plannedEnd: Date, baselineEnd: Date | null | undefined): number | null {
  return baselineEnd ? dayIndex(plannedEnd) - dayIndex(baselineEnd) : null
}

// ── leaves ──────────────────────────────────────────────────────────────────

/** A manual leaf's progress from its status. `delayed` is legacy (read as in progress). */
export function statusToProgress(status: string): number {
  switch (status) {
    case "done":
      return 100
    case "in_progress":
    case "delayed":
      return 50
    default:
      return 0
  }
}

/** A live PBI linked to a plan leaf. */
export interface LinkedPbi {
  status: string
  /** workloadScore (story points). */
  points: number
  /** The PBI has any row in any sprint (planned or worked on). */
  inSprint: boolean
}

export interface DerivedState {
  progressPct: number
  status: PlanStatus
}

const isPbiDone = (p: LinkedPbi) => p.status === "completed"

/** Linked-leaf progress / status from its PBIs; null without PBIs (then the leaf behaves as manual). */
export function deriveLinkedLeaf(pbis: readonly LinkedPbi[]): DerivedState | null {
  if (pbis.length === 0) return null
  const done = pbis.filter(isPbiDone)
  const pointsTotal = pbis.reduce((s, p) => s + Math.max(0, p.points), 0)
  const pointsDone = done.reduce((s, p) => s + Math.max(0, p.points), 0)
  const progressPct = pointsTotal > 0 ? Math.round((pointsDone / pointsTotal) * 100) : Math.round((done.length / pbis.length) * 100)
  if (done.length === pbis.length) return { progressPct, status: "done" }
  const started = pbis.some((p) => isPbiDone(p) || p.inSprint)
  return { progressPct, status: started ? "in_progress" : "not_started" }
}

// ── parents ─────────────────────────────────────────────────────────────────

export interface ChildState {
  progressPct: number
  status: string
  plannedStart: Date
  plannedEnd: Date
  isMilestone: boolean
}

export interface ParentRollup extends DerivedState {
  plannedStart: Date
  plannedEnd: Date
}

function rollupStatus(statuses: readonly string[]): PlanStatus {
  if (statuses.every((s) => s === "done")) return "done"
  if (statuses.every((s) => s === "on_hold")) return "on_hold"
  if (statuses.some((s) => s === "in_progress" || s === "done" || s === "delayed")) return "in_progress"
  return "not_started"
}

function childWeights(children: readonly ChildState[]): number[] {
  if (children.every((c) => c.isMilestone)) return children.map(() => 1)
  const weights = children.map((c) => (c.isMilestone ? 0 : Math.max(1, inclusiveDays(c.plannedStart, c.plannedEnd))))
  return weights.some((w) => w > 0) ? weights : children.map(() => 1)
}

/** Parent values from its (live) children; `children` must not be empty. */
export function rollupChildren(children: readonly ChildState[]): ParentRollup {
  const weights = childWeights(children)
  const total = weights.reduce((s, w) => s + w, 0)
  const weighted = children.reduce((s, c, i) => s + c.progressPct * weights[i], 0)
  const start = Math.min(...children.map((c) => c.plannedStart.getTime()))
  const end = Math.max(...children.map((c) => c.plannedEnd.getTime()))
  return {
    progressPct: Math.round(weighted / total),
    status: rollupStatus(children.map((c) => c.status)),
    plannedStart: new Date(start),
    plannedEnd: new Date(end),
  }
}

// ── schedule state ──────────────────────────────────────────────────────────

export interface ScheduleInput {
  status: string
  progressPct: number
  plannedStart: Date
  plannedEnd: Date
}

/**
 * done: status done. on_hold: status on_hold (a paused item is never
 * reported delayed / at_risk). delayed: plannedEnd before today. at_risk: the window
 * has started and progress < elapsedPct − 15 (elapsedPct = days elapsed
 * INCLUDING today / planned days). not_started: no progress and not marked in
 * progress. on_track: otherwise. `todayKey` = Asia/Tokyo "YYYY-MM-DD".
 */
export function computeScheduleState(item: ScheduleInput, todayKey: string): ScheduleState {
  if (item.status === "done") return "done"
  if (item.status === "on_hold") return "on_hold"
  const today = dateFromKey(todayKey)
  if (!today) return "on_track"
  const t = dayIndex(today)
  const s = dayIndex(item.plannedStart)
  const e = dayIndex(item.plannedEnd)
  if (t > e) return "delayed"
  if (t >= s) {
    const elapsedPct = ((t - s + 1) / Math.max(1, e - s + 1)) * 100
    if (item.progressPct < elapsedPct - AT_RISK_MARGIN_PCT) return "at_risk"
  }
  if (item.progressPct === 0 && item.status !== "in_progress" && item.status !== "delayed") return "not_started"
  return "on_track"
}

// ── tree recalculation ──────────────────────────────────────────────────────

export interface PlanCalcNode {
  id: string
  parentId: string | null
  status: string
  progressPct: number
  progressMode: string
  plannedStart: Date
  plannedEnd: Date
  isMilestone: boolean
}

export interface PlanCalcUpdate {
  id: string
  progressPct?: number
  status?: string
  plannedStart?: Date
  plannedEnd?: Date
}

export interface PlanRecalcResult {
  updates: PlanCalcUpdate[]
  /** Every node with its recomputed values (untouched nodes as given). */
  nodes: Map<string, PlanCalcNode>
}

function depthOf(id: string, byId: ReadonlyMap<string, PlanCalcNode>): number {
  let depth = 0
  const seen = new Set<string>()
  let cursor = byId.get(id)?.parentId ?? null
  while (cursor && byId.has(cursor) && !seen.has(cursor)) {
    seen.add(cursor)
    depth += 1
    cursor = byId.get(cursor)?.parentId ?? null
  }
  return depth
}

function touchedIds(byId: ReadonlyMap<string, PlanCalcNode>, startIds: readonly string[] | "all"): string[] {
  if (startIds === "all") return Array.from(byId.keys())
  const touched = new Set<string>()
  for (const start of startIds) {
    let cursor: string | null = start
    while (cursor && byId.has(cursor) && !touched.has(cursor)) {
      touched.add(cursor)
      cursor = byId.get(cursor)?.parentId ?? null
    }
  }
  return Array.from(touched)
}

function leafState(node: PlanCalcNode, linked: ReadonlyMap<string, readonly LinkedPbi[]>): DerivedState | { progressPct: number; status: string } {
  const fromPbis = node.progressMode === "linked" ? deriveLinkedLeaf(linked.get(node.id) ?? []) : null
  return fromPbis ?? { progressPct: statusToProgress(node.status), status: node.status }
}

function diffOf(before: PlanCalcNode, after: PlanCalcNode): PlanCalcUpdate | null {
  const u: PlanCalcUpdate = { id: before.id }
  if (after.progressPct !== before.progressPct) u.progressPct = after.progressPct
  if (after.status !== before.status) u.status = after.status
  if (after.plannedStart.getTime() !== before.plannedStart.getTime()) u.plannedStart = after.plannedStart
  if (after.plannedEnd.getTime() !== before.plannedEnd.getTime()) u.plannedEnd = after.plannedEnd
  return Object.keys(u).length > 1 ? u : null
}

/**
 * Pure: recompute the start items and every ancestor ("all" = whole tree),
 * deepest first so each parent sees its children's fresh values. `nodes` are
 * the LIVE items of one project; `linked` = live PBIs per linked leaf.
 * Unknown start ids are ignored. Returns only the changed fields per row.
 */
export function computePlanRecalc(
  nodes: readonly PlanCalcNode[],
  linked: ReadonlyMap<string, readonly LinkedPbi[]>,
  startIds: readonly string[] | "all"
): PlanRecalcResult {
  const byId = new Map(nodes.map((n) => [n.id, n]))
  const children = new Map<string, string[]>()
  for (const n of nodes) {
    if (n.parentId && byId.has(n.parentId)) children.set(n.parentId, [...(children.get(n.parentId) ?? []), n.id])
  }
  const current = new Map(nodes.map((n) => [n.id, n]))
  const order = touchedIds(byId, startIds).sort((a, b) => depthOf(b, byId) - depthOf(a, byId))
  const updates: PlanCalcUpdate[] = []
  for (const id of order) {
    const node = current.get(id) as PlanCalcNode
    const kids = (children.get(id) ?? []).map((k) => current.get(k) as PlanCalcNode)
    const next: PlanCalcNode = kids.length === 0 ? { ...node, ...leafState(node, linked) } : { ...node, ...rollupChildren(kids) }
    current.set(id, next)
    const diff = diffOf(byId.get(id) as PlanCalcNode, next)
    if (diff) updates.push(diff)
  }
  return { updates, nodes: current }
}

// ── persistence ─────────────────────────────────────────────────────────────

const CALC_SELECT = {
  id: true,
  parentId: true,
  status: true,
  progressPct: true,
  progressMode: true,
  plannedStart: true,
  plannedEnd: true,
  isMilestone: true,
} as const

/** Live PBIs linked to the given plan items, grouped by plan item. */
export async function loadLinkedPbis(db: Db, planItemIds: readonly string[]): Promise<Map<string, LinkedPbi[]>> {
  const out = new Map<string, LinkedPbi[]>()
  if (planItemIds.length === 0) return out
  const rows = await db.productBacklogItem.findMany({
    where: { planItemId: { in: [...planItemIds] }, deletedAt: null },
    select: { planItemId: true, status: true, workloadScore: true, sprintItems: { select: { id: true }, take: 1 } },
  })
  for (const r of rows) {
    if (!r.planItemId) continue
    const pbi: LinkedPbi = { status: r.status, points: r.workloadScore ?? 0, inSprint: r.sprintItems.length > 0 }
    out.set(r.planItemId, [...(out.get(r.planItemId) ?? []), pbi])
  }
  return out
}

/** Persist derived values (no version bump; see the module comment). */
export async function applyPlanUpdates(db: Db, updates: readonly PlanCalcUpdate[]): Promise<void> {
  for (const { id, ...data } of updates) {
    await db.planItem.update({ where: { id }, data })
  }
}

/**
 * Recalculate the given items (old parents too, after a move) and every
 * ancestor, with one read of the project's live plan tree and one read of
 * the linked PBIs, through `db` (normally the caller's transaction).
 * Returns the applied updates.
 */
export async function recalcPlanProgress(projectId: string, startItemIds: ReadonlyArray<string | null | undefined>, db: Db): Promise<PlanCalcUpdate[]> {
  const starts = startItemIds.filter((id): id is string => !!id)
  if (starts.length === 0) return []
  const nodes = await db.planItem.findMany({ where: { projectId, deletedAt: null }, select: CALC_SELECT })
  const linkedLeaves = nodes.filter((n) => n.progressMode === "linked").map((n) => n.id)
  const { updates } = computePlanRecalc(nodes, await loadLinkedPbis(db, linkedLeaves), starts)
  await applyPlanUpdates(db, updates)
  return updates
}

/** Recalculate plan items of any project (grouped per project). Unknown ids are ignored. */
export async function recalcPlanItems(planItemIds: ReadonlyArray<string | null | undefined>, db: Db): Promise<void> {
  const ids = [...new Set(planItemIds.filter((id): id is string => !!id))]
  if (ids.length === 0) return
  const rows = await db.planItem.findMany({ where: { id: { in: ids } }, select: { id: true, projectId: true } })
  const byProject = new Map<string, string[]>()
  for (const r of rows) byProject.set(r.projectId, [...(byProject.get(r.projectId) ?? []), r.id])
  for (const [projectId, starts] of byProject) await recalcPlanProgress(projectId, starts, db)
}

/** Recalculate the plan items the given PBIs are linked to (after a status / points / sprint change). */
export async function recalcPlanForPbis(pbiIds: readonly string[], db: Db): Promise<void> {
  if (pbiIds.length === 0) return
  const rows = await db.productBacklogItem.findMany({
    where: { id: { in: [...pbiIds] }, planItemId: { not: null } },
    select: { planItemId: true },
  })
  await recalcPlanItems(rows.map((r) => r.planItemId), db)
}
