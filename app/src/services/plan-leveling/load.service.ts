/**
 * Members' load and levelling (plan 12 §3.5 / §4, E4).
 *
 * Load of a person on a day = the number of live plan LEAVES they own (not done, not on hold) whose planned span
 * covers the day, in ANY project (a milestone counts 0). Only spans are read — never another project's item names or
 * ids leave this file (plan 12 §4: "他のプロジェクトの項目の名前は出さない").
 *
 * A leaf takes ℓ = 1 (stored plan items carry no load share), and a person works on an item with all the time they
 * have (level.ts): one leaf fills the person's day whatever their FTE. So utilization = load ÷ what the day can hold
 * = the number of leaves held, and a day without time (FTE 0) that holds a leaf counts as over (shown as ≥ 2, the
 * same as a double booking). Utilization therefore never reveals the FTE itself (plan 12 §4: the FTE and the
 * reasons for leave are not shown to a PO / SM); only that the person was over capacity.
 *
 * - memberLoad: utilization and overlap days per member. A viewer without `plan.viewMemberLoad` sees only their own
 *   row (member_cannot_see_others_load).
 * - levelProject: levels the project's latest loaded base schedule with the roles assigned to explicit project
 *   members only (PLAN_ROLE_ASSIGNMENT_INVALID otherwise — a non-member's busy days would leak through the dates),
 *   capacity = FTE (capped by the allocation to this project) minus the person's load in OTHER projects, and m_u
 *   learned from their past actuals. Nothing is written: the result is a proposal.
 */
import { learnParallelCap, level, type LevelResult, type PlacedPart } from "@/lib/plan-leveling/level"
import { levelItemsFromSchedule, WorkCalendar } from "@/lib/plan-leveling/from-schedule"
import { dateKeyOf, dayNumber } from "@/lib/plan-estimate/dates"
import { dateFromKey } from "@/lib/plan-progress"
import { baseScheduleSchema } from "@/lib/plan-schedule/base-schedule"
import { defaultDb, type Db } from "@/services/_shared/db"
import { ValidationError } from "@/services/_shared/errors"
import { capacityRows } from "./capacity.service"
import type { LevelRequest } from "./capacity.schemas"

const DAY_MS = 86_400_000
const isWeekend = (day: number) => {
  const w = (((day + 4) % 7) + 7) % 7
  return w === 0 || w === 6
}
/** Leaves read per call for load (far above a real portfolio; past it the numbers would be understated → refused). */
const LOAD_ROWS_MAX = 50_000
/** At most how far ahead levelling reads other projects' load (calendar days). */
const LEVEL_WINDOW_MAX_DAYS = 3 * 366
/** Past snapshots' concurrency peaks read per levelling (the most recent first). */
const PEAKS_MAX = 10_000

function validDay(k: string): string {
  if (!dateFromKey(k)) throw new ValidationError("日付が不正です", {}, "INVALID_DATE")
  return k
}

/** Per user and calendar day number: summed load and how many items are held. Spans only. */
export type DailyLoad = Map<string, Map<number, { load: number; count: number }>>

export async function dailyLoad(userIds: readonly string[], from: string, to: string, options: { excludeProjectId?: string } = {}, db: Db = defaultDb): Promise<DailyLoad> {
  const out: DailyLoad = new Map()
  if (userIds.length === 0) return out
  const rows = await db.planItem.findMany({
    where: {
      ownerId: { in: [...userIds] },
      deletedAt: null,
      status: { notIn: ["done", "on_hold"] },
      plannedStart: { not: null, lte: new Date(`${to}T00:00:00.000Z`) },
      plannedEnd: { not: null, gte: new Date(`${from}T00:00:00.000Z`) },
      children: { none: { deletedAt: null } },
      project: { deletedAt: null },
      ...(options.excludeProjectId ? { projectId: { not: options.excludeProjectId } } : {}),
    },
    // Spans only: no name, no project id leaves the query.
    select: { ownerId: true, plannedStart: true, plannedEnd: true, isMilestone: true },
    take: LOAD_ROWS_MAX + 1,
  })
  if (rows.length > LOAD_ROWS_MAX) throw new ValidationError("負荷を数える項目が多すぎます。期間を短くしてください", { max: LOAD_ROWS_MAX }, "PLAN_LOAD_TOO_LARGE")
  const lo = dayNumber(from)
  const hi = dayNumber(to)
  for (const r of rows) {
    if (!r.ownerId || !r.plannedStart || !r.plannedEnd) continue
    const load = r.isMilestone ? 0 : 1
    const byDay = out.get(r.ownerId) ?? new Map<number, { load: number; count: number }>()
    const a = Math.max(lo, Math.floor(r.plannedStart.getTime() / DAY_MS))
    const b = Math.min(hi, Math.floor(r.plannedEnd.getTime() / DAY_MS))
    for (let d = a; d <= b; d++) {
      const cur = byDay.get(d) ?? { load: 0, count: 0 }
      byDay.set(d, { load: cur.load + load, count: cur.count + (load > 0 ? 1 : 0) })
    }
    out.set(r.ownerId, byDay)
  }
  return out
}

export interface MemberLoadRow {
  userId: string
  name: string
  /** Highest utilization over the working days of the window (1 = the day is full; see the file comment). */
  maxUtilization: number
  /** Working days over capacity. */
  daysOver: number
  /** Working days holding two or more items. */
  overlapDays: number
  /** Utilization per working day (date + ratio), no item names. */
  days: { date: string; utilization: number }[]
}

/** Utilization shown for a day holding `load` leaves (see the file comment): the count, or ≥ 2 on a day without time. */
export function utilizationOf(load: number, ownFte: number): number {
  if (load <= 0) return 0
  return ownFte > 1e-9 ? load : Math.max(2, load)
}

export async function memberLoad(projectId: string, viewer: { userId: string; canViewOthers: boolean }, window: { from: string; to: string }, db: Db = defaultDb): Promise<MemberLoadRow[]> {
  validDay(window.from)
  validDay(window.to)
  const members = await db.projectMember.findMany({ where: { projectId }, select: { userId: true, user: { select: { name: true } } }, orderBy: { userId: "asc" } })
  const visible = viewer.canViewOthers ? members : members.filter((m) => m.userId === viewer.userId)
  const ids = visible.map((m) => m.userId)
  const [load, caps] = await Promise.all([dailyLoad(ids, window.from, window.to, {}, db), capacityRows(ids, projectId, db, window.from)])
  const lo = dayNumber(window.from)
  const hi = dayNumber(window.to)
  return visible.map((m) => {
    const days: { date: string; utilization: number }[] = []
    let max = 0
    let over = 0
    let overlap = 0
    for (let d = lo; d <= hi; d++) {
      if (isWeekend(d)) continue
      const k = dateKeyOf(d)
      const l = load.get(m.userId)?.get(d) ?? { load: 0, count: 0 }
      // Against the person's own FTE (not this project's allocation: the load is across projects).
      const u = utilizationOf(l.load, caps.ownFte(m.userId, k))
      days.push({ date: k, utilization: u })
      max = Math.max(max, u)
      if (u > 1 + 1e-9) over++
      // A leaf on a day without time counts as an overlap too, so the two counts never tell leave from overbooking.
      if (l.count >= 2 || (u > 1 + 1e-9 && l.count >= 1)) overlap++
    }
    return { userId: m.userId, name: m.user.name ?? "", maxUtilization: max, daysOver: over, overlapDays: overlap, days }
  })
}

// ---------------------------------------------------------------- levelling ------------------------------------------

export interface LevelPartDto {
  start: string
  end: string
  owner: { userId: string; name: string } | null
}

export interface LevelPlacementDto extends LevelPartDto {
  key: string
  name: string
  split?: LevelPartDto[]
  overloaded?: boolean
}

export interface LevelResponse {
  placements: LevelPlacementDto[]
  before: { userId: string; name: string; maxUtilization: number; daysOverCapacity: number }[]
  after: { userId: string; name: string; maxUtilization: number; daysOverCapacity: number }[]
  moves: { key: string; name: string; reason: "capacity" | "split"; from: LevelPartDto; to: LevelPartDto }[]
  plannedEnd: string | null
}

export async function levelProject(projectId: string, req: LevelRequest, db: Db = defaultDb): Promise<LevelResponse> {
  validDay(req.startDate)
  const assigned = [...new Set(Object.values(req.roleAssignments).flat())]
  const members = await db.projectMember.findMany({ where: { projectId }, select: { userId: true, user: { select: { name: true } } } })
  const memberIds = new Set(members.map((m) => m.userId))
  // Explicit members only — a section manager who merely sees the project is not one (plan 12 §10 HIGH 2).
  if (assigned.some((u) => !memberIds.has(u))) throw new ValidationError("役割に割り当てられるのはプロジェクトのメンバーだけです", {}, "PLAN_ROLE_ASSIGNMENT_INVALID")
  const names = new Map(members.map((m) => [m.userId, m.user.name ?? ""]))

  const load = await db.planScheduleLoad.findFirst({ where: { projectId }, orderBy: [{ loadedAt: "desc" }, { id: "desc" }], select: { content: true, skipWeekends: true } })
  const parsed = load ? baseScheduleSchema.safeParse(load.content) : null
  if (!parsed?.success) throw new ValidationError("平準化できる計画（読み込んだ基本の計画）がありません", {}, "PLAN_SCHEDULE_INVALID")
  const skipWeekends = req.skipWeekends ?? load?.skipWeekends ?? false
  const items = levelItemsFromSchedule(parsed.data)
  const nameOf = new Map<string, string>()
  const walk = (list: typeof parsed.data.items) => {
    for (const it of list) {
      nameOf.set(it.key, it.name)
      if (it.children) walk(it.children)
    }
  }
  walk(parsed.data.items)

  const cal = new WorkCalendar(req.startDate, skipWeekends)
  // Other projects' load is read as far as this plan can reach: twice its serial length in calendar days (+ 2 months),
  // capped at three years.
  const serialDays = items.reduce((sum, i) => sum + i.days + (i.lagDays ?? 0), 0)
  const windowEnd = dateKeyOf(dayNumber(req.startDate) + Math.min(LEVEL_WINDOW_MAX_DAYS, Math.ceil(serialDays * 2 * (7 / 5)) + 60))
  const [other, caps, peaks] = await Promise.all([
    dailyLoad(assigned, req.startDate, windowEnd, { excludeProjectId: projectId }, db),
    capacityRows(assigned, projectId, db, req.startDate),
    assigned.length
      ? db.planActualsItem.findMany({
          where: { ownerId: { in: assigned }, ownerConcurrentPeak: { not: null }, snapshot: { supersededAt: null, includeInLearning: true, project: { deletedAt: null } } },
          select: { ownerId: true, ownerConcurrentPeak: true },
          orderBy: { id: "desc" },
          take: PEAKS_MAX,
        })
      : [],
  ])
  const memo = <T>(fn: (u: string, index: number) => T) => {
    const cache = new Map<string, T>()
    return (u: string, index: number): T => {
      const k = `${u}|${index}`
      const hit = cache.get(k)
      if (hit !== undefined) return hit
      const v = fn(u, index)
      cache.set(k, v)
      return v
    }
  }
  // FTE for this project on a day: the own FTE capped by the allocation to this project.
  const fte = memo((u, index) => caps.fte(u, cal.keyOf(index)))
  // C_u(d) = that FTE minus what the person's other projects take: each of their leaves there fills the person's
  // day (ℓ = 1, taken at min(1, own FTE) = own FTE).
  // Past the window read, the other projects' load is unknown: no capacity there (an item that only fits later is
  // placed at its earliest start and flagged overloaded rather than put into a period the data never covered).
  const windowEndDay = dayNumber(windowEnd)
  const capacity = memo((u, index) => {
    const dateKey = cal.keyOf(index)
    if (dayNumber(dateKey) > windowEndDay) return 0
    const held = other.get(u)?.get(dayNumber(dateKey))?.load ?? 0
    const own = caps.ownFte(u, dateKey)
    return Math.max(0, Math.min(caps.fte(u, dateKey), own - held * own))
  })
  const peaksOf = new Map<string, number[]>()
  for (const p of peaks) if (p.ownerId) peaksOf.set(p.ownerId, [...(peaksOf.get(p.ownerId) ?? []), p.ownerConcurrentPeak as number])
  const mu = new Map(assigned.map((u) => [u, learnParallelCap(peaksOf.get(u) ?? [])]))
  const result: LevelResult = level({ items, assign: req.roleAssignments, capacity, fte, parallelCap: (u) => mu.get(u) ?? 2 })

  const owner = (u: string | null) => (u ? { userId: u, name: names.get(u) ?? "" } : null)
  const part = (p: PlacedPart): LevelPartDto => ({ start: cal.keyOf(p.start), end: cal.keyOf(p.end), owner: owner(p.owner) })
  const summary = (s: LevelResult["before"]) => Object.entries(s).map(([u, v]) => ({ userId: u, name: names.get(u) ?? "", ...v })).sort((a, b) => (a.userId < b.userId ? -1 : 1))
  return {
    placements: result.placements.map((p) => ({ key: p.key, name: nameOf.get(p.key) ?? p.key, ...part(p), ...(p.split ? { split: p.split.map(part) } : {}), ...(p.overloaded ? { overloaded: true } : {}) })),
    before: summary(result.before),
    after: summary(result.after),
    moves: result.moves.map((m) => ({ key: m.key, name: nameOf.get(m.key) ?? m.key, reason: m.reason, from: part(m.from), to: part(m.to) })),
    plannedEnd: result.end >= 0 ? cal.keyOf(result.end) : null,
  }
}
