import { z } from "zod"
import { PAGE_LIMIT_MAX } from "@/services/_shared/cursor"

/** Thread titles (ChatThread.title is VARCHAR(200)). */
export const CHAT_TITLE_MAX = 200
/** Auto title = first user message cut to this many characters. */
export const CHAT_AUTO_TITLE_CHARS = 60
/** Newest messages returned when a thread is opened (the chat sends at most 40 back anyway). */
export const CHAT_THREAD_MESSAGES_MAX = 200
export const CHAT_THREADS_PAGE_DEFAULT = 30

export const threadIdSchema = z.string().min(1).max(191)

/** GET /api/projects/:id/chat/threads?cursor&limit */
export const listThreadsQuerySchema = z.object({
  cursor: z.string().min(1).max(512).optional(),
  limit: z.coerce.number().int().min(1).max(PAGE_LIMIT_MAX).default(CHAT_THREADS_PAGE_DEFAULT),
})

/** PATCH /api/projects/:id/chat/threads/:threadId — trimmed, one visible character at least. */
export const renameThreadSchema = z.object({
  title: z.string().trim().min(1).max(CHAT_TITLE_MAX),
})

export type ListThreadsQuery = z.infer<typeof listThreadsQuerySchema>
export type RenameThreadInput = z.infer<typeof renameThreadSchema>
