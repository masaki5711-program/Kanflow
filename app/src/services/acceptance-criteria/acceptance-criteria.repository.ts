import type { Db } from "@/services/_shared/db"
import { NOT_DELETED } from "@/services/_shared/soft-delete"
import { AC_SELECT } from "./acceptance-criteria.view"

/** A live PBI of the project by internal id or number (with the number the display ids need). */
export function findPbi(db: Db, projectId: string, ref: { id: string } | { displayId: number }) {
  return db.productBacklogItem.findFirst({
    where: { projectId, ...NOT_DELETED, ...("id" in ref ? { id: ref.id } : { displayId: ref.displayId }) },
    select: { id: true, displayId: true, initiative: true, userStory: true },
  })
}

/**
 * Serializes the allocation of `seq` on one PBI: an exclusive row lock on the PBI, taken
 * inside the create transaction before `max(seq)` is read. Same statement as
 * dev-work.repository.lockPbi (PostgreSQL: identical `SELECT ... FOR UPDATE`; listed with the
 * raw SQL to re-test at the PostgreSQL migration). The transaction runs READ COMMITTED so the
 * `max(seq)` read after the lock sees what the previous lock holder committed.
 */
export async function lockPbi(db: Db, pbiId: string): Promise<void> {
  await db.$queryRaw`SELECT id FROM ProductBacklogItem WHERE id = ${pbiId} FOR UPDATE`
}

/** Live criteria of a PBI in `seq` order (bounded by AC_MAX_PER_PBI at write time). */
export function findLive(db: Db, pbiId: string) {
  return db.acceptanceCriterion.findMany({ where: { pbiId, ...NOT_DELETED }, select: AC_SELECT, orderBy: { seq: "asc" }, take: 500 })
}

/** Live criteria of several PBIs (the backlog export / get_pbi style readers), `seq` order per PBI. */
export function findLiveOfPbis(db: Db, pbiIds: string[]) {
  return db.acceptanceCriterion.findMany({
    where: { pbiId: { in: pbiIds }, ...NOT_DELETED },
    select: { pbiId: true, ...AC_SELECT },
    orderBy: [{ pbiId: "asc" }, { seq: "asc" }],
  })
}

export function countLive(db: Db, pbiId: string) {
  return db.acceptanceCriterion.count({ where: { pbiId, ...NOT_DELETED } })
}

/** Highest seq ever used on the PBI — deleted rows included, so a seq is never reused. */
export async function maxSeq(db: Db, pbiId: string): Promise<number> {
  const agg = await db.acceptanceCriterion.aggregate({ where: { pbiId }, _max: { seq: true } })
  return agg._max.seq ?? 0
}

export interface AcFields {
  given: string | null
  when: string | null
  then: string | null
  text: string | null
  evidenceKind: string | null
}

export function create(db: Db, data: AcFields & { pbiId: string; seq: number; createdById: string | null }) {
  return db.acceptanceCriterion.create({ data: { ...data, updatedById: data.createdById }, select: AC_SELECT })
}

/** A live criterion by its number on the PBI. */
export function findBySeq(db: Db, pbiId: string, seq: number) {
  return db.acceptanceCriterion.findFirst({ where: { pbiId, seq, ...NOT_DELETED }, select: { id: true, ...AC_SELECT } })
}

export function update(db: Db, id: string, data: Partial<AcFields> & { updatedById: string | null }) {
  return db.acceptanceCriterion.update({ where: { id }, data, select: AC_SELECT })
}

export function softDelete(db: Db, id: string, deletedById: string | null, now: Date) {
  return db.acceptanceCriterion.update({ where: { id }, data: { deletedAt: now, deletedById, updatedById: deletedById }, select: AC_SELECT })
}
