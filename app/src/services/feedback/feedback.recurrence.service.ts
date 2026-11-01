import { logger } from "@/lib/logger"
import { defaultDb, withTransaction, type Db } from "@/services/_shared/db"
import * as chat from "@/services/chat-threads/chat-threads.repository"
import { serializeToolEvents } from "@/services/chat-threads/chat-threads.service"
import { projectScope } from "./feedback.access"
import { asProposalLang, buildPreventionProposal, threadMarker } from "./feedback.recurrence"

/**
 * Recurrence step (W11; run daily by the worker, worker/collab-daily): for a failure signature that
 *   (a) happened more than RECURRENCE_THRESHOLD times in the last RECURRENCE_WINDOW_DAYS days, or
 *   (b) has a confirmed / systemized lesson and happened again after it was confirmed,
 * propose ONE prevention PBI. The proposal is the existing AI-chat proposal (a `create_pbi` card in a
 * chat thread of each PO of the project that suffered most): nothing is created until a PO approves.
 *
 * Idempotent: `lesson.preventionProposedAt` is claimed with a compare-and-set UPDATE inside the same
 * transaction that creates the threads, so a crash leaves nothing half-done and a second run (or a
 * second worker) proposes nothing again. A signature whose lessons are all retired is left alone.
 * A signature with no project (all reports outside a project) or a project without an active PO is
 * counted and logged, not proposed.
 */

const log = logger.child({ module: "feedback-recurrence" })

export const RECURRENCE_WINDOW_DAYS = 30
/** More than this many reports in the window. */
export const RECURRENCE_THRESHOLD = 3
const MAX_SIGNATURES = 100
const MAX_RECIPIENTS = 5
const DAY_MS = 86_400_000

export interface RecurrenceResult {
  candidates: number
  proposed: number
  alreadyProposed: number
  retired: number
  skippedNoProject: number
  skippedNoPo: number
  failed: number
}

export interface RecurrenceOptions {
  now?: Date
  db?: Db
  signal?: AbortSignal
}

interface Candidate {
  signature: string
  /** Reason (b): a confirmed lesson came back. */
  lessonRecurred: boolean
}

async function findCandidates(db: Db, since: Date): Promise<Candidate[]> {
  const frequent = await db.failureEvent.groupBy({
    by: ["signature"],
    where: { createdAt: { gte: since } },
    _count: { _all: true },
    having: { signature: { _count: { gt: RECURRENCE_THRESHOLD } } },
    orderBy: { signature: "asc" },
    take: MAX_SIGNATURES,
  })
  const confirmed = await db.lesson.findMany({
    where: { state: { in: ["confirmed", "systemized"] }, preventionProposedAt: null, confirmedAt: { not: null }, lastSeenAt: { not: null } },
    select: { signature: true, confirmedAt: true, lastSeenAt: true },
    take: 500,
  })
  const out = new Map<string, Candidate>()
  for (const f of frequent) out.set(f.signature, { signature: f.signature, lessonRecurred: false })
  for (const l of confirmed) {
    if (l.confirmedAt && l.lastSeenAt && l.lastSeenAt.getTime() > l.confirmedAt.getTime()) {
      out.set(l.signature, { signature: l.signature, lessonRecurred: true })
    }
  }
  return [...out.values()].slice(0, MAX_SIGNATURES)
}

export async function runFeedbackRecurrence(opts: RecurrenceOptions = {}): Promise<RecurrenceResult> {
  const db = opts.db ?? defaultDb
  const now = opts.now ?? new Date()
  const since = new Date(now.getTime() - RECURRENCE_WINDOW_DAYS * DAY_MS)
  const result: RecurrenceResult = { candidates: 0, proposed: 0, alreadyProposed: 0, retired: 0, skippedNoProject: 0, skippedNoPo: 0, failed: 0 }

  const candidates = await findCandidates(db, since)
  result.candidates = candidates.length
  for (const candidate of candidates) {
    if (opts.signal?.aborted) break
    try {
      const outcome = await proposeFor(db, candidate, since, now)
      result[outcome] += 1
    } catch (error) {
      result.failed += 1
      log.error("prevention proposal failed", { signature: candidate.signature.slice(0, 12), error: error instanceof Error ? error.message : String(error), errorCode: "FEEDBACK_RECURRENCE_FAILED" })
    }
  }
  return result
}

type Outcome = "proposed" | "alreadyProposed" | "retired" | "skippedNoProject" | "skippedNoPo"

async function proposeFor(db: Db, candidate: Candidate, since: Date, now: Date): Promise<Outcome> {
  const { signature } = candidate
  const lessons = await db.lesson.findMany({
    where: { signature },
    select: { id: true, scope: true, state: true, confidential: true, fix: true, systemizedRef: true, preventionProposedAt: true },
    orderBy: { createdAt: "asc" },
    take: 20,
  })
  if (lessons.some((l) => l.preventionProposedAt)) return "alreadyProposed"
  if (lessons.length > 0 && lessons.every((l) => l.state === "retired")) return "retired"

  const perProject = await db.failureEvent.groupBy({
    by: ["projectId"],
    where: { signature, createdAt: { gte: since }, projectId: { not: null } },
    _count: { _all: true },
    orderBy: { projectId: "asc" },
    take: 50,
  })
  const top = [...perProject].sort((a, b) => b._count._all - a._count._all)[0]
  if (!top?.projectId) return "skippedNoProject"
  // Everything that goes into the PBI card comes from the TARGET project: its own failures and lessons a
  // maintainer confirmed that are visible to it (global, tech:*, project:<target>, non-confidential).
  // Drafts and other projects' text never reach the card.
  const total = top._count._all
  const latest = await db.failureEvent.findFirst({
    where: { signature, projectId: top.projectId },
    orderBy: { createdAt: "desc" },
    select: { signatureText: true, tool: true, errorCode: true },
  })
  if (!latest) return "skippedNoProject"
  const project = await db.project.findUnique({ where: { id: top.projectId }, select: { id: true, name: true, language: true, deletedAt: true } })
  if (!project || project.deletedAt) return "skippedNoProject"
  const pos = await db.projectMember.findMany({ where: { projectId: project.id, role: "po", user: { isActive: true } }, select: { userId: true }, orderBy: { joinedAt: "asc" }, take: MAX_RECIPIENTS })
  if (pos.length === 0) return "skippedNoPo"

  const targetScope = projectScope(project.id)
  const eligible = lessons.find(
    (l) => (l.state === "confirmed" || l.state === "systemized") && !l.confidential && (l.scope === "global" || l.scope.startsWith("tech:") || l.scope === targetScope),
  )
  const lesson = lessons.find((l) => l.state !== "retired")
  const built = buildPreventionProposal(
    {
      signature,
      signatureText: latest.signatureText,
      tool: latest.tool,
      errorCode: latest.errorCode,
      count: total,
      windowDays: RECURRENCE_WINDOW_DAYS,
      lessonRecurred: candidate.lessonRecurred && eligible !== undefined,
      projectName: project.name,
      fix: eligible?.fix ?? null,
      systemizedRef: eligible?.systemizedRef ?? null,
    },
    asProposalLang(project.language),
  )
  const events = serializeToolEvents([{ type: "proposal", proposal: built.proposal }])
  const title = `${built.title.slice(0, 180)} ${threadMarker(signature)}`

  return withTransaction(async (tx) => {
    // Claim (or create) the lesson row that remembers "proposed": exactly one run wins.
    let lessonId = lesson?.id
    if (!lessonId) {
      const created = await tx.lesson.create({
        data: { signature, scope: "global", state: "draft", symptom: latest.signatureText || latest.errorCode || latest.tool, errorCode: latest.errorCode, hits: total, lastSeenAt: now },
        select: { id: true },
      })
      lessonId = created.id
    }
    const claimed = await tx.lesson.updateMany({ where: { id: lessonId, preventionProposedAt: null }, data: { preventionProposedAt: now } })
    if (claimed.count !== 1) return "alreadyProposed" as const
    for (const po of pos) {
      const thread = await chat.createThread(tx, { projectId: project.id, userId: po.userId }, title)
      await chat.insertMessage(tx, { threadId: thread.id, role: "assistant", content: built.message, toolEvents: events })
    }
    log.info("prevention proposal created", { signature: signature.slice(0, 12), projectId: project.id, recipients: pos.length, count: total, lessonRecurred: candidate.lessonRecurred })
    return "proposed" as const
  })
}
