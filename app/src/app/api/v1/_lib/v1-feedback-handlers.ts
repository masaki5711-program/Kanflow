import { z } from "zod"
import { getRateLimiter } from "@/lib/rate-limit"
import type { Actor } from "@/services/_shared/actor"
import type { ApiPrincipal } from "@/services/api-tokens/api-token-auth"
import { FEEDBACK_NOTICE } from "@/services/feedback/feedback.dto"
import type { FeedbackViewer } from "@/services/feedback/feedback.access"
import { confirmLesson, retireLesson, searchSharedLessons, systemizeLesson } from "@/services/feedback/feedback.lessons.service"
import { confirmLessonSchema, reportFailureSchema, reportResolutionSchema, retireLessonSchema, searchLessonsSchema, systemizeLessonSchema } from "@/services/feedback/feedback.schemas"
import { reportFailure, reportResolution } from "@/services/feedback/feedback.service"
import { V1Reply } from "./v1-route"

/**
 * Feedback loop operations (W11; docs/api-v1.md "Feedback") shared by /api/v1/feedback/* and the MCP
 * tools report_failure / report_resolution / search_lessons. Authorization is the caller's:
 *   reports  → token scope dev:write (+ the owner's dev.write in the project when `projectId` is given)
 *   search   → token scope read; only confirmed / systemized, non-confidential lessons in scope
 *   curation → token scope sprint:write; the owner must curate the lesson's scope (feedback.access)
 */

const MINUTE_MS = 60_000
export const DEFAULT_REPORTS_PER_MINUTE = 60

/** FEEDBACK_REPORT_RATE_LIMIT_PER_MIN: failure + resolution reports per token per minute (default 60). */
export function reportsPerMinute(env: Readonly<Record<string, string | undefined>> = process.env): number {
  const n = Number(env.FEEDBACK_REPORT_RATE_LIMIT_PER_MIN)
  return Number.isInteger(n) && n > 0 ? n : DEFAULT_REPORTS_PER_MINUTE
}

/** The per-token budget of reports; a 429 reply when it is spent. */
export function reportBudget(tokenId: string): V1Reply | null {
  const limit = reportsPerMinute()
  const limiter = getRateLimiter(`feedback:report:${limit}`, { limit, windowMs: MINUTE_MS })
  const { allowed, status } = limiter.consume(tokenId)
  if (!allowed) {
    return new V1Reply({ error: "Too many feedback reports", code: "RATE_LIMITED" }, 429, { "Retry-After": String(Math.max(Math.ceil(status.retryAfterMs / 1000), 1)) })
  }
  return null
}

export const viewerOf = (principal: ApiPrincipal): FeedbackViewer => ({ userId: principal.userId, systemRole: principal.role, projectIds: principal.projectIds })

/** The project a feedback body refers to (so the caller can check the owner's role there), if any. */
export function feedbackProjectOf(body: unknown): string | undefined {
  const id = (body as { projectId?: unknown } | null | undefined)?.projectId
  return typeof id === "string" && id.trim() ? id.trim() : undefined
}

export interface FeedbackWriteInput {
  principal: ApiPrincipal
  body: unknown
  serviceActor: Actor
}

/** 201 stored, 200 folded into the same reporter's identical report of the last minute. */
export async function reportFailureOp({ principal, body, serviceActor }: FeedbackWriteInput) {
  const input = reportFailureSchema.parse(body)
  const limited = reportBudget(principal.tokenId)
  if (limited) return limited
  const result = await reportFailure(input, serviceActor)
  return new V1Reply({ data: result.failure, collapsed: result.collapsed, lessons: result.lessons, ...(result.lessonsUnavailable ? { lessonsUnavailable: true } : {}), notice: FEEDBACK_NOTICE }, result.collapsed ? 200 : 201)
}

export async function reportResolutionOp({ principal, body, serviceActor }: FeedbackWriteInput) {
  const input = reportResolutionSchema.parse(body)
  const limited = reportBudget(principal.tokenId)
  if (limited) return limited
  const result = await reportResolution(input, serviceActor)
  return new V1Reply({ data: result.resolution, lesson: result.lesson, lessonCreated: result.lessonCreated }, 201)
}

export async function searchLessonsOp(principal: ApiPrincipal, query: unknown) {
  const input = searchLessonsSchema.parse(query)
  const result = await searchSharedLessons(viewerOf(principal), input)
  return { data: result.lessons, truncated: result.truncated, notice: FEEDBACK_NOTICE }
}

const lessonId = z.string().trim().min(1).max(191)

export async function confirmLessonOp({ principal, body, params }: FeedbackWriteInput & { params: { id: string } }) {
  return { data: await confirmLesson(viewerOf(principal), lessonId.parse(params.id), confirmLessonSchema.parse(body ?? {})) }
}

export async function retireLessonOp({ principal, body, params }: FeedbackWriteInput & { params: { id: string } }) {
  return { data: await retireLesson(viewerOf(principal), lessonId.parse(params.id), retireLessonSchema.parse(body ?? {})) }
}

export async function systemizeLessonOp({ principal, body, params }: FeedbackWriteInput & { params: { id: string } }) {
  return { data: await systemizeLesson(viewerOf(principal), lessonId.parse(params.id), systemizeLessonSchema.parse(body)) }
}
