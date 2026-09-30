"use client"

import { useId } from "react"
import { Button, EmptyState, cn } from "@/components/ui"
import { HelpTooltip } from "@/components/help-tooltip"
import { useLanguage } from "@/lib/language-context"
import { BacklogItemCard, type CardActions } from "./backlog-item-card"
import type { BacklogItem, BacklogStatus } from "./types"
import { Archive, CircleCheck, Clock, Scale } from "lucide-react"

const SECTION_STYLE: Record<BacklogStatus, { Icon: typeof Clock; border: string; icon: string; badge: string }> = {
  ready: { Icon: CircleCheck, border: "border-l-emerald-500", icon: "text-emerald-700", badge: "bg-success-soft text-success-strong" },
  not_ready: { Icon: Clock, border: "border-l-amber-500", icon: "text-warning-strong", badge: "bg-warning-soft text-warning-strong" },
  completed: { Icon: Archive, border: "border-l-slate-400", icon: "text-fg-muted", badge: "bg-surface-sunken text-fg-muted" },
}

interface Props extends CardActions {
  title: string
  hint: string
  status: BacklogStatus
  items: BacklogItem[]
  canEdit: boolean
  showWorkloadTotal?: boolean
  /** Empty-state action: open the create form (shown on the Not-Ready section, where new items land). */
  onAdd?: () => void
}

export function BacklogSection({ title, hint, status, items, canEdit, showWorkloadTotal, onAdd, ...actions }: Props) {
  const { t } = useLanguage()
  const headingId = useId()
  const style = SECTION_STYLE[status]
  const sectionWorkload = items.reduce((sum, i) => sum + i.workloadScore, 0)

  return (
    <section aria-labelledby={headingId} className="overflow-hidden rounded-ui-lg border border-border bg-surface shadow-ui-sm">
      <div className={cn("border-l-4 px-6 py-4", style.border)}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <style.Icon className={cn("h-5 w-5", style.icon)} />
            <h2 id={headingId} className="text-body-lg font-semibold text-fg">
              {title}
            </h2>
            <span className={cn("rounded-full px-2 py-0.5 text-caption font-medium", style.badge)}>
              {items.length}
              {t.items}
            </span>
            <HelpTooltip content={hint} ariaLabel={title} side="right" />
          </div>
          {showWorkloadTotal && (
            <span className="inline-flex items-center gap-1 rounded-full bg-primary-soft px-3 py-1 text-caption font-medium text-primary-active">
              <Scale className="h-3.5 w-3.5" />
              {t.reportTotalWorkload}: {sectionWorkload}
            </span>
          )}
        </div>
      </div>
      <div className="p-4">
        {items.length === 0 ? (
          <EmptyState
            compact
            title={t.iceboxNoItems}
            action={
              canEdit && onAdd && status === "not_ready" ? (
                <Button size="sm" variant="secondary" onClick={onAdd}>
                  {t.backlogAddItem}
                </Button>
              ) : undefined
            }
          />
        ) : (
          <ul className="space-y-2">
            {items.map((item, index) => (
              <BacklogItemCard
                key={item.id}
                item={item}
                section={status}
                canEdit={canEdit}
                isFirst={index === 0}
                isLast={index === items.length - 1}
                {...actions}
              />
            ))}
          </ul>
        )}
      </div>
    </section>
  )
}
