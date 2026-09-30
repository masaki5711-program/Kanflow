"use client"

import { useCallback, useEffect, useState } from "react"
import { BellOff } from "lucide-react"
import { useLanguage } from "@/lib/language-context"
import { apiFetch, isAbortError } from "@/hooks"
import { Button, EmptyState, SkeletonLines, cn } from "@/components/ui"
import { formatFullDateTime, formatRelativeTime } from "@/components/comments/relative-time"
import { describeNotification, type NotificationItem, type NotificationPage } from "./notification-format"

export const NOTIFICATION_PAGE_SIZE = 20

interface NotificationPanelProps {
  headingId: string
  /** Latest unread count from the server (list / mark-read responses). */
  onUnreadCount: (count: number | ((prev: number) => number)) => void
  /** Called after an item was chosen; `href` null = nothing to open. */
  onNavigate: (href: string | null) => void
}

type LoadState = { status: "loading" } | { status: "error" } | { status: "ready"; items: NotificationItem[]; nextCursor: string | null }

function pageUrl(cursor: string | null): string {
  return `/api/notifications?limit=${NOTIFICATION_PAGE_SIZE}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`
}

/**
 * Bell dropdown content: newest notifications first, "mark all read",
 * cursor paging ("show more"). Choosing an item marks it read and follows
 * its deep link.
 */
export function NotificationPanel({ headingId, onUnreadCount, onNavigate }: NotificationPanelProps) {
  const { t } = useLanguage()
  const [state, setState] = useState<LoadState>({ status: "loading" })
  const [loadingMore, setLoadingMore] = useState(false)
  const [actionError, setActionError] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    apiFetch<NotificationPage>(pageUrl(null), { signal: controller.signal })
      .then((page) => {
        setState({ status: "ready", items: page.items, nextCursor: page.nextCursor })
        onUnreadCount(page.unreadCount)
      })
      .catch((err: unknown) => {
        if (!isAbortError(err)) setState({ status: "error" })
      })
    return () => controller.abort()
  }, [reloadKey, onUnreadCount])

  const loadMore = useCallback(async () => {
    if (state.status !== "ready" || !state.nextCursor) return
    setLoadingMore(true)
    try {
      const page = await apiFetch<NotificationPage>(pageUrl(state.nextCursor))
      setState({ status: "ready", items: [...state.items, ...page.items], nextCursor: page.nextCursor })
      onUnreadCount(page.unreadCount)
    } catch {
      setActionError(true)
    } finally {
      setLoadingMore(false)
    }
  }, [state, onUnreadCount])

  async function markAllRead() {
    if (state.status !== "ready") return
    try {
      await apiFetch("/api/notifications/read-all", { method: "POST" })
      const now = new Date().toISOString()
      setState({ ...state, items: state.items.map((n) => (n.readAt ? n : { ...n, readAt: now })) })
      onUnreadCount(0)
      setActionError(false)
    } catch {
      setActionError(true)
    }
  }

  async function choose(n: NotificationItem, href: string | null) {
    if (!n.readAt) {
      try {
        await apiFetch(`/api/notifications/${encodeURIComponent(n.id)}/read`, { method: "POST" })
        onUnreadCount((c) => Math.max(0, c - 1))
      } catch {
        // Still navigate: the item stays unread and the next poll shows the real count.
      }
    }
    onNavigate(href)
  }

  const hasUnread = state.status === "ready" && state.items.some((n) => !n.readAt)

  return (
    <div className="flex max-h-[min(32rem,calc(100dvh-5rem))] flex-col">
      <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-2">
        <h2 id={headingId} className="text-body font-semibold text-fg">
          {t.notifPanelTitle}
        </h2>
        <Button variant="ghost" size="sm" onClick={markAllRead} disabled={!hasUnread}>
          {t.notifMarkAllRead}
        </Button>
      </div>
      {actionError && (
        <p role="alert" className="border-b border-border bg-danger-soft px-4 py-1.5 text-caption text-danger-strong">
          {t.notifActionFailed}
        </p>
      )}
      <div className="min-h-0 flex-1 overflow-y-auto">
        {state.status === "loading" && <SkeletonLines lines={3} label={t.loading} className="p-4" />}
        {state.status === "error" && (
          <div className="space-y-2 p-4 text-center">
            <p role="alert" className="text-body text-danger-strong">
              {t.notifLoadFailed}
            </p>
            <Button variant="secondary" size="sm" onClick={() => setReloadKey((k) => k + 1)}>
              {t.notifRetry}
            </Button>
          </div>
        )}
        {state.status === "ready" && state.items.length === 0 && (
          <EmptyState compact icon={<BellOff className="h-6 w-6" />} title={t.notifEmpty} headingLevel={3} />
        )}
        {state.status === "ready" && state.items.length > 0 && (
          <ul className="divide-y divide-border">
            {state.items.map((n) => (
              <NotificationRow key={n.id} item={n} onChoose={choose} />
            ))}
          </ul>
        )}
      </div>
      {state.status === "ready" && state.nextCursor && (
        <div className="border-t border-border p-2">
          <Button variant="ghost" size="sm" fullWidth loading={loadingMore} onClick={loadMore}>
            {t.notifLoadMore}
          </Button>
        </div>
      )}
    </div>
  )
}

function NotificationRow({ item, onChoose }: { item: NotificationItem; onChoose: (n: NotificationItem, href: string | null) => void }) {
  const { t, language } = useLanguage()
  const { text, projectName, href } = describeNotification(item, t, language)
  const unread = !item.readAt
  return (
    <li>
      <button
        type="button"
        onClick={() => onChoose(item, href)}
        className={cn("flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-surface-muted", unread && "bg-primary-soft/40")}
      >
        <span
          aria-hidden="true"
          className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full", unread ? "bg-primary" : "bg-transparent")}
        />
        <span className="min-w-0 flex-1">
          {unread && <span className="sr-only">{t.notifUnread}: </span>}
          <span className={cn("block text-body text-fg", unread && "font-medium")}>{text}</span>
          <span className="mt-0.5 block text-caption text-fg-muted">
            {projectName && <span>{projectName} · </span>}
            <time dateTime={item.createdAt} title={formatFullDateTime(item.createdAt, language)}>
              {formatRelativeTime(item.createdAt, new Date(), language)}
            </time>
          </span>
        </span>
      </button>
    </li>
  )
}
