import { z } from "zod"
import { PAGE_LIMIT_DEFAULT, PAGE_LIMIT_MAX } from "@/services/_shared/cursor"

/** Entities that can carry a comment thread (Comment.entityType). */
export const COMMENT_ENTITY_TYPES = ["pbi", "sprint_task", "icebox"] as const
export type CommentEntityType = (typeof COMMENT_ENTITY_TYPES)[number]

export const COMMENT_BODY_MAX = 10_000
/** Upper bound of ids in one `/comments/counts` request. */
export const COMMENT_COUNT_IDS_MAX = 200

const entityType = z.enum(COMMENT_ENTITY_TYPES)
const entityId = z.string().min(1).max(191)
/** Trimmed; must keep at least one visible character. */
const body = z.string().trim().min(1).max(COMMENT_BODY_MAX)

/** GET /api/projects/:id/comments?entityType&entityId&cursor&limit */
export const listCommentsQuerySchema = z.object({
  entityType,
  entityId,
  cursor: z.string().min(1).max(512).optional(),
  limit: z.coerce.number().int().min(1).max(PAGE_LIMIT_MAX).default(PAGE_LIMIT_DEFAULT),
})

/** POST /api/projects/:id/comments */
export const createCommentSchema = z.object({ entityType, entityId, body })

/** PATCH /api/projects/:id/comments/:commentId */
export const updateCommentSchema = z.object({ body })

/** GET /api/projects/:id/comments/counts?entityType&ids=a,b,c */
export const commentCountsQuerySchema = z.object({
  entityType,
  ids: z
    .string()
    .transform((raw) => [...new Set(raw.split(",").map((s) => s.trim()).filter(Boolean))])
    .pipe(z.array(entityId).min(1).max(COMMENT_COUNT_IDS_MAX)),
})

export type ListCommentsQuery = z.infer<typeof listCommentsQuerySchema>
export type CreateCommentInput = z.infer<typeof createCommentSchema>
export type UpdateCommentInput = z.infer<typeof updateCommentSchema>
export type CommentCountsQuery = z.infer<typeof commentCountsQuerySchema>

/** POST /comments/read: the viewer opened this thread. */
export const markThreadReadSchema = z.object({ entityType, entityId })

