"use client"

import { Fragment, useId, useMemo, type ReactNode } from "react"
import { Button, EmptyState, cn } from "@/components/ui"
import { HelpTooltip } from "@/components/help-tooltip"
import { useLanguage } from "@/lib/language-context"
import { BacklogItemCard, type CardActions, type CardPermissions } from "./backlog-item-card"
import { previewIds, type DragState } from "./reorder"
import type { BacklogItem, BacklogStatus } from "./types"
import { Archive, CircleCheck, Clock, Scale } from "lucide-react"

const SECTION_STYLE: Record<BacklogStatus, { Icon: typeof Clock; border: string; icon: string; badge: string }> = {
  ready: { Icon: CircleCheck, border: "border-l-emerald-500", icon: "text-emerald-700", badge: "bg-success-soft text-success-strong" },
  not_ready: { Icon: Clock, border: "border-l-amber-500", icon: "text-warning-strong", badge: "bg-warning-soft text-warning-strong" },
  completed: { Icon: Archive, border: "border-l-slate-400", icon: "text-fg-muted", badge: "bg-surface-sunken text-fg-muted" },
}

interface Props extends CardPermissions {
  title: string
  hint: string
  status: BacklogStatus
  /** Visible items in display order. */
  items: BacklogItem[]
  /** Items in the section before filtering (for the count badge). */
  totalCount?: number
  actions: CardActions
  selectMode: boolean
  selectedIds: ReadonlySet<string>
  drag: DragState
  showWorkloadTotal?: boolean
  /** Empty-state action: open the create modal (shown on the Not-Ready section, where new items land). */
  onAdd?: () => void
  /** Rendered below the list (e.g. "show more"). */
  footer?: ReactNode
  /** A search / facet filter is active (the empty state then says "no match"). */
  isFiltered?: boolean
}

function DropIndicator() {
  return <li aria-hidden="true" className="h-1 rounded-full bg-primary" data-drop-indicator="" />
}

export function BacklogSection(props: Props) {
  const { title, hint, status, items, actions, drag, selectMode, selectedIds, showWorkloadTotal, onAdd } = props
  const { t } = useLanguage()
  const headingId = useId()
  const style = SECTION_STYLE[status]
  const sectionWorkload = items.reduce((sum, i) => sum + i.workloadScore, 0)
  const session = drag?.section === status ? drag : null

  // Keyboard drags preview the new order live; pointer drags show an insertion line.
  const ordered = useMemo(() => {
    if (session?.mode !== "keyboard") return items
    const byId = new Map(items.map((i) => [i.id, i]))
    return previewIds(session).flatMap((id) => byId.get(id) ?? [])
  }, [items, session])
  const indicator = useMemo(() => {
    if (session?.mode !== "pointer" || session.to === session.from) return null
    const others = items.filter((i) => i.id !== session.itemId)
    return { beforeId: others[session.to]?.id ?? null }
  }, [items, session])

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
              {props.totalCount !== undefined && props.totalCount !== items.length ? `${items.length} / ${props.totalCount}` : items.length}
              {t.items}
            </span>
            <HelpTooltip content={hint} ariaLabel={t.backlogHelpAbout.replace("{field}", title)} side="right" />
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
            title={props.isFiltered ? t.backlogNoFilterMatch : t.iceboxNoItems}
            action={
              props.canEdit && onAdd && status === "not_ready" ? (
                <Button size="sm" variant="secondary" onClick={onAdd}>
                  {t.backlogAddItem}
                </Button>
              ) : undefined
            }
          />
        ) : (
          <ul className="space-y-2" data-dnd-list={status}>
            {ordered.map((item) => {
              const isDragged = session?.itemId === item.id
              return (
                <Fragment key={item.id}>
                  {indicator?.beforeId === item.id && <DropIndicator />}
                  <BacklogItemCard
                    item={item}
                    section={status}
                    canEdit={props.canEdit}
                    canReorder={props.canReorder}
                    canDelete={props.canDelete}
                    canInvest={props.canInvest}
                    selectMode={selectMode}
                    isSelected={selectedIds.has(item.id)}
                    isDragging={isDragged}
                    {...actions}
                  />
                </Fragment>
              )
            })}
            {indicator && indicator.beforeId === null && <DropIndicator />}
          </ul>
        )}
        {props.footer}
      </div>
    </section>
  )
}
