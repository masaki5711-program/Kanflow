"use client"

import Link from "next/link"
import { useCallback, useState } from "react"
import { Activity } from "lucide-react"
import { Button, EmptyState, SkeletonLines, useToast } from "@/components/ui"
import { apiFetch, useApiQuery } from "@/hooks"
import { useLanguage } from "@/lib/language-context"
import { parseActivityPage } from "@/components/activity/history-format"
import { formatFullDateTime, formatRelativeTime } from "@/components/comments/relative-time"
import { feedSentence, type FeedEntry } from "./activity-sentence"

/** Entries per page of the feed. */
export const FEED_LIMIT = 20

export interface FeedPage {
  items: FeedEntry[]
  nextCursor: string | null
}

/** Tolerant parser: activity page entries that also carry their entity reference. */
export function parseFeedPage(raw: unknown): FeedPage {
  const page = parseActivityPage(raw)
  const items = page.items.filter((e): e is FeedEntry => {
    const v = e as Partial<FeedEntry>
    return typeof v.entityType === "string" && typeof v.entityId === "string"
  })
  return { items, nextCursor: page.nextCursor }
}

function initial(name: string | null | undefined): string {
  return name?.trim().charAt(0).toUpperCase() || "·"
}

/** One feed sentence; `isNew` marks entries by others since the viewer's last check. */
export function FeedItem({ entry, projectId, now, isNew = false }: { entry: FeedEntry; projectId: string; now: Date; isNew?: boolean }) {
  const { t, pt, language } = useLanguage()
  const s = feedSentence(entry, projectId, t, language, pt)
  return (
    <li className="flex gap-3 py-2.5" data-feed-new={isNew ? "true" : undefined}>
      <span aria-hidden="true" className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-surface-sunken text-caption font-semibold text-fg-muted">
        {initial(entry.actor?.name)}
      </span>
      <div className="min-w-0 flex-1">
        <p className="break-words text-body text-fg">
          {s.before}
          {s.href ? (
            <Link href={s.href} className="rounded-sm font-medium text-primary-strong hover:underline">{s.entity}</Link>
          ) : (
            <span className="font-medium">{s.entity}</span>
          )}
          {s.after}
          {s.statusTo && <> <span className="text-fg-muted">{s.statusTo}</span></>}
        </p>
        <p className="flex items-center gap-2">
          {isNew && (
            <span className="rounded-full bg-primary px-1.5 text-[10px] font-bold leading-4 tracking-wide text-white">{t.updatesNewBadge}</span>
          )}
          <time dateTime={entry.createdAt} title={formatFullDateTime(entry.createdAt, language)} className="text-caption text-fg-muted">
            {formatRelativeTime(entry.createdAt, now, language)}
          </time>
        </p>
      </div>
    </li>
  )
}

/** Recent project activity as readable sentences with links to the entities. */
export function ActivityFeed({ projectId, newIds }: { projectId: string; /** Entries shown as NEW (from the updates panel). */ newIds?: ReadonlySet<string> }) {
  const { t } = useLanguage()
  const toast = useToast()
  const url = `/api/projects/${encodeURIComponent(projectId)}/activity?limit=${FEED_LIMIT}`
  const { data, error, isLoading, refetch, mutate } = useApiQuery<FeedPage>(url, { parse: parseFeedPage })
  const [loadingMore, setLoadingMore] = useState(false)
  const [now] = useState(() => new Date())

  const loadMore = useCallback(async () => {
    if (!data?.nextCursor) return
    setLoadingMore(true)
    try {
      const next = parseFeedPage(await apiFetch(`${url}&cursor=${encodeURIComponent(data.nextCursor)}`))
      mutate((prev) => ({ items: [...(prev?.items ?? []), ...next.items], nextCursor: next.nextCursor }))
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err), { title: t.dashboardFeedLoadFailed })
    } finally {
      setLoadingMore(false)
    }
  }, [data?.nextCursor, url, mutate, toast, t.dashboardFeedLoadFailed])

  let body
  if (isLoading) body = <SkeletonLines lines={5} label={t.loading} />
  else if (error && !data) {
    body = (
      <EmptyState compact headingLevel={3} title={t.dashboardFeedLoadFailed} description={error.message}
        action={<Button variant="secondary" size="sm" onClick={refetch}>{t.dashboardFeedRetry}</Button>} />
    )
  } else if (!data || data.items.length === 0) {
    body = <EmptyState compact headingLevel={3} icon={<Activity className="h-5 w-5" />} title={t.dashboardFeedEmpty} />
  } else {
    body = (
      <>
        <ol className="max-h-[32rem] divide-y divide-border overflow-y-auto pr-1">
          {data.items.map((entry) => <FeedItem key={entry.id} entry={entry} projectId={projectId} now={now} isNew={newIds?.has(entry.id) ?? false} />)}
        </ol>
        {data.nextCursor && (
          <div className="flex justify-center pt-2">
            <Button variant="ghost" size="sm" loading={loadingMore} onClick={() => void loadMore()}>{t.dashboardFeedLoadMore}</Button>
          </div>
        )}
      </>
    )
  }

  return (
    <section aria-labelledby="dashboard-feed-heading" className="rounded-ui-lg border border-border bg-surface p-4 shadow-ui-sm sm:p-5">
      <h2 id="dashboard-feed-heading" className="mb-1 flex items-center gap-2 text-title font-semibold text-fg">
        <Activity aria-hidden="true" className="h-4 w-4 text-fg-muted" />
        {t.dashboardFeedTitle}
      </h2>
      {body}
    </section>
  )
}
