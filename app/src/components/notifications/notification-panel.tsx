"use client"

import { useId, useState } from "react"
import { BellOff } from "lucide-react"
import { useLanguage } from "@/lib/language-context"
import { apiFetch } from "@/hooks"
import { Button, EmptyState, SkeletonLines } from "@/components/ui"
import type { NotificationGroup } from "@/lib/notification-groups"
import type { NotificationItem } from "./notification-format"
import { NotificationRow } from "./notification-row"
import { NotificationTabs } from "./notification-tabs"
import { useNotificationFeed } from "./use-notification-feed"
import { useLiveRefetch } from "@/components/realtime/use-live-refetch"

const LIVE_TYPES = ["notification"] as const

interface NotificationPanelProps {
  headingId: string
  /** Latest unread count from the server (list / mark-read responses). */
  onUnreadCount: (count: number | ((prev: number) => number)) => void
  /** Called after an item was chosen; `href` null = nothing to open. */
  onNavigate: (href: string | null) => void
}

/**
 * Bell dropdown content: tabs (all / mentions & for me / other), unread
 * items first within each tab, "mark all read", paging ("show more").
 * Choosing an item marks it read and follows its deep link.
 */
export function NotificationPanel({ headingId, onUnreadCount, onNavigate }: NotificationPanelProps) {
  const { t } = useLanguage()
  const [group, setGroup] = useState<NotificationGroup>("all")
  const [actionError, setActionError] = useState(false)
  const { state, unreadByGroup, loadingMore, loadMore, markAllReadLocally, reload } = useNotificationFeed(group, onUnreadCount)
  const baseId = useId().replace(/:/g, "")
  // New notifications while the panel is open appear without reopening it.
  useLiveRefetch(reload, { types: LIVE_TYPES })

  async function markAllRead() {
    try {
      await apiFetch("/api/notifications/read-all", { method: "POST" })
      markAllReadLocally()
      onUnreadCount(0)
      setActionError(false)
    } catch {
      setActionError(true)
    }
  }

  async function more() {
    setActionError(!(await loadMore()))
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

  const hasUnread = (unreadByGroup?.all ?? 0) > 0 || (state.status === "ready" && state.items.some((n) => !n.readAt))

  return (
    <div className="flex max-h-[min(32rem,calc(100dvh-5rem))] flex-col">
      <div className="flex items-center justify-between gap-2 px-4 py-2">
        <h2 id={headingId} className="text-body font-semibold text-fg">
          {t.notifPanelTitle}
        </h2>
        <Button variant="ghost" size="sm" onClick={markAllRead} disabled={!hasUnread}>
          {t.notifMarkAllRead}
        </Button>
      </div>
      <NotificationTabs baseId={baseId} active={group} unread={unreadByGroup} onSelect={setGroup} />
      {actionError && (
        <p role="alert" className="border-b border-border bg-danger-soft px-4 py-1.5 text-caption text-danger-strong">
          {t.notifActionFailed}
        </p>
      )}
      <div role="tabpanel" id={`${baseId}-panel`} aria-labelledby={`${baseId}-tab-${group}`} className="min-h-0 flex-1 overflow-y-auto">
        {state.status === "loading" && <SkeletonLines lines={3} label={t.loading} className="p-4" />}
        {state.status === "error" && (
          <div className="space-y-2 p-4 text-center">
            <p role="alert" className="text-body text-danger-strong">
              {t.notifLoadFailed}
            </p>
            <Button variant="secondary" size="sm" onClick={reload}>
              {t.notifRetry}
            </Button>
          </div>
        )}
        {state.status === "ready" && state.items.length === 0 && (
          <EmptyState
            compact
            icon={<BellOff className="h-6 w-6" />}
            title={group === "personal" ? t.notifEmptyPersonal : t.notifEmpty}
            headingLevel={3}
          />
        )}
        {state.status === "ready" && state.items.length > 0 && (
          <ul className="divide-y divide-border">
            {state.items.map((n) => (
              <NotificationRow key={n.id} item={n} onChoose={choose} />
            ))}
          </ul>
        )}
      </div>
      {state.status === "ready" && state.hasMore && (
        <div className="border-t border-border p-2">
          <Button variant="ghost" size="sm" fullWidth loading={loadingMore} onClick={more}>
            {t.notifLoadMore}
          </Button>
        </div>
      )}
    </div>
  )
}
