"use client"

import { useRef, type KeyboardEvent } from "react"
import { useLanguage } from "@/lib/language-context"
import { cn } from "@/components/ui"
import { NOTIFICATION_GROUPS, type NotificationGroup } from "@/lib/notification-groups"
import type { UnreadByGroup } from "./use-notification-feed"

interface NotificationTabsProps {
  baseId: string
  active: NotificationGroup
  unread: UnreadByGroup | null
  onSelect: (group: NotificationGroup) => void
}

/** すべて / メンション・自分宛 / その他 with unread counts (A3-08). Arrow keys move between tabs. */
export function NotificationTabs({ baseId, active, unread, onSelect }: NotificationTabsProps) {
  const { t } = useLanguage()
  const refs = useRef<Partial<Record<NotificationGroup, HTMLButtonElement | null>>>({})
  const labels: Record<NotificationGroup, string> = { all: t.notifTabAll, personal: t.notifTabPersonal, other: t.notifTabOther }

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const tabs = NOTIFICATION_GROUPS
    const i = tabs.indexOf(active)
    const next =
      e.key === "ArrowRight" ? tabs[(i + 1) % tabs.length]
        : e.key === "ArrowLeft" ? tabs[(i - 1 + tabs.length) % tabs.length]
          : e.key === "Home" ? tabs[0]
            : e.key === "End" ? tabs[tabs.length - 1]
              : null
    if (!next) return
    e.preventDefault()
    onSelect(next)
    refs.current[next]?.focus()
  }

  return (
    <div role="tablist" aria-label={t.notifTabsLabel} onKeyDown={onKeyDown} className="flex gap-1 border-b border-border px-2">
      {NOTIFICATION_GROUPS.map((group) => {
        const count = unread?.[group] ?? 0
        const selected = active === group
        return (
          <button
            key={group}
            ref={(el) => {
              refs.current[group] = el
            }}
            type="button"
            role="tab"
            id={`${baseId}-tab-${group}`}
            aria-controls={`${baseId}-panel`}
            aria-selected={selected}
            tabIndex={selected ? 0 : -1}
            onClick={() => onSelect(group)}
            className={cn(
              "-mb-px inline-flex min-h-9 items-center gap-1.5 whitespace-nowrap border-b-2 px-2 text-caption font-medium transition-colors",
              selected ? "border-primary text-primary-strong" : "border-transparent text-fg-muted hover:text-fg",
            )}
          >
            {labels[group]}
            {count > 0 && (
              <span
                data-testid={`notif-tab-count-${group}`}
                className={cn(
                  "min-w-[1.125rem] rounded-full px-1 text-center text-caption font-semibold leading-[1.125rem]",
                  group === "personal" ? "bg-danger text-white" : "bg-surface-sunken text-fg-muted",
                )}
              >
                {count > 99 ? "99+" : count}
                <span className="sr-only"> {t.notifUnread}</span>
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}
