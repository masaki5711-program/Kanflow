import type { Prisma } from "@/generated/prisma/client"
import type { Db } from "@/services/_shared/db"

/** Prisma access of the feedback loop (W11). Portable Prisma queries only (no raw SQL). */

export const LESSON_SELECT = {
  id: true,
  signature: true,
  scope: true,
  state: true,
  symptom: true,
  cause: true,
  fix: true,
  verify: true,
  evidence: true,
  errorCode: true,
  confidential: true,
  hits: true,
  resolvedCount: true,
  lastSeenAt: true,
  confirmedAt: true,
  confirmedBy: { select: { id: true, name: true } },
  systemizedRef: true,
  createdAt: true,
  updatedAt: true,
} as const satisfies Prisma.LessonSelect
export type LessonRow = Prisma.LessonGetPayload<{ select: typeof LESSON_SELECT }>

export const FAILURE_SELECT = {
  id: true,
  projectId: true,
  source: true,
  signature: true,
  signatureText: true,
  tool: true,
  errorCode: true,
  excerpt: true,
  sessionRef: true,
  branch: true,
  repeatCount: true,
  createdAt: true,
} as const satisfies Prisma.FailureEventSelect
export type FailureRow = Prisma.FailureEventGetPayload<{ select: typeof FAILURE_SELECT }>

/** The same reporter's failure with this signature within the collapse window. */
export function findRecentSameFailure(db: Db, signature: string, reportedById: string, since: Date) {
  return db.failureEvent.findFirst({
    where: { signature, reportedById, createdAt: { gte: since } },
    orderBy: { createdAt: "desc" },
    select: FAILURE_SELECT,
  })
}

export function foldRepeat(db: Db, id: string) {
  return db.failureEvent.update({ where: { id }, data: { repeatCount: { increment: 1 } }, select: FAILURE_SELECT })
}

export interface NewFailure {
  projectId: string | null
  source: string
  signature: string
  signatureText: string
  tool: string
  errorCode: string | null
  excerpt: string
  sessionRef: string | null
  branch: string | null
  reportedById: string
}

export function createFailure(db: Db, data: NewFailure) {
  return db.failureEvent.create({ data, select: FAILURE_SELECT })
}

/** Counts a (non-collapsed) report against every lesson of the signature that is not retired. */
export function bumpLessonHits(db: Db, signature: string, at: Date) {
  return db.lesson.updateMany({ where: { signature, state: { not: "retired" } }, data: { hits: { increment: 1 }, lastSeenAt: at } })
}

export function findSharedLessonsBySignature(db: Db, signature: string, states: readonly string[]) {
  return db.lesson.findMany({
    where: { signature, state: { in: [...states] }, confidential: false },
    select: LESSON_SELECT,
    orderBy: [{ hits: "desc" }],
    take: 20,
  })
}

/** The session's latest unresolved failure of the caller (or the one named by id). */
export function findFailureToResolve(db: Db, args: { reportedById: string; sessionRef: string; failureEventId?: string; projectId?: string; since: Date }) {
  const base: Prisma.FailureEventWhereInput = { reportedById: args.reportedById, resolutions: { none: {} } }
  if (args.failureEventId) return db.failureEvent.findFirst({ where: { ...base, id: args.failureEventId }, select: FAILURE_SELECT })
  return db.failureEvent.findFirst({
    where: { ...base, sessionRef: args.sessionRef, createdAt: { gte: args.since }, ...(args.projectId ? { projectId: args.projectId } : {}) },
    orderBy: { createdAt: "desc" },
    select: FAILURE_SELECT,
  })
}

export function findLessonByKey(db: Db, signature: string, scope: string) {
  return db.lesson.findUnique({ where: { signature_scope: { signature, scope } }, select: LESSON_SELECT })
}

export function findLessonById(db: Db, id: string) {
  return db.lesson.findUnique({ where: { id }, select: LESSON_SELECT })
}

export function countFailuresOfSignature(db: Db, signature: string) {
  return db.failureEvent.count({ where: { signature } })
}

export interface NewLesson {
  signature: string
  scope: string
  symptom: string
  cause: string | null
  fix: string | null
  verify: string | null
  evidence: string | null
  errorCode: string | null
  hits: number
  resolvedCount: number
  lastSeenAt: Date
}

export function createLesson(db: Db, data: NewLesson) {
  return db.lesson.create({ data: { ...data, state: "draft" }, select: LESSON_SELECT })
}

export function updateLessonData(db: Db, id: string, data: Prisma.LessonUpdateInput) {
  return db.lesson.update({ where: { id }, data, select: LESSON_SELECT })
}

export function createResolution(db: Db, data: { failureEventId: string; lessonId: string; diffSummary: string; verifiedCommand: string | null }) {
  return db.lessonResolution.create({ data, select: { id: true, failureEventId: true, lessonId: true, diffSummary: true, verifiedCommand: true, createdAt: true } })
}

/**
 * Compare-and-set state change: only when the lesson is still in one of `from`.
 * Returns the number of rows changed (0 = somebody else changed it first).
 */
export async function transitionLesson(db: Db, id: string, from: readonly string[], data: Prisma.LessonUncheckedUpdateManyInput) {
  const { count } = await db.lesson.updateMany({ where: { id, state: { in: [...from] } }, data })
  return count
}

export function listLessons(db: Db, where: Prisma.LessonWhereInput, take: number) {
  return db.lesson.findMany({ where, select: LESSON_SELECT, orderBy: [{ lastSeenAt: "desc" }, { createdAt: "desc" }], take })
}

export function listFailures(db: Db, where: Prisma.FailureEventWhereInput, take: number) {
  return db.failureEvent.findMany({
    where,
    select: { ...FAILURE_SELECT, project: { select: { id: true, name: true } }, resolutions: { select: { diffSummary: true, createdAt: true }, take: 1 } },
    orderBy: { createdAt: "desc" },
    take,
  })
}
