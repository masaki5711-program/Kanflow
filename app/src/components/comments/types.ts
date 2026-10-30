/** Client-side shapes of the comments API (mirrors services/comments/comments.service.ts). */
import type { EntityI18n } from "@/lib/translation/types"

export type CommentEntityType = "pbi" | "sprint_task" | "icebox"

export interface CommentDto {
  id: string
  entityType: string
  entityId: string
  author: { id: string; name: string } | null
  /** null when deleted. */
  body: string | null
  deleted: boolean
  mentions: { id: string; name: string }[]
  createdAt: string
  editedAt: string | null
  canEdit: boolean
  canDelete: boolean
  /** Both-language body (field "body"); `{}` / absent when untranslated or deleted. */
  i18n?: EntityI18n
  /** Posted with an access token: "api" (REST) or "mcp" (Kanflow MCP, AI); null / absent = the UI. */
  via?: "api" | "mcp" | null
}

export interface Page<T> {
  items: T[]
  nextCursor: string | null
}

/** A project member offered by the mention autocomplete. */
export interface MentionMember {
  id: string
  name: string
  /** Short note under the name in the suggestion list (the "everyone" entry). */
  hint?: string
}

/** Id of the "everyone" entry in the suggestion list (never a real user id). */
export const MENTION_ALL_ID = "__all__"

/** Same limit as the server schema (COMMENT_BODY_MAX). */
export const COMMENT_BODY_MAX = 10_000

export function commentsBaseUrl(projectId: string): string {
  return `/api/projects/${encodeURIComponent(projectId)}/comments`
}

/** Tolerant page parser: anything that is not `{ items: [] }` becomes an empty page. */
export function asPage<T>(raw: unknown): Page<T> {
  if (!raw || typeof raw !== "object" || !Array.isArray((raw as Page<T>).items)) return { items: [], nextCursor: null }
  const page = raw as Page<T>
  return { items: page.items, nextCursor: typeof page.nextCursor === "string" ? page.nextCursor : null }
}
