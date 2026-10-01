/**
 * Finish-to-start dependencies between PBIs ("#12 must be completed before
 * #15 can start"). Advisory: the backlog and the sprint picker show what a
 * PBI waits for; nothing is blocked server-side.
 */
import type { EntityI18n } from "@/lib/translation/types"
import type { Actor } from "@/services/_shared/actor"
import { logActivity } from "@/services/_shared/activity"
import { defaultDb, withTransaction, type Db } from "@/services/_shared/db"
import { ConflictError, NotFoundError, ValidationError, rethrowPrisma } from "@/services/_shared/errors"
import { getI18nFor } from "@/services/_shared/translations"
import { reaches } from "@/services/plan/plan.schedule"
import * as repo from "./backlog.dependencies.repository"

type Edge = { predecessorId: string; successorId: string }

/** The other end of a dependency as the backlog shows it. */
export interface PbiDependencyRefDto {
  /** Id of the link (DELETE /backlog/dependencies/:id). */
  dependencyId: string
  id: string
  displayId: number
  initiative: string | null
  userStory: string | null
  status: string
  i18n: EntityI18n
}

export interface PbiDependenciesDto {
  /** PBIs that must be completed before this one. */
  blockedBy: PbiDependencyRefDto[]
  /** PBIs waiting for this one. */
  blocking: PbiDependencyRefDto[]
}

const EMPTY: PbiDependenciesDto = { blockedBy: [], blocking: [] }

/** Pure: both directions per PBI id, one pass (fresh DTOs; the rows are not touched). */
export function groupDependencies(rows: readonly repo.DependencyRow[], i18n: ReadonlyMap<string, EntityI18n>): Map<string, PbiDependenciesDto> {
  const ref = (dependencyId: string, end: repo.DependencyRow["predecessor"]): PbiDependencyRefDto => ({
    dependencyId,
    ...end,
    i18n: i18n.get(end.id) ?? {},
  })
  // Local accumulator (built here, returned once): avoids re-copying arrays per link.
  const out = new Map<string, PbiDependenciesDto>()
  const entry = (id: string) => {
    const found = out.get(id)
    if (found) return found
    const fresh: PbiDependenciesDto = { blockedBy: [], blocking: [] }
    out.set(id, fresh)
    return fresh
  }
  for (const r of rows) {
    entry(r.successorId).blockedBy.push(ref(r.id, r.predecessor))
    entry(r.predecessorId).blocking.push(ref(r.id, r.successor))
  }
  return out
}

/** Live dependencies of the project (or of one PBI) grouped per PBI, with the ends' translations. */
export async function loadDependencies(db: Db, projectId: string, itemId?: string): Promise<Map<string, PbiDependenciesDto>> {
  const rows = await repo.findDependencyRows(db, projectId, itemId)
  if (rows.length === 0) return new Map()
  const i18n = await getI18nFor("backlog_item", rows.flatMap((r) => [r.predecessorId, r.successorId]))
  return groupDependencies(rows, i18n)
}

/** Each item plus its `blockedBy` / `blocking` (empty lists when it has none). */
export function withDependencies<T extends { id: string }>(items: readonly T[], deps: ReadonlyMap<string, PbiDependenciesDto>): (T & PbiDependenciesDto)[] {
  return items.map((i) => ({ ...i, ...(deps.get(i.id) ?? EMPTY) }))
}

/**
 * Pure guard for a new dependency: both PBIs live in the project (404), not
 * the same PBI (400 PBI_DEPENDENCY_INVALID), no duplicate (409
 * PBI_DEPENDENCY_EXISTS) and no cycle over ALL existing links, trashed ends
 * included (400 PBI_DEPENDENCY_CYCLE).
 */
export function assertValidPbiDependency(liveIds: ReadonlySet<string>, edges: readonly Edge[], dep: Edge): void {
  if (!liveIds.has(dep.predecessorId) || !liveIds.has(dep.successorId)) {
    throw new NotFoundError("Not found", {}, "PBI_NOT_FOUND")
  }
  if (dep.predecessorId === dep.successorId) {
    throw new ValidationError("同じ PBI どうしには依存関係を設定できません", {}, "PBI_DEPENDENCY_INVALID")
  }
  if (edges.some((e) => e.predecessorId === dep.predecessorId && e.successorId === dep.successorId)) {
    throw new ConflictError("この依存関係は既に設定されています", {}, "PBI_DEPENDENCY_EXISTS")
  }
  if (reaches(edges, dep.successorId, dep.predecessorId)) {
    throw new ValidationError("依存関係が循環します", {}, "PBI_DEPENDENCY_CYCLE")
  }
}

async function logDependency(tx: Db, projectId: string, dep: Edge, change: "added" | "removed", actor: Actor) {
  await logActivity(tx, {
    projectId,
    entityType: "pbi",
    entityId: dep.successorId,
    action: "update",
    actor,
    diff: { meta: { dependency: { [change]: dep.predecessorId } } },
  })
}

/** POST /backlog/dependencies: `predecessorId` must be completed before `successorId`. */
export async function createPbiDependency(projectId: string, dep: Edge, actor: Actor): Promise<{ id: string } & Edge> {
  return withTransaction(async (tx) => {
    const [liveIds, edges] = await Promise.all([
      repo.findLivePbiIds(tx, projectId, [dep.predecessorId, dep.successorId]),
      repo.findDependencyEdges(tx, projectId),
    ])
    assertValidPbiDependency(liveIds, edges, dep)
    const row = await repo.insertDependency(tx, { projectId, ...dep })
    await logDependency(tx, projectId, row, "added", actor)
    return row
  }).catch((err: unknown) =>
    // Two users adding the same link at once: the unique index decides.
    rethrowPrisma(err, { conflict: "この依存関係は既に設定されています", conflictCode: "PBI_DEPENDENCY_EXISTS" }),
  )
}

/** DELETE /backlog/dependencies/:id (404 when it is not a dependency of the project). */
export async function deletePbiDependency(projectId: string, id: string, actor: Actor): Promise<void> {
  await withTransaction(async (tx) => {
    const row = await repo.findDependency(tx, projectId, id)
    if (!row) throw new NotFoundError()
    await repo.deleteDependency(tx, id)
    await logDependency(tx, projectId, row, "removed", actor)
  })
}

/** Dependencies of one PBI (detail view). */
export async function getPbiDependencies(projectId: string, itemId: string): Promise<PbiDependenciesDto> {
  return (await loadDependencies(defaultDb, projectId, itemId)).get(itemId) ?? EMPTY
}
