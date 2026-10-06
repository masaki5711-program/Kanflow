"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { AtSign } from "lucide-react"
import { useLanguage } from "@/lib/language-context"
import { apiFetch } from "@/hooks"
import { announceNotificationsChanged } from "@/lib/notification-events"
import { NotificationRow } from "@/components/notifications/notification-row"
import { useLiveRefetch } from "@/components/realtime/use-live-refetch"
import type { NotificationItem } from "@/components/notifications/notification-format"

interface Props {
  /** Newest unread "for you" notifications (mentions, assignments, comments) across projects. */
  items: NotificationItem[]
  /** All unread "for you" notifications (may exceed `items`). */
  total: number
}

/**
 * Top page: unread messages addressed to the viewer, with the message text,
 * so a mention is noticed without opening the bell. Choosing one marks it
 * read and opens the item. Hidden when there is nothing unread.
 */
export function HomeMessages(props: Props) {
  const router = useRouter()
  // A new message for the viewer: re-render the (server) top page; the list remounts with it.
  useLiveRefetch(router.refresh, { types: LIVE_TYPES, debounceMs: LIVE_DEBOUNCE_MS })
  const listKey = props.items.map((i) => i.id).join(",")
  return props.items.length > 0 ? <HomeMessageList key={listKey} {...props} /> : null
}

const LIVE_TYPES = ["notification"] as const
/** router.refresh re-renders the whole top page: coalesce a burst of notifications. */
const LIVE_DEBOUNCE_MS = 1_000

function HomeMessageList({ items: initial, total }: Props) {
  const { t } = useLanguage()
  const router = useRouter()
  const [items, setItems] = useState(initial)
  const [readCount, setReadCount] = useState(0)
  if (items.length === 0) return null

  async function choose(n: NotificationItem, href: string | null) {
    try {
      await apiFetch(`/api/notifications/${encodeURIComponent(n.id)}/read`, { method: "POST" })
      announceNotificationsChanged()
    } catch {
      // Opening the item matters more than the read flag.
    }
    setItems((prev) => prev.filter((i) => i.id !== n.id))
    setReadCount((c) => c + 1)
    if (href) router.push(href)
  }

  const remaining = Math.max(items.length, total - readCount)
  return (
    <section aria-labelledby="home-messages-heading" data-home-messages="" className="overflow-hidden rounded-2xl border border-primary/40 bg-surface shadow-ui-sm">
      <h2 id="home-messages-heading" className="flex items-center gap-2 border-b border-border bg-primary-soft/40 px-4 py-3 text-title font-semibold text-fg">
        <span aria-hidden="true" className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-primary text-white">
          <AtSign className="h-3.5 w-3.5" />
        </span>
        {t.updatesHomeMentionsTitle}
        <span className="rounded-full bg-primary px-2 text-caption font-semibold leading-5 text-white tabular-nums">{remaining}</span>
      </h2>
      <ul className="max-h-96 divide-y divide-border overflow-y-auto">
        {items.map((n) => <NotificationRow key={n.id} item={n} onChoose={(item, href) => void choose(item, href)} />)}
      </ul>
    </section>
  )
}
