import { z } from "zod"
import { COMMENT_BODY_MAX } from "@/services/comments/comments.schemas"
import { SCOPE_KINDS } from "./dev-work.scope"

/**
 * Bodies of the developer writes (scope dev:write, docs/api-v1.md
 * "Development"). Shared by /api/v1 and the MCP tools.
 */

/** A PBI as its internal id, "12" or "PBI-12". */
export const devPbiRef = z.string().trim().min(1).max(191)
/** Client-chosen session id (e.g. the Claude Code session id): visible ASCII, no spaces. */
export const devSessionId = z.string().regex(/^[\x21-\x7e]{1,100}$/, "1-100 visible ASCII characters, no spaces")
/**
 * A git branch name, git-ref-safe and safe to show: no whitespace / control characters,
 * none of ~ ^ : ? * [ \\ (refused by git) and none of < > " ' ` (never needed in a branch
 * name, risky wherever it is rendered); no "..", "@{", leading "-" or "/", trailing "/",
 * "." or ".lock".
 */
export const devBranch = z
  .string()
  .trim()
  .min(1)
  .max(255)
  .regex(/^[^\s~^:?*[\\<>"'`\x00-\x1f\x7f]+$/, "not a valid branch name")
  .refine((b) => !b.includes("..") && !b.includes("@{") && !/^[-/]/.test(b) && !/(\/|\.|\.lock)$/.test(b), "not a valid branch name")
const taskId = z.string().trim().min(1).max(191)

/**
 * POST /dev/claims — exactly one of `pbi` (the whole PBI) and `taskId` (one sprint task).
 * `takeover`: end the caller's own other sessions' active claims on the target instead
 * of 409 (another user's active claim is never taken over; stale claims never block).
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

/**
 * POST /dev/mr-links — link a merge request of a registered repository to a PBI. No
 * title: the link shows the synced MR's title, or "!<iid>" until the sync reads it.
 */
export const mrLinkSchema = z.object({
  pbi: devPbiRef,
  url: z.string().trim().min(1).max(1000),
})

/**
 * One 触る範囲 entry as sent (normalized by the service: dev-work.scope). The raw value may be
 * longer than the stored maximum (300) — "./a//b/" shrinks — but is bounded.
 */
export const scopeEntrySchema = z.object({ kind: z.enum(SCOPE_KINDS), value: z.string().max(1000) })
/** Raw entries per request (duplicates collapse; more than 200 distinct ones → SCOPE_TOO_LARGE). */
export const SCOPE_RAW_ENTRIES_MAX = 1000

/** PUT /dev/claims/:claimId/scope — the claim's whole 触る範囲 (replaces the previous one; [] clears it). */
export const declareScopeSchema = z.object({ scope: z.array(scopeEntrySchema).max(SCOPE_RAW_ENTRIES_MAX) })

export type DeclareScopeInput = z.infer<typeof declareScopeSchema>
export type ClaimWorkInput = z.infer<typeof claimWorkSchema>
export type HeartbeatClaimInput = z.infer<typeof heartbeatClaimSchema>
export type ListClaimsQuery = z.infer<typeof listClaimsQuerySchema>
export type ProgressCommentInput = z.infer<typeof progressCommentSchema>
export type MrLinkInput = z.infer<typeof mrLinkSchema>
