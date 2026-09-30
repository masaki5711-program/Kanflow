"use client"

import { useCallback, useEffect, useState } from "react"
import { apiFetch, isAbortError } from "@/hooks"
import type { NotificationGroup } from "@/lib/notification-groups"
import type { NotificationItem, NotificationPage } from "./notification-format"

export const NOTIFICATION_PAGE_SIZE = 20

type Phase = "unread" | "read"

export type UnreadByGroup = Record<NotificationGroup, number>

export type FeedState =
  | { status: "loading" }
  | { status: "error" }
  | { status: "ready"; items: NotificationItem[]; phase: Phase; cursor: string | null; hasMore: boolean }

/** One page of a tab in one read state (unread items lead every tab — A3-08). */
export function feedPageUrl(group: NotificationGroup, phase: Phase, cursor: string | null): string {
  const params = new URLSearchParams({ limit: String(NOTIFICATION_PAGE_SIZE), group, state: phase })
  if (cursor) params.set("cursor", cursor)
  return `/api/notifications?${params.toString()}`
}

interface PageResult {
  items: NotificationItem[]
  phase: Phase
  cursor: string | null
  hasMore: boolean
  page: NotificationPage
}

/**
 * Next chunk of the tab: pages through the unread items first; when they run
 * out, continues straight into the read ones (same request round).
 */
async function loadChunk(group: NotificationGroup, phase: Phase, cursor: string | null, signal?: AbortSignal): Promise<PageResult> {
  const page = await apiFetch<NotificationPage>(feedPageUrl(group, phase, cursor), { signal })
  if (page.nextCursor) return { items: page.items, phase, cursor: page.nextCursor, hasMore: true, page }
  if (phase === "read") return { items: page.items, phase, cursor: null, hasMore: false, page }
  const read = await apiFetch<NotificationPage>(feedPageUrl(group, "read", null), { signal })
  return { items: [...page.items, ...read.items], phase: "read", cursor: read.nextCursor, hasMore: Boolean(read.nextCursor), page: read }
}

/** Notification list of one panel tab + per-tab unread counts. */
export function useNotificationFeed(group: NotificationGroup, onUnreadCount: (count: number) => void) {
  const [state, setState] = useState<FeedState>({ status: "loading" })
  const [unreadByGroup, setUnreadByGroup] = useState<UnreadByGroup | null>(null)
  const [loadingMore, setLoadingMore] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)

  const applyCounts = useCallback(
    (page: NotificationPage) => {
      onUnreadCount(page.unreadCount)
      if (page.unreadByGroup) setUnreadByGroup(page.unreadByGroup)
    },
    [onUnreadCount],
  )

  useEffect(() => {
    const controller = new AbortController()
    setState({ status: "loading" })
    loadChunk(group, "unread", null, controller.signal)
      .then((r) => {
        setState({ status: "ready", items: r.items, phase: r.phase, cursor: r.cursor, hasMore: r.hasMore })
        applyCounts(r.page)
      })
      .catch((err: unknown) => {
        if (!isAbortError(err)) setState({ status: "error" })
      })
    return () => controller.abort()
  }, [group, reloadKey, applyCounts])

  /** Resolves false when the page could not be loaded. */
  const loadMore = useCallback(async (): Promise<boolean> => {
    if (state.status !== "ready" || !state.hasMore) return true
    setLoadingMore(true)
    try {
      const r = await loadChunk(group, state.phase, state.cursor)
      setState({ status: "ready", items: [...state.items, ...r.items], phase: r.phase, cursor: r.cursor, hasMore: r.hasMore })
      applyCounts(r.page)
      return true
    } catch {
      return false
    } finally {
      setLoadingMore(false)
    }
  }, [group, state, applyCounts])

  const markAllReadLocally = useCallback(() => {
    const now = new Date().toISOString()
    setState((s) => (s.status === "ready" ? { ...s, items: s.items.map((n) => (n.readAt ? n : { ...n, readAt: now })) } : s))
    setUnreadByGroup({ all: 0, personal: 0, other: 0 })
  }, [])

  const reload = useCallback(() => setReloadKey((k) => k + 1), [])

  return { state, unreadByGroup, loadingMore, loadMore, markAllReadLocally, reload }
}
