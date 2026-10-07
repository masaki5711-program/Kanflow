import { z } from "zod"

/** The fixed reaction palette, in display order. Stored as-is in Reaction.emoji. */
export const REACTION_EMOJIS = ["👍", "❤️", "🎉", "😄", "🙏", "👀"] as const
export type ReactionEmoji = (typeof REACTION_EMOJIS)[number]

/**
 * What a reaction can be put on (Reaction.targetType):
 * - comment: a PBI / task / IceBox comment (its team-chat mirror shares the rows)
 * - team_message: a team-chat message (a mirror is redirected to its comment)
 * - task_completion: the completion comment of a sprint task (targetId = task id)
 */
export const REACTION_TARGET_TYPES = ["comment", "team_message", "task_completion"] as const
export type ReactionTargetType = (typeof REACTION_TARGET_TYPES)[number]

/** Upper bound of ids in one GET /reactions request. */
export const REACTION_QUERY_IDS_MAX = 200

const targetType = z.enum(REACTION_TARGET_TYPES)
const targetId = z.string().min(1).max(191)

/** GET /api/projects/:id/reactions?targetType&ids=a,b,c */
export const reactionsQuerySchema = z.object({
  targetType,
  ids: z
    .string()
    .transform((raw) => [...new Set(raw.split(",").map((s) => s.trim()).filter(Boolean))])
    .pipe(z.array(targetId).min(1).max(REACTION_QUERY_IDS_MAX)),
})

/** POST /api/projects/:id/reactions — toggles the viewer's reaction. */
export const toggleReactionSchema = z.object({ targetType, targetId, emoji: z.enum(REACTION_EMOJIS) })

/** One emoji on one target as the API returns it (also used by the browser). */
export interface ReactionSummary {
  emoji: ReactionEmoji
  count: number
  /** The viewer has put this reaction. */
  mine: boolean
  /** Who reacted (first names, oldest first; `count` covers everybody). */
  users: string[]
}

export type ReactionsQuery = z.infer<typeof reactionsQuerySchema>
export type ToggleReactionInput = z.infer<typeof toggleReactionSchema>
