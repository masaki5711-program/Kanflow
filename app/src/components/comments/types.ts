/** Client-side shapes of the comments API (mirrors services/comments/comments.service.ts). */

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
}

export interface Page<T> {
  items: T[]
  nextCursor: string | null
}

/** A project member offered by the mention autocomplete. */
export interface MentionMember {
  id: string
  name: string
}

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
