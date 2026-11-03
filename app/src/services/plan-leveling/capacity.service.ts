/**
 * 稼働量 (member_capacity, plan 12 §2.1 / §4, E4). Two kinds of rows:
 * - the person's OWN FTE (projectId null): set by the person, a section manager of their section, or an admin —
 *   decided in the route with `canManageUserCapacity`; a PO / SM cannot set it;
 * - their ALLOCATION to one project: set by that project's PO / SM (`capacity.manage`), explicit members only.
 * No row = FTE 1.0. No free-text column exists (reasons for leave are never stored). Periods of the same person (and
 * project) never overlap: checked under a per-person advisory lock (this service is the only writer of the table).
 * Every write is version-guarded and audited in member_capacity_audit in the same transaction (who, when, the period
 * and FTE before / after — numbers only); an allocation change also shows in the project's history.
 */
import { dateFromKey } from "@/lib/plan-progress"
import { logActivity } from "@/services/_shared/activity"
import type { Actor } from "@/services/_shared/actor"
import { defaultDb, withTransaction, type Db } from "@/services/_shared/db"
import { ConflictError, NotFoundError, ValidationError } from "@/services/_shared/errors"
import type { AllocationCreateInput, CapacityCreateInput, CapacityUpdateInput } from "./capacity.schemas"

export interface CapacityDto {
  id: string
  userId: string
  projectId: string | null
  from: string
  to: string | null
  fte: number
  version: number
}

type Row = { id: string; userId: string; projectId: string | null; from: Date; to: Date | null; fte: number; version: number }

const key = (d: Date | null): string | null => (d ? d.toISOString().slice(0, 10) : null)
const toDto = (r: Row): CapacityDto => ({ id: r.id, userId: r.userId, projectId: r.projectId, from: key(r.from) as string, to: key(r.to), fte: r.fte, version: r.version })
const SELECT = { id: true, userId: true, projectId: true, from: true, to: true, fte: true, version: true } as const

function day(k: string): Date {
  const d = dateFromKey(k)
  if (!d) throw new ValidationError("日付が不正です", {}, "INVALID_DATE")
  return d
}

/** True when the actor is a section manager sharing a section with the target (the input of canManageUserCapacity). */
export async function sharesSectionAsManager(actorId: string, actorRole: string, targetUserId: string, db: Db = defaultDb): Promise<boolean> {
  if (actorRole !== "section_manager") return false
  const hit = await db.userSection.findFirst({ where: { userId: actorId, section: { users: { some: { userId: targetUserId } } } }, select: { sectionId: true } })
  return hit !== null
}

async function lockUser(tx: Db, userId: string): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`member_capacity:${userId}`}))`
}

/** Refuse a period that overlaps another row of the same (userId, projectId). */
async function assertNoOverlap(tx: Db, userId: string, projectId: string | null, from: Date, to: Date | null, exceptId?: string): Promise<void> {
  const clash = await tx.memberCapacity.findFirst({
    where: {
      userId,
      projectId,
      ...(exceptId ? { NOT: { id: exceptId } } : {}),
      // [from, to] ∩ [r.from, r.to] ≠ ∅ (null = open-ended)
      AND: [{ OR: [{ to: null }, { to: { gte: from } }] }, ...(to ? [{ from: { lte: to } }] : [])],
    },
    select: { id: true },
  })
  if (clash) throw new ConflictError("期間が重なっています", {}, "CAPACITY_OVERLAP")
}

type Values = { from: string; to: string | null; fte: number }
const valuesOf = (r: Pick<Row, "from" | "to" | "fte">): Values => ({ from: key(r.from) as string, to: key(r.to), fte: r.fte })
const summaryOf = (v: Values): string => `${v.from}..${v.to ?? ""} ${v.fte}`

/** The durable trail (every kind of row) and, for an allocation, the project's history. */
async function audit(tx: Db, row: Pick<Row, "id" | "userId" | "projectId">, actor: Actor, op: "create" | "update" | "delete", before: Values | null, after: Values | null): Promise<void> {
  await tx.memberCapacityAudit.create({
    data: { capacityId: row.id, userId: row.userId, projectId: row.projectId, actorId: actor.userId, op, before: before ?? undefined, after: after ?? undefined },
  })
  if (row.projectId) {
    await logActivity(tx, {
      projectId: row.projectId,
      entityType: "project",
      entityId: row.projectId,
      action: "update",
      actor,
      // The history shows scalars: "from..to fte" (an open end is "from..").
      diff: { changes: { memberCapacity: { from: before && summaryOf(before), to: after && summaryOf(after) } }, meta: { op, capacityId: row.id, userId: row.userId } },
    })
  }
}

// ---------------------------------------------------------------- own FTE ---------------------------------------------

export async function listUserCapacity(userId: string, db: Db = defaultDb): Promise<CapacityDto[]> {
  const rows = await db.memberCapacity.findMany({ where: { userId, projectId: null }, orderBy: [{ from: "asc" }, { id: "asc" }], select: SELECT })
  return rows.map(toDto)
}

export async function createUserCapacity(userId: string, input: CapacityCreateInput, actor: Actor): Promise<CapacityDto> {
  return withTransaction(async (tx) => {
    const user = await tx.user.findUnique({ where: { id: userId }, select: { id: true } })
    if (!user) throw new NotFoundError("利用者が見つかりません", {}, "CAPACITY_NOT_FOUND")
    await lockUser(tx, userId)
    const from = day(input.from)
    const to = input.to ? day(input.to) : null
    await assertNoOverlap(tx, userId, null, from, to)
    const row = await tx.memberCapacity.create({ data: { userId, projectId: null, from, to, fte: input.fte, createdById: actor.userId }, select: SELECT })
    await audit(tx, row, actor, "create", null, valuesOf(row))
    return toDto(row)
  })
}

// ---------------------------------------------------------------- project allocation ----------------------------------

export interface ProjectCapacityView {
  members: { userId: string; name: string; role: string }[]
  allocations: CapacityDto[]
}

/**
 * The project's explicit members and their allocations to it (own FTE rows are not shown here). Rows of someone who
 * left the project are not listed (they apply again only if the person rejoins; levelling uses members only).
 */
export async function listProjectAllocations(projectId: string, db: Db = defaultDb): Promise<ProjectCapacityView> {
  const members = await db.projectMember.findMany({ where: { projectId }, select: { userId: true, role: true, user: { select: { name: true } } }, orderBy: { userId: "asc" } })
  const rows = await db.memberCapacity.findMany({ where: { projectId, userId: { in: members.map((m) => m.userId) } }, orderBy: [{ userId: "asc" }, { from: "asc" }], select: SELECT })
  return { members: members.map((m) => ({ userId: m.userId, name: m.user.name ?? "", role: m.role })), allocations: rows.map(toDto) }
}

export async function createAllocation(projectId: string, input: AllocationCreateInput, actor: Actor): Promise<CapacityDto> {
  return withTransaction(async (tx) => {
    await lockUser(tx, input.userId)
    const member = await tx.projectMember.findFirst({ where: { projectId, userId: input.userId }, select: { userId: true } })
    if (!member) throw new ValidationError("このプロジェクトのメンバーではありません", {}, "CAPACITY_NOT_MEMBER")
    const from = day(input.from)
    const to = input.to ? day(input.to) : null
    await assertNoOverlap(tx, input.userId, projectId, from, to)
    const row = await tx.memberCapacity.create({ data: { userId: input.userId, projectId, from, to, fte: input.fte, createdById: actor.userId }, select: SELECT })
    await audit(tx, row, actor, "create", null, valuesOf(row))
    return toDto(row)
  })
}

// ---------------------------------------------------------------- shared update / delete ---------------------------------

/** Scope of a row for a caller: own FTE of `userId` (projectId null) or an allocation to `projectId`. */
export type CapacityScope = { userId: string; projectId: null } | { projectId: string }

const inScopeOf = (row: Row, scope: CapacityScope): boolean => ("userId" in scope ? row.projectId === null && row.userId === scope.userId : row.projectId === scope.projectId)

async function loadScoped(tx: Db, id: string, scope: CapacityScope): Promise<Row> {
  const row = await tx.memberCapacity.findUnique({ where: { id }, select: SELECT })
  const inScope = row !== null && inScopeOf(row, scope)
  if (!row || !inScope) throw new NotFoundError("稼働量の行が見つかりません", {}, "CAPACITY_NOT_FOUND")
  return row
}

export async function updateCapacity(id: string, scope: CapacityScope, input: CapacityUpdateInput, actor: Actor): Promise<CapacityDto> {
  return withTransaction(async (tx) => {
    const seen = await loadScoped(tx, id, scope)
    await lockUser(tx, seen.userId)
    // Re-read under the lock: the values audited as "before" are the ones replaced.
    const row = await loadScoped(tx, id, scope)
    if (row.version !== input.version) throw new ConflictError("稼働量が変更されています", {}, "CAPACITY_CHANGED")
    const from = day(input.from)
    const to = input.to ? day(input.to) : null
    await assertNoOverlap(tx, row.userId, row.projectId, from, to, row.id)
    const res = await tx.memberCapacity.updateMany({ where: { id, version: input.version }, data: { from, to, fte: input.fte, version: { increment: 1 } } })
    if (res.count !== 1) throw new ConflictError("稼働量が変更されています", {}, "CAPACITY_CHANGED")
    const updated = await tx.memberCapacity.findUniqueOrThrow({ where: { id }, select: SELECT })
    await audit(tx, row, actor, "update", valuesOf(row), valuesOf(updated))
    return toDto(updated)
  })
}

export async function deleteCapacity(id: string, scope: CapacityScope, version: number, actor: Actor): Promise<{ deleted: true }> {
  return withTransaction(async (tx) => {
    const seen = await loadScoped(tx, id, scope)
    await lockUser(tx, seen.userId)
    const row = await loadScoped(tx, id, scope)
    const res = await tx.memberCapacity.deleteMany({ where: { id, version } })
    if (res.count !== 1) throw new ConflictError("稼働量が変更されています", {}, "CAPACITY_CHANGED")
    await audit(tx, row, actor, "delete", valuesOf(row), null)
    return { deleted: true }
  })
}

// ---------------------------------------------------------------- reading for levelling --------------------------------

/** FTE per user and day ("YYYY-MM-DD"). */
export interface CapacityRows {
  /** The own-FTE row covering the day (default 1.0). */
  ownFte: (userId: string, dayKey: string) => number
  /** The own FTE capped by the allocation to the project. */
  fte: (userId: string, dayKey: string) => number
}

/** Rows of `userIds` (own FTE and allocations to `projectId`) still in force on or after `fromKey`. */
export async function capacityRows(userIds: readonly string[], projectId: string, db: Db = defaultDb, fromKey?: string): Promise<CapacityRows> {
  const since = fromKey ? dateFromKey(fromKey) : null
  const rows = userIds.length
    ? await db.memberCapacity.findMany({
        where: { userId: { in: [...userIds] }, OR: [{ projectId: null }, { projectId }], ...(since ? { AND: [{ OR: [{ to: null }, { to: { gte: since } }] }] } : {}) },
        orderBy: [{ from: "asc" }, { id: "asc" }],
        select: SELECT,
      })
    : []
  const own = new Map<string, Row[]>()
  const alloc = new Map<string, Row[]>()
  for (const r of rows) {
    const into = r.projectId === null ? own : alloc
    into.set(r.userId, [...(into.get(r.userId) ?? []), r])
  }
  const covers = (r: Row, k: string) => (key(r.from) as string) <= k && (r.to === null || (key(r.to) as string) >= k)
  const ownFte = (u: string, k: string) => own.get(u)?.find((r) => covers(r, k))?.fte ?? 1
  return {
    ownFte,
    fte: (u, k) => {
      const base = ownFte(u, k)
      const a = alloc.get(u)?.find((r) => covers(r, k))
      return a ? Math.min(base, a.fte) : base
    },
  }
}
