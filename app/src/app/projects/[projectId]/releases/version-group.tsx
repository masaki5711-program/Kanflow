"use client"

import { formatLongDate } from "@/lib/format-date"
import { useId } from "react"
import { Badge, Button, Truncate } from "@/components/ui"
import { I18nText } from "@/components/i18n-text"
import { useLanguage } from "@/lib/language-context"
import { STATUS_TONE, UNCATEGORIZED, releaseItemText, type ReleaseItem } from "./release-types"

interface VersionGroupProps {
  version: string
  items: ReleaseItem[]
  isReleased: boolean
  isCollapsed: boolean
  onToggle: (version: string) => void
  onBulkRelease: (version: string) => void
  onEdit: (item: ReleaseItem) => void
}

export function ChevronIcon({ open, className = "" }: { open: boolean; className?: string }) {
  return (
    <svg
      aria-hidden="true"
      className={`h-4 w-4 transition-transform ${open ? "rotate-90" : ""} ${className}`}
      viewBox="0 0 20 20"
      fill="currentColor"
    >
      <path
        fillRule="evenodd"
        d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z"
        clipRule="evenodd"
      />
    </svg>
  )
}

export function VersionGroup({
  version,
  items,
  isReleased,
  isCollapsed,
  onToggle,
  onBulkRelease,
  onEdit,
}: VersionGroupProps) {
  const { t, pt, language } = useLanguage()
  const listId = useId()
  const label = version === UNCATEGORIZED ? pt.releaseUncategorized : version

  const statusLabel: Record<string, string> = {
    staged: pt.releaseStatusStaged,
    ready: pt.releaseStatusReady,
    released: pt.releaseStatusReleased,
    deferred: pt.releaseStatusDeferred,
  }

  return (
    <section className="overflow-hidden rounded-ui-lg border border-border bg-surface shadow-ui-sm">
      <div className="flex items-center justify-between gap-2 border-b border-border bg-surface-muted px-5 py-3">
        <button
          type="button"
          onClick={() => onToggle(version)}
          aria-expanded={!isCollapsed}
          aria-controls={listId}
          className="flex min-w-0 items-center gap-2 rounded-ui-sm text-left"
        >
          <ChevronIcon open={!isCollapsed} className="shrink-0 text-fg-subtle" />
          <h2 className="truncate text-body font-semibold text-fg">{label}</h2>
          <span className="text-caption text-fg-muted">({items.length})</span>
        </button>
        {!isReleased && (
          <Button
            size="sm"
            variant="secondary"
            onClick={() => onBulkRelease(version)}
            className="text-success"
          >
            {pt.releaseBulkRelease}
          </Button>
        )}
      </div>
      {!isCollapsed && (
        <ul id={listId} className="divide-y divide-border">
          {items.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                onClick={() => onEdit(item)}
                className="flex w-full items-center gap-3 px-5 py-3 text-left transition-colors hover:bg-surface-muted"
              >
                <Badge tone={STATUS_TONE[item.status] ?? "neutral"} className="whitespace-nowrap">
                  {statusLabel[item.status] ?? item.status}
                </Badge>
                {item.pbItem && (
                  <span className="shrink-0 font-mono text-caption text-fg-muted">#{item.pbItem.displayId}</span>
                )}
                <Truncate
                  text={releaseItemText(item, language, t.sprintNotEntered)}
                  lines={1}
                  className="min-w-0 flex-1 text-body text-fg"
                />
                {item.epic && (
                  <span className="shrink-0 rounded-full bg-primary-soft px-2 py-0.5 text-caption text-primary-strong">
                    <I18nText i18n={item.i18n} field="epic" original={item.epic} noBadge />
                  </span>
                )}
                {item.releaseDate && (
                  <span className="shrink-0 text-caption text-fg-muted">
                    {formatLongDate(item.releaseDate, language, { utc: true })}
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
