"use client"

import { useCallback, useState } from "react"
import { apiFetch, useApiQuery } from "@/hooks"
import { asPage, commentsBaseUrl, type CommentDto, type CommentEntityType, type MentionMember, type Page } from "./types"

function appendUnique(items: readonly CommentDto[], more: readonly CommentDto[]): CommentDto[] {
  const seen = new Set(items.map((c) => c.id))
  return [...items, ...more.filter((c) => !seen.has(c.id))]
}

/** Tombstone as the server renders a deleted comment. */
function asDeleted(c: CommentDto): CommentDto {
  return { ...c, body: null, deleted: true, mentions: [], canEdit: false, canDelete: false }
}

/**
 * One entity's comment thread: first page via useApiQuery, "load more"
 * appends (oldest → newest), and create / edit / delete update the list in
 * place. Mutations throw ApiError so callers can toast.
 */
export function useCommentThread(projectId: string, entityType: CommentEntityType, entityId: string) {
  const base = commentsBaseUrl(projectId)
  const url = `${base}?entityType=${entityType}&entityId=${encodeURIComponent(entityId)}`
  const query = useApiQuery<Page<CommentDto>>(url, { parse: asPage })
  const { mutate } = query
  const [loadingMore, setLoadingMore] = useState(false)

  const setItems = useCallback(
    (fn: (items: CommentDto[]) => CommentDto[]) =>
      mutate((prev) => (prev ? { ...prev, items: fn(prev.items) } : { items: fn([]), nextCursor: null })),
    [mutate],
  )

  const loadMore = useCallback(async () => {
    const cursor = query.data?.nextCursor
    if (!cursor) return
    setLoadingMore(true)
    try {
      const next = asPage<CommentDto>(await apiFetch(`${url}&cursor=${encodeURIComponent(cursor)}`))
      mutate((prev) => ({ items: appendUnique(prev?.items ?? [], next.items), nextCursor: next.nextCursor }))
    } finally {
      setLoadingMore(false)
    }
  }, [query.data?.nextCursor, url, mutate])

  const create = useCallback(
    async (body: string) => {
      const created = await apiFetch<CommentDto>(base, { method: "POST", json: { entityType, entityId, body } })
      setItems((items) => appendUnique(items, [created]))
      return created
    },
    [base, entityType, entityId, setItems],
  )

  const update = useCallback(
    async (id: string, body: string) => {
      const saved = await apiFetch<CommentDto>(`${base}/${encodeURIComponent(id)}`, { method: "PATCH", json: { body } })
      setItems((items) => items.map((c) => (c.id === id ? saved : c)))
      return saved
    },
    [base, setItems],
  )

  const remove = useCallback(
    async (id: string) => {
      await apiFetch(`${base}/${encodeURIComponent(id)}`, { method: "DELETE" })
      setItems((items) => items.map((c) => (c.id === id ? asDeleted(c) : c)))
    },
    [base, setItems],
  )

  return { ...query, items: query.data?.items ?? [], hasMore: !!query.data?.nextCursor, loadingMore, loadMore, create, update, remove }
}

interface MemberRow {
  userId?: unknown
  user?: { name?: unknown } | null
}

/** Pure: members API rows → mention candidates (malformed rows skipped). */
export function toMentionMembers(raw: unknown): MentionMember[] {
  if (!Array.isArray(raw)) return []
  return (raw as MemberRow[]).flatMap((m) =>
    typeof m?.userId === "string" && typeof m.user?.name === "string" ? [{ id: m.userId, name: m.user.name }] : [],
  )
}

const NO_MEMBERS: MentionMember[] = []

/** Project members for the mention autocomplete (`isLoading` until the first list arrived). */
export function useMentionMembersState(projectId: string): { members: MentionMember[]; isLoading: boolean } {
  const { data, isLoading } = useApiQuery<MentionMember[]>(`/api/projects/${encodeURIComponent(projectId)}/members`, {
    parse: toMentionMembers,
  })
  return { members: data ?? NO_MEMBERS, isLoading }
}


/**
 * Comment counts for badges (`GET /comments/counts`). Silent on failure
 * (badges simply do not show). `ids` are chunked by the caller if > 200.
 */
export function useCommentCounts(projectId: string, entityType: CommentEntityType, ids: readonly string[]) {
  const key = [...ids].sort().join(",")
  const url = key ? `${commentsBaseUrl(projectId)}/counts?entityType=${entityType}&ids=${encodeURIComponent(key)}` : null
  const { data, mutate } = useApiQuery<Record<string, number>>(url, { parse: toCounts })
  /** Local +1 / -1 after posting / deleting (never below 0). */
  const adjustCount = useCallback(
    (id: string, delta: number) => mutate((prev) => ({ ...(prev ?? {}), [id]: Math.max(0, (prev?.[id] ?? 0) + delta) })),
    [mutate],
  )
  return { counts: data ?? {}, adjustCount }
}

/** Pure: `{ counts: { id: n } }` → map (malformed → {}). */
export function toCounts(raw: unknown): Record<string, number> {
  const counts = (raw as { counts?: unknown } | null)?.counts
  if (!counts || typeof counts !== "object") return {}
  return Object.fromEntries(Object.entries(counts).filter(([, n]) => typeof n === "number")) as Record<string, number>
}
