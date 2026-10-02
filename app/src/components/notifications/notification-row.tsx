"use client"

import { AtSign } from "lucide-react"
import { useLanguage } from "@/lib/language-context"
import { cn } from "@/components/ui"
import { formatDateTime, formatRelative } from "@/lib/format-date"
import { describeNotification, type NotificationItem } from "./notification-format"

interface NotificationRowProps {
  item: NotificationItem
  onChoose: (n: NotificationItem, href: string | null) => void
}

/** One notification. @mentions get an accent bar, an @ icon and a tag so they stand out (A3-08). */
export function NotificationRow({ item, onChoose }: NotificationRowProps) {
  const { t, language } = useLanguage()
  const { text, projectName, href } = describeNotification(item, t, language)
  const unread = !item.readAt
  const mention = item.type === "mentioned"
  return (
    <li data-testid="notification-row" data-type={item.type}>
      <button
        type="button"
        onClick={() => onChoose(item, href)}
        className={cn(
          "flex w-full items-start gap-3 border-l-4 border-l-transparent px-4 py-3 text-left hover:bg-surface-muted focus-visible:bg-surface-muted",
          unread && "bg-primary-soft/40",
          mention && "border-l-primary",
        )}
      >
        {mention ? (
          <span aria-hidden="true" className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary text-white">
            <AtSign className="h-3 w-3" />
          </span>
        ) : (
          <span aria-hidden="true" className={cn("mt-1.5 mx-1.5 h-2 w-2 shrink-0 rounded-full", unread ? "bg-primary" : "bg-transparent")} />
        )}
        <span className="min-w-0 flex-1">
          {unread && <span className="sr-only">{t.notifUnread}: </span>}
          {mention && (
            <span className="mb-0.5 inline-block rounded-ui-sm bg-primary-soft px-1.5 text-caption font-semibold text-primary-strong">
              {t.notifMentionTag}
            </span>
          )}
          <span className={cn("block text-body text-fg", unread && "font-medium")}>{text}</span>
          {typeof item.payload.excerpt === "string" && item.payload.excerpt.trim() && (
            // The message itself (comment excerpt), so a mention can be read without opening it.
            <span data-notification-excerpt="" className="mt-1 block line-clamp-2 whitespace-pre-line rounded-ui-sm bg-surface-sunken px-2 py-1 text-caption text-fg">
              {item.payload.excerpt}
            </span>
          )}
          <span className="mt-0.5 block text-caption text-fg-muted">
            {projectName && <span>{projectName} · </span>}
            <time dateTime={item.createdAt} title={formatDateTime(item.createdAt, language)}>
              {formatRelative(item.createdAt, new Date(), language)}
            </time>
          </span>
        </span>
      </button>
    </li>
  )
}
