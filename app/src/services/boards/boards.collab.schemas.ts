import { z } from "zod"
import { BOARD_LIMITS, ELEMENT_ID_PATTERN } from "@/lib/board/limits"

/** Request bodies of the White Board's working-together API (B7). */

const elementId = z.string().regex(ELEMENT_ID_PATTERN)

/** POST …/sheets/[sheetId]/presence: I am here, with this selected. */
export const presenceSchema = z.object({
  selection: z.array(elementId).max(50).default([]),
})
export type PresenceInput = z.infer<typeof presenceSchema>

/** POST …/sheets/[sheetId]/versions: save the sheet now under a name. */
export const saveVersionSchema = z.object({
  label: z.string().trim().min(1).max(120),
})
export type SaveVersionInput = z.infer<typeof saveVersionSchema>

/** POST …/boards/[boardId]/comments. */
export const createCommentSchema = z.object({
  sheetId: z.string().min(1).max(40),
  elementId: elementId.nullable().default(null),
  body: z.string().trim().min(1).max(BOARD_LIMITS.commentLength),
})
export type CreateCommentInput = z.infer<typeof createCommentSchema>

/** PATCH …/comments/[commentId]: resolved or open again. */
export const resolveCommentSchema = z.object({ resolved: z.boolean() })

/** GET …/boards/[boardId]/pbis?ids=a,b,c — at most 100 ids. */
export const pbiIdsSchema = z
  .string()
  .max(4200)
  .transform((raw) => [...new Set(raw.split(",").map((s) => s.trim()).filter(Boolean))])
  .pipe(z.array(z.string().regex(/^[A-Za-z0-9_-]{1,40}$/)).max(100))

/** POST …/boards/[boardId]/ai: summarize or group the given texts (the selected sticky notes). */
export const aiAssistSchema = z.object({
  action: z.enum(["summarize", "group"]),
  texts: z.array(z.string().trim().min(1).max(1000)).min(1).max(100),
  language: z.enum(["ja", "en", "id"]).default("ja"),
})
export type AiAssistInput = z.infer<typeof aiAssistSchema>
