"use client"

import { Button } from "@/components/ui"
import { useLanguage } from "@/lib/language-context"
import { BacklogSection } from "./backlog-section"
import type { CardActions, CardPermissions } from "./backlog-item-card"
import type { DragState } from "./reorder"
import type { BacklogItem } from "./types"
import { ChevronDown } from "lucide-react"

interface Props extends CardPermissions {
  /** Newest-first page of the (filtered) completed items. */
  items: BacklogItem[]
  /** All filtered completed items (the page is cut from these). */
  matches: number
  expanded: boolean
  onToggle: () => void
  onShowMore: () => void
  actions: CardActions
  selectMode: boolean
  selectedIds: ReadonlySet<string>
  drag: DragState
  isFiltered?: boolean
}

/** Collapsible completed section: newest first, paged ("show more"). State of the toggle lives in `?showDone=1`. */
export function DoneSection({ items, matches, expanded, onToggle, onShowMore, ...rest }: Props) {
  const { t } = useLanguage()
  const remaining = matches - items.length
  return (
    <div>
      <Button
        variant="ghost"
        size="sm"
        aria-expanded={expanded}
        onClick={onToggle}
        className="mb-2"
        leftIcon={<ChevronDown className={`h-4 w-4 transition-transform ${expanded ? "" : "-rotate-90"}`} />}
      >
        {expanded ? t.backlogHideCompleted : t.backlogShowCompleted}
        <span className="rounded-full bg-surface-sunken px-2 py-0.5 text-caption text-fg-muted">
          {matches}
          {t.items}
        </span>
      </Button>
      {expanded && (
        <BacklogSection
          title={t.backlogStatusCompleted}
          hint={t.backlogCompletedHint}
          status="completed"
          items={items}
          totalCount={matches}
          {...rest}
          footer={
            matches > 0 && (
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                <p className="text-caption text-fg-muted">
                  {t.backlogDoneShowing.replace("{shown}", String(items.length)).replace("{total}", String(matches))}
                </p>
                {remaining > 0 && (
                  <Button variant="secondary" size="sm" onClick={onShowMore}>
                    {t.backlogShowMoreDone.replace("{count}", String(remaining))}
                  </Button>
                )}
              </div>
            )
          }
        />
      )}
    </div>
  )
}
