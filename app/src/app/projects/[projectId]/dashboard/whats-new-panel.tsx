"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { AtSign, BellRing, CheckCheck, CircleCheck, Sparkles } from "lucide-react"
import { Button, SkeletonLines, cn, useToast } from "@/components/ui"
import { useLanguage } from "@/lib/language-context"
import { formatDateTime } from "@/lib/format-date"
import { NotificationRow } from "@/components/notifications/notification-row"
import type { NotificationItem } from "@/components/notifications/notification-format"
import type { ProjectUpdates } from "@/components/updates/use-project-updates"
import { FeedItem } from "./activity-feed"

interface Props {
  projectId: string
  data: ProjectUpdates | undefined
  isLoading: boolean
  error: Error | null
  onMarkRead: (notificationId: string) => Promise<void>
  onMarkAllSeen: () => Promise<void>
  onChanged: () => void
}

/**
 * Top of the dashboard: what is new for the viewer in this project — unread
 * mentions / notifications (with the message excerpt) and activity by other
 * members since the last "mark all as seen". Collapses to one line when
 * there is nothing new, so it never pushes the dashboard down for nothing.
 */
export function WhatsNewPanel(props: Props) {
  const { t } = useLanguage()
  const { data, isLoading, error } = props
  if (isLoading && !data) return <SkeletonLines lines={2} label={t.loading} />
  if (error && !data) return <p className="text-caption text-fg-muted">{t.updatesLoadFailed}</p>
  if (!data) return null
  if (data.notifications.length === 0 && data.activity.length === 0) {
    return (
      <p data-whats-new="empty" className="flex items-center gap-2 rounded-ui-lg border border-border bg-surface px-4 py-2.5 text-body text-fg-muted shadow-ui-sm">
        <CircleCheck aria-hidden="true" className="h-4 w-4 shrink-0 text-success" />
        {t.updatesAllCaughtUp}
      </p>
    )
  }
  return <WhatsNewList {...props} data={data} />
}

function WhatsNewList({ projectId, data, onMarkRead, onMarkAllSeen, onChanged }: Props & { data: ProjectUpdates }) {
  const { t, language } = useLanguage()
  const toast = useToast()
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [now] = useState(() => new Date())

  async function choose(n: NotificationItem, href: string | null) {
    try {
      if (!n.readAt) await onMarkRead(n.id)
    } catch {
      // Reading the item matters more than the read flag; the bell can still mark it later.
    }
    onChanged()
    if (href) router.push(href)
  }

  async function markAllSeen() {
    setBusy(true)
    try {
      await onMarkAllSeen()
      toast.success(t.updatesMarkedSeen)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err), { title: t.updatesMarkSeenFailed })
    } finally {
      setBusy(false)
    }
  }

  const since = data.firstVisit ? t.updatesSinceFirst : t.updatesSince.replace("{date}", formatDateTime(data.since, language))
  const more = data.newActivity - data.activity.length

  return (
    <section
      aria-labelledby="whats-new-heading"
      data-whats-new="list"
      className="rounded-ui-lg border border-primary/40 bg-surface shadow-ui-sm ring-1 ring-primary/10"
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-border bg-primary-soft/40 px-4 py-3">
        <h2 id="whats-new-heading" className="flex items-center gap-2 text-title font-semibold text-fg">
          <Sparkles aria-hidden="true" className="h-4 w-4 text-primary" />
          {t.updatesTitle}
        </h2>
        {data.mentions > 0 && (
          <span className="inline-flex items-center gap-1 rounded-full bg-primary px-2 py-0.5 text-caption font-semibold text-white">
            <AtSign aria-hidden="true" className="h-3 w-3" />
            {t.updatesCardMentions.replace("{n}", String(data.mentions))}
          </span>
        )}
        {data.newActivity > 0 && (
          <span className="rounded-full bg-surface px-2 py-0.5 text-caption font-semibold text-primary-strong ring-1 ring-primary/40">
            {t.updatesCardNew.replace("{n}", String(data.newActivity))}
          </span>
        )}
        <span className="text-caption text-fg-muted">{since}</span>
        <Button size="sm" variant="secondary" className="ml-auto" leftIcon={<CheckCheck className="h-4 w-4" />} loading={busy} onClick={() => void markAllSeen()}>
          {t.updatesMarkSeen}
        </Button>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2">
        <div className="min-w-0 border-b border-border lg:border-b-0 lg:border-r">
          <h3 className="flex items-center gap-1.5 px-4 pb-1 pt-3 text-caption font-semibold text-fg-muted">
            <BellRing aria-hidden="true" className="h-3.5 w-3.5" />
            {t.updatesForYou}
            <span className="tabular-nums">({data.unread})</span>
          </h3>
          {data.notifications.length === 0 ? (
            <p className="px-4 pb-3 text-caption text-fg-subtle">{t.updatesForYouEmpty}</p>
          ) : (
            <ul className="max-h-80 divide-y divide-border overflow-y-auto">
              {data.notifications.map((n) => <NotificationRow key={n.id} item={n} onChoose={(item, href) => void choose(item, href)} />)}
            </ul>
          )}
        </div>
        <div className="min-w-0 px-4 pb-2 pt-3">
          <h3 className="text-caption font-semibold text-fg-muted">
            {t.updatesByOthers} <span className="tabular-nums">({data.newActivity})</span>
          </h3>
          {data.activity.length === 0 ? (
            <p className="pb-1 text-caption text-fg-subtle">{t.updatesByOthersEmpty}</p>
          ) : (
            <>
              <ol className={cn("max-h-80 divide-y divide-border overflow-y-auto pr-1")}>
                {data.activity.map((e) => <FeedItem key={e.id} entry={e} projectId={projectId} now={now} isNew />)}
              </ol>
              {more > 0 && <p className="pt-1 text-caption text-fg-muted">{t.updatesByOthersMore.replace("{n}", String(more))}</p>}
            </>
          )}
        </div>
      </div>
    </section>
  )
}
