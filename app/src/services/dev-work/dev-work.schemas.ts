import { z } from "zod"
import { COMMENT_BODY_MAX } from "@/services/comments/comments.schemas"

/**
 * Bodies of the developer writes (scope write:dev, docs/api-v1.md
 * "Development"). Shared by /api/v1 and the MCP tools.
 */

/** A PBI as its internal id, "12" or "PBI-12". */
export const devPbiRef = z.string().trim().min(1).max(191)
/** Client-chosen session id (e.g. the Claude Code session id): visible ASCII, no spaces. */
export const devSessionId = z.string().regex(/^[\x21-\x7e]{1,100}$/, "1-100 visible ASCII characters, no spaces")
/** A git branch name (no spaces / control characters / the characters git refuses in refs). */
export const devBranch = z
  .string()
  .trim()
  .min(1)
  .max(255)
  .regex(/^[^\s~^:?*[\\\x00-\x1f\x7f]+$/, "not a valid branch name")
const taskId = z.string().trim().min(1).max(191)

/**
 * POST /dev/claims — exactly one of `pbi` (the whole PBI) and `taskId` (one sprint task).
 * `takeover`: end overlapping claims instead of 409 — allowed when they are stale or
 * the caller's own other sessions (dev-work.rules).
 */
export const claimWorkSchema = z
  .object({
    pbi: devPbiRef.optional(),
    taskId: taskId.optional(),
    sessionId: devSessionId,
    branch: devBranch.optional(),
    takeover: z.boolean().optional(),
  })
  .refine((v) => (v.pbi === undefined) !== (v.taskId === undefined), { message: "Give exactly one of pbi and taskId", path: ["pbi"] })

/** PATCH /dev/claims/:claimId — heartbeat (optionally a new branch). */
export const heartbeatClaimSchema = z.object({ branch: devBranch.optional() })

/** GET /dev/claims?pbi=&taskId= — open claims of the project (active, and stale ones flagged). */
export const listClaimsQuerySchema = z.object({ pbi: devPbiRef.optional(), taskId: taskId.optional() })

export const PROGRESS_ENTITY_TYPES = ["pbi", "sprint_task"] as const

/** POST /dev/progress — a progress comment on a PBI or a sprint task. */
export const progressCommentSchema = z.object({
  entityType: z.enum(PROGRESS_ENTITY_TYPES),
  /** PBI: id, "12" or "PBI-12"; task: its id. */
  entityId: z.string().trim().min(1).max(191),
  body: z.string().trim().min(1).max(COMMENT_BODY_MAX),
})

/** POST /dev/mr-links — link a merge request of a registered repository to a PBI. */
export const mrLinkSchema = z.object({
  pbi: devPbiRef,
  url: z.string().trim().min(1).max(1000),
  /** Shown until the sync reads the merge request (default "!<iid>"). */
  title: z.string().trim().min(1).max(500).optional(),
})

export type ClaimWorkInput = z.infer<typeof claimWorkSchema>
export type HeartbeatClaimInput = z.infer<typeof heartbeatClaimSchema>
export type ListClaimsQuery = z.infer<typeof listClaimsQuerySchema>
export type ProgressCommentInput = z.infer<typeof progressCommentSchema>
export type MrLinkInput = z.infer<typeof mrLinkSchema>
