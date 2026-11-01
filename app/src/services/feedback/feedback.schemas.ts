import { z } from "zod"
import { devBranch, devSessionId } from "@/services/dev-work/dev-work.schemas"

/**
 * Bodies and queries of the feedback loop (W11; scope dev:write for reports, read for search).
 * Shared by /api/v1/feedback/*, /api/feedback/* (screens) and the MCP tools.
 */

export const FEEDBACK_SOURCES = ["agent", "ci", "gitstation", "manual"] as const
export type FeedbackSource = (typeof FEEDBACK_SOURCES)[number]

export const LESSON_STATES = ["draft", "confirmed", "systemized", "retired"] as const
export type LessonState = (typeof LESSON_STATES)[number]
/** The states an AI session may be shown. */
export const SHARED_LESSON_STATES = ["confirmed", "systemized"] as const satisfies readonly LessonState[]

export const SYSTEMIZE_KINDS = ["pbi", "gate", "test"] as const

/** The failure text sent by a reporter (raw output; redacted by the server, at most 4 KB of it is kept). */
export const FAILURE_TEXT_MAX = 100_000
/** Stored excerpt bound (bytes). */
export const EXCERPT_MAX_BYTES = 4096
export const LESSON_TEXT_MAX = 4000

const projectId = z.string().trim().min(1).max(191)
const tech = z.string().trim().toLowerCase().regex(/^[a-z0-9][a-z0-9._+#-]{0,39}$/, "a short technology name such as rust, nextjs, postgres")

/** "global" | "tech:<name>" | "project:<id>", lower case. */
export const lessonScope = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^(global|tech:[a-z0-9][a-z0-9._+#-]{0,39}|project:[a-z0-9_-]{1,100})$/, 'scope must be "global", "tech:<name>" or "project:<id>"')

/** POST /feedback/failures */
export const reportFailureSchema = z.object({
  projectId: projectId.optional(),
  source: z.enum(FEEDBACK_SOURCES).default("agent"),
  tool: z.string().trim().min(1).max(100),
  errorCode: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9_.:-]{1,64}$/, "1-64 characters: letters, digits and _ . : -")
    .optional(),
  text: z.string().min(1).max(FAILURE_TEXT_MAX),
  sessionRef: devSessionId.optional(),
  branch: devBranch.optional(),
  /** Technologies involved (rust, nextjs, …): lessons scoped "tech:<name>" are returned for them. */
  techs: z.array(tech).max(10).optional(),
})
export type ReportFailureInput = z.infer<typeof reportFailureSchema>

/** POST /feedback/resolutions */
export const reportResolutionSchema = z.object({
  projectId: projectId.optional(),
  sessionRef: devSessionId,
  /** Explicit failure (from report_failure's answer); default = the session's latest unresolved failure of the last 24 h. */
  failureEventId: z.string().trim().min(1).max(191).optional(),
  diffSummary: z.string().trim().min(1).max(LESSON_TEXT_MAX),
  verifiedCommand: z.string().trim().min(1).max(1000).optional(),
  cause: z.string().trim().min(1).max(LESSON_TEXT_MAX).optional(),
  /** Default: "project:<id>" of the failure's project, "global" when it had none. */
  scope: lessonScope.optional(),
  evidence: z.array(z.string().trim().min(1).max(500)).max(10).optional(),
})
export type ReportResolutionInput = z.infer<typeof reportResolutionSchema>

/** GET /feedback/lessons — search. */
export const searchLessonsSchema = z.object({
  q: z.string().trim().min(1).max(200).optional(),
  signature: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[0-9a-f]{64}$/)
    .optional(),
  errorCode: z.string().trim().min(1).max(64).optional(),
  tech: tech.optional(),
  projectId: projectId.optional(),
  /** Screens only (curators): any state. A token never sees anything but confirmed / systemized. */
  state: z.enum(LESSON_STATES).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(20),
})
export type SearchLessonsInput = z.infer<typeof searchLessonsSchema>

/** POST /feedback/lessons/:id/confirm — the maintainer may correct the text and widen / narrow the scope. */
export const confirmLessonSchema = z.object({
  scope: lessonScope.optional(),
  symptom: z.string().trim().min(1).max(LESSON_TEXT_MAX).optional(),
  cause: z.string().trim().min(1).max(LESSON_TEXT_MAX).optional(),
  fix: z.string().trim().min(1).max(LESSON_TEXT_MAX).optional(),
  verify: z.string().trim().min(1).max(1000).optional(),
  /** Never shown to AI sessions. */
  confidential: z.boolean().optional(),
})
export type ConfirmLessonInput = z.infer<typeof confirmLessonSchema>

/** POST /feedback/lessons/:id/retire */
export const retireLessonSchema = z.object({ reason: z.string().trim().min(1).max(500).optional() })
export type RetireLessonInput = z.infer<typeof retireLessonSchema>

/** POST /feedback/lessons/:id/systemize — a link to the PBI, gate or test that now guards against it. */
export const systemizeLessonSchema = z.object({
  kind: z.enum(SYSTEMIZE_KINDS),
  ref: z
    .string()
    .trim()
    .min(1)
    .max(400)
    .regex(/^[^\x00-\x1f\x7f]+$/, "no control characters"),
})
export type SystemizeLessonInput = z.infer<typeof systemizeLessonSchema>
