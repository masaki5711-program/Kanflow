import type { Actor } from "@/services/_shared/actor"
import { defaultDb, withTransaction, type Db } from "@/services/_shared/db"
import { ConflictError, isUniqueViolation, NotFoundError, StatusError, ValidationError } from "@/services/_shared/errors"
import { retryOnUniqueViolation } from "@/services/_shared/unique-retry"
import { logger } from "@/lib/logger"
import { parseScope, projectScope } from "./feedback.access"
import { parseEvidence, toFailureDto, toSharedLessonDto, type FailureDto, type LessonDto, type SharedLessonDto, toLessonDto } from "./feedback.dto"
import * as repo from "./feedback.repository"
import { SHARED_LESSON_STATES, type ReportFailureInput, type ReportResolutionInput } from "./feedback.schemas"
import { allowedHostsFromEnv, findResidualSecret, redactText } from "./redact"
import { hashSignature, normalizeFailureText, normalizeTool } from "./signature"
import { EXCERPT_MAX_BYTES } from "./feedback.schemas"

/**
 * Reporting side of the feedback loop (W11): failures and their resolutions.
 *
 * Failure: redact (second layer) → refuse when something credential-like remains
 * (422 FEEDBACK_REDACTION_FAILED, nothing stored) → signature → store, folding a repeat of the
 * same signature by the same reporter within a minute into one row → count it against the
 * lessons of the signature → answer with at most 3 confirmed lessons that apply (within
 * LESSON_LOOKUP_TIMEOUT_MS; the failure is recorded first, so a slow lookup costs only the hint).
 *
 * Resolution: attaches to the session's latest unresolved failure and creates the draft lesson
 * (or counts the fix on the existing one). Nothing becomes visible to AI sessions before a
 * Maintainer / SM confirms it (feedback.curation.service).
 */

const log = logger.child({ module: "feedback" })

export const COLLAPSE_WINDOW_MS = 60_000
export const RESOLUTION_LOOKBACK_MS = 24 * 3_600_000
export const LESSONS_PER_REPORT = 3
export const LESSON_LOOKUP_TIMEOUT_MS = 2_000
const EVIDENCE_MAX = 20

/** Truncates to `maxBytes` of UTF-8 without cutting a character. */
export function clipUtf8(text: string, maxBytes: number): string {
  const buf = Buffer.from(text, "utf8")
  if (buf.length <= maxBytes) return text
  let end = maxBytes
  while (end > 0 && (buf[end] & 0xc0) === 0x80) end--
  return buf.subarray(0, end).toString("utf8")
}

/** The stored excerpt: all of a short text, otherwise its head and its tail (errors are usually at the end). */
export function clipExcerpt(text: string, maxBytes: number = EXCERPT_MAX_BYTES): string {
  if (Buffer.byteLength(text, "utf8") <= maxBytes) return text
  const marker = "\n[…]\n"
  const budget = maxBytes - Buffer.byteLength(marker, "utf8")
  const head = clipUtf8(text, Math.floor(budget * 0.6))
  const tailBytes = budget - Buffer.byteLength(head, "utf8")
  const buf = Buffer.from(text, "utf8")
  let start = buf.length - tailBytes
  while (start < buf.length && (buf[start] & 0xc0) === 0x80) start++
  return `${head}${marker}${buf.subarray(start).toString("utf8")}`
}

/** Does a lesson scope apply to this report? */
export function scopeApplies(scope: string, ctx: { projectId: string | null; techs: readonly string[]; tool: string }): boolean {
  const s = parseScope(scope)
  if (s.kind === "global") return true
  if (s.kind === "project") return ctx.projectId !== null && s.id === ctx.projectId.toLowerCase()
  return ctx.techs.includes(s.name) || normalizeTool(ctx.tool).split(" ")[0] === s.name
}

/** Rejects when any stored field still looks like a credential. Nothing is stored; the kind (never the value) is logged. */
export function assertNoResidualSecret(fields: Readonly<Record<string, string | null | undefined>>, ctx: { userId: string; what: string }): void {
  for (const [field, value] of Object.entries(fields)) {
    if (!value) continue
    const kind = findResidualSecret(value)
    if (kind) {
      log.warn("report refused: credential-like content remains after redaction", { what: ctx.what, field, kind, userId: ctx.userId, errorCode: "FEEDBACK_REDACTION_FAILED" })
      throw new StatusError(422, "The report still contains something that looks like a credential, so it was not stored. Remove it and send again", {}, "FEEDBACK_REDACTION_FAILED")
    }
  }
}

function redactField(value: string, hosts: readonly string[], counts: { total: number }): string {
  const r = redactText(value, { allowedHosts: hosts })
  counts.total += r.total
  return r.text
}

async function withTimeout<T>(work: Promise<T>, ms: number): Promise<T | "timeout"> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<"timeout">((resolve) => {
    timer = setTimeout(() => resolve("timeout"), ms)
  })
  try {
    return await Promise.race([work, timeout])
  } finally {
    if (timer) clearTimeout(timer)
  }
}

export interface ReportFailureResult {
  failure: FailureDto
  /** True when the report was folded into an earlier row of the same signature (same reporter, within a minute). */
  collapsed: boolean
  /** At most 3 confirmed / systemized, non-confidential lessons that apply. */
  lessons: SharedLessonDto[]
  /** The lesson lookup did not finish in time or failed (logged); the failure itself is recorded. */
  lessonsUnavailable?: true
}

export async function reportFailure(input: ReportFailureInput, actor: Actor, now: Date = new Date(), db: Db = defaultDb): Promise<ReportFailureResult> {
  const hosts = allowedHostsFromEnv()
  const redacted = redactText(input.text, { allowedHosts: hosts })
  const signatureText = normalizeFailureText(redacted.text)
  if (!signatureText && !input.errorCode) throw new ValidationError("The failure text has no meaningful content", {}, "VALIDATION")
  const signature = hashSignature(input.tool, input.errorCode, signatureText)
  const excerpt = clipExcerpt(redacted.text)
  const tool = input.tool.trim()
  const errorCode = input.errorCode ?? null

  assertNoResidualSecret(
    { excerpt, signatureText, tool, errorCode, sessionRef: input.sessionRef, branch: input.branch },
    { userId: actor.userId, what: "failure" },
  )
  if (redacted.total > 0) log.info("failure report redacted", { userId: actor.userId, tool, ...redacted.counts })

  const since = new Date(now.getTime() - COLLAPSE_WINDOW_MS)
  const { failure, collapsed } = await withTransaction(async (tx) => {
    const same = await repo.findRecentSameFailure(tx, signature, actor.userId, since)
    if (same) return { failure: await repo.foldRepeat(tx, same.id), collapsed: true }
    const created = await repo.createFailure(tx, {
      projectId: input.projectId ?? null,
      source: input.source,
      signature,
      signatureText,
      tool,
      errorCode,
      excerpt,
      sessionRef: input.sessionRef ?? null,
      branch: input.branch ?? null,
      reportedById: actor.userId,
    })
    await repo.bumpLessonHits(tx, signature, now)
    return { failure: created, collapsed: false }
  })

  const base: ReportFailureResult = { failure: toFailureDto(failure), collapsed, lessons: [] }
  try {
    const found = await withTimeout(sharedLessonsFor(db, signature, { projectId: input.projectId ?? null, techs: input.techs ?? [], tool }), LESSON_LOOKUP_TIMEOUT_MS)
    if (found === "timeout") {
      log.warn("lesson lookup timed out; failure recorded without hints", { signature, timeoutMs: LESSON_LOOKUP_TIMEOUT_MS })
      return { ...base, lessonsUnavailable: true }
    }
    return { ...base, lessons: found }
  } catch (error) {
    log.warn("lesson lookup failed; failure recorded without hints", { signature, error: error instanceof Error ? error.message : String(error) })
    return { ...base, lessonsUnavailable: true }
  }
}

/** Confirmed / systemized, non-confidential lessons of the signature that apply to the report, at most 3 (systemized first, then most hit). */
export async function sharedLessonsFor(db: Db, signature: string, ctx: { projectId: string | null; techs: readonly string[]; tool: string }): Promise<SharedLessonDto[]> {
  const rows = await repo.findSharedLessonsBySignature(db, signature, SHARED_LESSON_STATES)
  return rows
    .filter((r) => scopeApplies(r.scope, ctx))
    .sort((a, b) => Number(b.state === "systemized") - Number(a.state === "systemized") || b.hits - a.hits)
    .slice(0, LESSONS_PER_REPORT)
    .map(toSharedLessonDto)
}

export interface ReportResolutionResult {
  resolution: { id: string; failureEventId: string; lessonId: string; createdAt: string }
  lesson: LessonDto
  /** True when this resolution created the (draft) lesson. */
  lessonCreated: boolean
}

function mergeEvidence(existing: string[], added: readonly string[]): string[] {
  return [...new Set([...existing, ...added])].slice(0, EVIDENCE_MAX)
}

export async function reportResolution(input: ReportResolutionInput, actor: Actor, now: Date = new Date()): Promise<ReportResolutionResult> {
  const hosts = allowedHostsFromEnv()
  const counts = { total: 0 }
  const diffSummary = redactField(input.diffSummary, hosts, counts)
  const verifiedCommand = input.verifiedCommand ? redactField(input.verifiedCommand, hosts, counts) : null
  const cause = input.cause ? redactField(input.cause, hosts, counts) : null
  const evidence = (input.evidence ?? []).map((e) => redactField(e, hosts, counts))
  assertNoResidualSecret({ diffSummary, verifiedCommand, cause, evidence: evidence.join("\n") }, { userId: actor.userId, what: "resolution" })
  if (counts.total > 0) log.info("resolution report redacted", { userId: actor.userId, redacted: counts.total })

  return retryOnUniqueViolation(() =>
    withTransaction(async (tx) => {
      const failure = await repo.findFailureToResolve(tx, {
        reportedById: actor.userId,
        sessionRef: input.sessionRef,
        failureEventId: input.failureEventId,
        projectId: input.projectId,
        since: new Date(now.getTime() - RESOLUTION_LOOKBACK_MS),
      })
      if (!failure) throw new NotFoundError("No unresolved failure of this session to attach the resolution to", {}, "FEEDBACK_NO_FAILURE")

      const scope = input.scope ?? (failure.projectId ? projectScope(failure.projectId) : "global")
      const existing = await repo.findLessonByKey(tx, failure.signature, scope)
      let lessonCreated = false
      let lesson: repo.LessonRow
      if (existing) {
        const fillFix = existing.state === "draft" && !existing.fix
        lesson = await repo.updateLessonData(tx, existing.id, {
          resolvedCount: { increment: 1 },
          lastSeenAt: now,
          evidence: JSON.stringify(mergeEvidence(parseEvidence(existing.evidence), evidence)),
          ...(fillFix ? { fix: diffSummary, verify: verifiedCommand ?? existing.verify } : {}),
          ...(existing.state === "draft" && !existing.cause && cause ? { cause } : {}),
        })
      } else {
        const seen = await repo.countFailuresOfSignature(tx, failure.signature)
        lesson = await repo.createLesson(tx, {
          signature: failure.signature,
          scope,
          symptom: failure.signatureText || failure.errorCode || failure.tool,
          cause,
          fix: diffSummary,
          verify: verifiedCommand,
          evidence: evidence.length > 0 ? JSON.stringify(evidence.slice(0, EVIDENCE_MAX)) : null,
          errorCode: failure.errorCode,
          hits: Math.max(seen, 1),
          resolvedCount: 1,
          lastSeenAt: now,
        })
        lessonCreated = true
      }
      try {
        const resolution = await repo.createResolution(tx, { failureEventId: failure.id, lessonId: lesson.id, diffSummary, verifiedCommand })
        return {
          resolution: { id: resolution.id, failureEventId: resolution.failureEventId, lessonId: resolution.lessonId, createdAt: resolution.createdAt.toISOString() },
          lesson: toLessonDto(lesson),
          lessonCreated,
        }
      } catch (error) {
        if (isUniqueViolation(error)) throw new ConflictError("This failure already has a resolution")
        throw error
      }
    }),
  )
}
