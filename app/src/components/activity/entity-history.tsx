"use client"

import { useCallback, useState } from "react"
import { History } from "lucide-react"
import { useLanguage } from "@/lib/language-context"
import { Button, EmptyState, SkeletonLines, useToast } from "@/components/ui"
import { apiFetch, useApiQuery } from "@/hooks"
import { formatFullDateTime, formatRelativeTime } from "@/components/comments/relative-time"
import { actionSentence, parseActivityPage, type ActivityEntry, type ActivityPage } from "./history-format"
import { useLiveRefetch } from "@/components/realtime/use-live-refetch"
import { mergeNewestFirst } from "@/components/realtime/merge-pages"

export interface EntityHistoryProps {
  projectId: string
  entityType: string
  entityId: string
  /** Localized label per tracked field (unknown fields show their raw name). */
  fieldLabels: Readonly<Record<string, string>>
  /** Display text of a field value (e.g. status code → label); default = the value itself. */
  formatValue?: (field: string, value: string | number | boolean) => string
}

const VALUE_MAX = 80

function cut(text: string): string {
  return text.length > VALUE_MAX ? `${text.slice(0, VALUE_MAX - 1)}…` : text
}

/**
 * Change history of one entity (GET /activity/:entityType/:entityId), newest
 * first, as a readable list: "Alice changed the status — Status: Ready → Done".
 */
export function EntityHistory({ projectId, entityType, entityId, fieldLabels, formatValue }: EntityHistoryProps) {
  const { t } = useLanguage()
  const toast = useToast()
  const url = `/api/projects/${encodeURIComponent(projectId)}/activity/${entityType}/${encodeURIComponent(entityId)}`
  const { data, error, isLoading, refetch, mutate } = useApiQuery<ActivityPage>(url, { parse: parseActivityPage })
  const [loadingMore, setLoadingMore] = useState(false)
  // Changes made meanwhile (by anyone) go on top live.
  const refreshNewest = useCallback(async () => {
    try {
      const first = parseActivityPage(await apiFetch(url))
      mutate((prev) => mergeNewestFirst(prev, first))
    } catch {
      // The next event or reopening the tab tries again.
    }
  }, [url, mutate])
  useLiveRefetch(() => void refreshNewest(), { types: ["activity"], projectId, entityTypes: [entityType], entityIds: entityId })

  const loadMore = useCallback(async () => {
    if (!data?.nextCursor) return
    setLoadingMore(true)
    try {
      const next = parseActivityPage(await apiFetch(`${url}?cursor=${encodeURIComponent(data.nextCursor)}`))
      mutate((prev) => ({ items: [...(prev?.items ?? []), ...next.items], nextCursor: next.nextCursor }))
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err), { title: t.historyLoadFailed })
    } finally {
      setLoadingMore(false)
    }
  }, [data?.nextCursor, url, mutate, toast, t.historyLoadFailed])

  if (isLoading) return <SkeletonLines lines={3} label={t.loading} />
  if (error && !data) {
    return (
      <EmptyState compact headingLevel={3} title={t.historyLoadFailed} description={error.message}
        action={<Button variant="secondary" onClick={refetch}>{t.commentsRetry}</Button>} />
    )
  }
  const items = data?.items ?? []
  if (items.length === 0) return <EmptyState compact headingLevel={3} icon={<History className="h-6 w-6" />} title={t.historyEmpty} />

  const show = (field: string, value: string | number | boolean | null) => {
    if (value === null || value === "") return t.historyEmptyValue
    return cut(formatValue ? formatValue(field, value) : String(value))
  }

  return (
    <section aria-label={t.historyTitle} className="space-y-3">
      <ol className="space-y-2">
        {items.map((entry) => (
          <HistoryItem key={entry.id} entry={entry} fieldLabels={fieldLabels} show={show} />
        ))}
      </ol>
      {data?.nextCursor && (
        <div className="flex justify-center">
          <Button variant="secondary" size="sm" loading={loadingMore} onClick={() => void loadMore()}>
            {t.historyLoadMore}
          </Button>
        </div>
      )}
    </section>
  )
}

interface ItemProps {
  entry: ActivityEntry
  fieldLabels: Readonly<Record<string, string>>
  show: (field: string, value: string | number | boolean | null) => string
}

function HistoryItem({ entry, fieldLabels, show }: ItemProps) {
  const { t, language } = useLanguage()
  const changes = Object.entries(entry.changes ?? {})
  return (
    <li className="rounded-ui-md border border-border bg-surface px-3 py-2">
      <div className="flex flex-wrap items-baseline gap-x-2">
        <span className="text-body text-fg">{actionSentence(entry, t)}</span>
        <time dateTime={entry.createdAt} title={formatFullDateTime(entry.createdAt, language)} className="text-caption text-fg-muted">
          {formatRelativeTime(entry.createdAt, new Date(), language)}
        </time>
      </div>
      {changes.length > 0 && (
        <ul className="mt-1 space-y-0.5">
          {changes.map(([field, change]) => (
            <li key={field} className="text-caption text-fg-muted break-words">
              <span className="font-medium text-fg">{fieldLabels[field] ?? field}</span>
              {": "}
              {"changed" in change ? t.historyChanged : `${show(field, change.from)} → ${show(field, change.to)}`}
            </li>
          ))}
        </ul>
      )}
    </li>
  )
}
