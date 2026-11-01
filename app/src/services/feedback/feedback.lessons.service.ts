import type { Prisma } from "@/generated/prisma/client"
import { defaultDb, type Db } from "@/services/_shared/db"
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "@/services/_shared/errors"
import { logger } from "@/lib/logger"
import {
  canCurateScope,
  canSeeScope,
  curatesAnything,
  loadViewerAccess,
  projectScope,
  type FeedbackViewer,
  type ViewerAccess,
} from "./feedback.access"
import { parseEvidence, toFailureDto, toLessonDto, toSharedLessonDto, type FailureDto, type LessonDto, type SharedLessonDto } from "./feedback.dto"
import * as repo from "./feedback.repository"
import {
  SHARED_LESSON_STATES,
  type ConfirmLessonInput,
  type RetireLessonInput,
  type SearchLessonsInput,
  type SystemizeLessonInput,
} from "./feedback.schemas"
import { assertNoResidualSecret } from "./feedback.service"
import { allowedHostsFromEnv, redactText } from "./redact"

/**
 * Reading and curating lessons (W11).
 *
 *   mode "ai": what an AI session (token) may see — confirmed / systemized, non-confidential, in scope. Never anything else,
 *              whoever owns the token.
 *   mode "ui": the screens — additionally every lesson the viewer curates (drafts, retired, confidential).
 *
 * Curating (feedback.access): admin everything; section manager global / tech; project PO / SM their project.
 * A lesson the viewer may not even see answers 404 LESSON_NOT_FOUND; one they see but may not curate answers 403.
 */

const log = logger.child({ module: "feedback" })
const HISTORY_LIMIT = 20

export type LessonMode = "ai" | "ui"

function sharedWhere(a: ViewerAccess): Prisma.LessonWhereInput {
  const base: Prisma.LessonWhereInput = { state: { in: [...SHARED_LESSON_STATES] }, confidential: false }
  if (a.admin) return base
  const scopes: Prisma.LessonWhereInput[] = [{ scope: "global" }, { scope: { startsWith: "tech:" } }]
  if (a.memberProjects.size > 0) scopes.push({ scope: { in: [...a.memberProjects].map(projectScope) } })
  return { ...base, OR: scopes }
}

function curatableWhere(a: ViewerAccess): Prisma.LessonWhereInput | null {
  if (a.admin) return {}
  const scopes: Prisma.LessonWhereInput[] = []
  if (a.curatesGlobal) scopes.push({ scope: "global" }, { scope: { startsWith: "tech:" } })
  if (a.curatorProjects.size > 0) scopes.push({ scope: { in: [...a.curatorProjects].map(projectScope) } })
  return scopes.length > 0 ? { OR: scopes } : null
}

export function visibleWhere(a: ViewerAccess, mode: LessonMode): Prisma.LessonWhereInput {
  if (mode === "ai") return sharedWhere(a)
  const curatable = curatableWhere(a)
  return curatable ? { OR: [sharedWhere(a), curatable] } : sharedWhere(a)
}

function filterWhere(input: SearchLessonsInput): Prisma.LessonWhereInput[] {
  const and: Prisma.LessonWhereInput[] = []
  if (input.signature) and.push({ signature: input.signature })
  if (input.errorCode) and.push({ errorCode: input.errorCode })
  if (input.state) and.push({ state: input.state })
  if (input.tech || input.projectId) {
    const scopes = ["global"]
    if (input.tech) scopes.push(`tech:${input.tech}`)
    if (input.projectId) scopes.push(projectScope(input.projectId))
    and.push({ scope: { in: scopes } })
  }
  if (input.q) {
    // Plain `contains`: case-insensitive on MySQL's default collation. PostgreSQL needs `mode: "insensitive"` (migration checklist).
    and.push({ OR: [{ symptom: { contains: input.q } }, { cause: { contains: input.q } }, { fix: { contains: input.q } }, { errorCode: { contains: input.q } }] })
  }
  return and
}

export interface SearchLessonsResult<T> {
  lessons: T[]
  truncated: boolean
}

/** AI-facing search: shared lessons only. */
export async function searchSharedLessons(viewer: FeedbackViewer, input: SearchLessonsInput, db: Db = defaultDb): Promise<SearchLessonsResult<SharedLessonDto>> {
  const access = await loadViewerAccess(db, viewer)
  // A token never filters by state: only confirmed / systemized exist for it.
  const rows = await repo.listLessons(db, { AND: [visibleWhere(access, "ai"), ...filterWhere({ ...input, state: undefined })] }, input.limit + 1)
  return { lessons: rows.slice(0, input.limit).map(toSharedLessonDto), truncated: rows.length > input.limit }
}

export interface LessonListResult extends SearchLessonsResult<LessonDto> {
  /** The viewer may confirm / retire / systemize at least some lessons. */
  canCurate: boolean
  /** Per lesson: may the viewer curate it (the action buttons). */
  curatable: Record<string, boolean>
}

/** Screen list: shared lessons plus everything the viewer curates. */
export async function listLessonsForScreen(viewer: FeedbackViewer, input: SearchLessonsInput, db: Db = defaultDb): Promise<LessonListResult> {
  const access = await loadViewerAccess(db, viewer)
  const rows = await repo.listLessons(db, { AND: [visibleWhere(access, "ui"), ...filterWhere(input)] }, input.limit + 1)
  const page = rows.slice(0, input.limit)
  return {
    lessons: page.map(toLessonDto),
    truncated: rows.length > input.limit,
    canCurate: curatesAnything(access),
    curatable: Object.fromEntries(page.map((r) => [r.id, canCurateScope(access, r.scope)])),
  }
}

export interface FailureHistoryItem extends FailureDto {
  projectName: string | null
  excerpt: string
  resolution: { diffSummary: string; createdAt: string } | null
}

export interface LessonDetail {
  lesson: LessonDto
  canCurate: boolean
  /** Failures with the lesson's signature the viewer may see (curators only), newest first. */
  failures: FailureHistoryItem[]
}

function failureHistoryWhere(a: ViewerAccess, signature: string): Prisma.FailureEventWhereInput | null {
  if (a.admin) return { signature }
  const or: Prisma.FailureEventWhereInput[] = []
  if (a.curatesGlobal) or.push({ projectId: null })
  if (a.curatorProjects.size > 0) or.push({ projectId: { in: [...a.curatorProjects] } })
  return or.length > 0 ? { signature, OR: or } : null
}

async function loadVisible(db: Db, access: ViewerAccess, id: string): Promise<{ row: repo.LessonRow; canCurate: boolean }> {
  const row = await repo.findLessonById(db, id)
  if (!row) throw new NotFoundError("Lesson not found", {}, "LESSON_NOT_FOUND")
  const canCurate = canCurateScope(access, row.scope)
  const shared = (SHARED_LESSON_STATES as readonly string[]).includes(row.state) && !row.confidential && canSeeScope(access, row.scope)
  if (!canCurate && !shared) throw new NotFoundError("Lesson not found", {}, "LESSON_NOT_FOUND")
  return { row, canCurate }
}

export async function getLessonDetail(viewer: FeedbackViewer, id: string, db: Db = defaultDb): Promise<LessonDetail> {
  const access = await loadViewerAccess(db, viewer)
  const { row, canCurate } = await loadVisible(db, access, id)
  const where = canCurate ? failureHistoryWhere(access, row.signature) : null
  const failures = where ? await repo.listFailures(db, where, HISTORY_LIMIT) : []
  return {
    lesson: toLessonDto(row),
    canCurate,
    failures: failures.map((f) => ({
      ...toFailureDto(f),
      projectName: f.project?.name ?? null,
      excerpt: f.excerpt,
      resolution: f.resolutions[0] ? { diffSummary: f.resolutions[0].diffSummary, createdAt: f.resolutions[0].createdAt.toISOString() } : null,
    })),
  }
}

// --- curation ----------------------------------------------------------------

async function loadCuratable(db: Db, access: ViewerAccess, id: string): Promise<repo.LessonRow> {
  const { row, canCurate } = await loadVisible(db, access, id)
  if (!canCurate) throw new ForbiddenError("Forbidden", {}, "FORBIDDEN")
  return row
}

function clean(value: string | null | undefined, userId: string, what: string): string | null | undefined {
  if (value === undefined || value === null) return value
  const text = redactText(value, { allowedHosts: allowedHostsFromEnv() }).text
  assertNoResidualSecret({ [what]: text }, { userId, what: "lesson" })
  return text
}

const stateConflict = (message: string) => new ConflictError(message, {}, "LESSON_STATE")

async function afterRace(db: Db, id: string, ok: (state: string) => boolean, message: string): Promise<LessonDto> {
  const now = await repo.findLessonById(db, id)
  if (now && ok(now.state)) return toLessonDto(now)
  throw stateConflict(message)
}

/** draft | retired → confirmed. The maintainer may correct the text and the scope; a lesson needs a fix to be confirmed. Confirming a confirmed lesson is a no-op. */
export async function confirmLesson(viewer: FeedbackViewer, id: string, input: ConfirmLessonInput, now: Date = new Date(), db: Db = defaultDb): Promise<LessonDto> {
  const access = await loadViewerAccess(db, viewer)
  const lesson = await loadCuratable(db, access, id)
  if (lesson.state === "confirmed") return toLessonDto(lesson)
  if (lesson.state === "systemized") throw stateConflict("The lesson is already systemized")

  const scope = input.scope ?? lesson.scope
  if (scope !== lesson.scope) {
    if (!canCurateScope(access, scope)) throw new ForbiddenError("Forbidden", {}, "FORBIDDEN")
    const clash = await repo.findLessonByKey(db, lesson.signature, scope)
    if (clash && clash.id !== lesson.id) throw new ConflictError("A lesson with this signature already exists in that scope", {}, "CONFLICT")
  }
  const fix = clean(input.fix, viewer.userId, "fix") ?? lesson.fix
  if (!fix?.trim()) throw new ValidationError("A lesson needs a fix before it can be confirmed", {}, "VALIDATION")
  const data: Prisma.LessonUncheckedUpdateManyInput = {
    state: "confirmed",
    scope,
    fix,
    confirmedById: viewer.userId,
    confirmedAt: now,
    ...(input.symptom !== undefined ? { symptom: clean(input.symptom, viewer.userId, "symptom") ?? lesson.symptom } : {}),
    ...(input.cause !== undefined ? { cause: clean(input.cause, viewer.userId, "cause") } : {}),
    ...(input.verify !== undefined ? { verify: clean(input.verify, viewer.userId, "verify") } : {}),
    ...(input.confidential !== undefined ? { confidential: input.confidential } : {}),
  }
  const changed = await repo.transitionLesson(db, id, ["draft", "retired"], data)
  if (changed === 0) return afterRace(db, id, (s) => s === "confirmed", "The lesson was changed by someone else; reload and try again")
  log.info("lesson confirmed", { lessonId: id, userId: viewer.userId, scope })
  return toLessonDto((await repo.findLessonById(db, id)) ?? lesson)
}

/** draft | confirmed | systemized → retired (no longer shown to AI sessions). Retiring a retired lesson is a no-op. */
export async function retireLesson(viewer: FeedbackViewer, id: string, input: RetireLessonInput, db: Db = defaultDb): Promise<LessonDto> {
  const access = await loadViewerAccess(db, viewer)
  const lesson = await loadCuratable(db, access, id)
  if (lesson.state === "retired") return toLessonDto(lesson)
  const reason = clean(input.reason, viewer.userId, "reason")
  const evidence = reason ? JSON.stringify([...parseEvidence(lesson.evidence), `retired: ${reason}`].slice(-20)) : lesson.evidence
  const changed = await repo.transitionLesson(db, id, ["draft", "confirmed", "systemized"], { state: "retired", evidence })
  if (changed === 0) return afterRace(db, id, (s) => s === "retired", "The lesson was changed by someone else; reload and try again")
  log.info("lesson retired", { lessonId: id, userId: viewer.userId, from: lesson.state })
  return toLessonDto((await repo.findLessonById(db, id)) ?? lesson)
}

/** confirmed → systemized: the lesson is now guarded by a PBI, gate or test (the link is required). Systemizing a systemized lesson with the same link is a no-op. */
export async function systemizeLesson(viewer: FeedbackViewer, id: string, input: SystemizeLessonInput, db: Db = defaultDb): Promise<LessonDto> {
  const access = await loadViewerAccess(db, viewer)
  const lesson = await loadCuratable(db, access, id)
  const ref = `${input.kind}:${clean(input.ref, viewer.userId, "ref")}`
  if (lesson.state === "systemized" && lesson.systemizedRef === ref) return toLessonDto(lesson)
  if (lesson.state !== "confirmed") throw stateConflict("Only a confirmed lesson can be systemized")
  const changed = await repo.transitionLesson(db, id, ["confirmed"], { state: "systemized", systemizedRef: ref })
  if (changed === 0) return afterRace(db, id, (s) => s === "systemized", "The lesson was changed by someone else; reload and try again")
  log.info("lesson systemized", { lessonId: id, userId: viewer.userId, ref })
  return toLessonDto((await repo.findLessonById(db, id)) ?? lesson)
}

