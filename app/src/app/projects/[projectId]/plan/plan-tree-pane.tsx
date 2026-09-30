"use client"

import { IconButton, cn } from "@/components/ui"
import { I18nText } from "@/components/i18n-text"
import { useLanguage } from "@/lib/language-context"
import type { EntityI18n } from "@/lib/translation/types"
import { statusBadgeColor, type FlatRow, type PlanItem } from "./lib/plan-utils"
import type { PlanItemsApi } from "./use-plan-items"

export const ROW_HEIGHT = 36
export const HEADER_HEIGHT = 56
export const LEFT_PANE_WIDTH = 360
const INDENT_PX = 16

/** API rows carry `i18n` (both-language text); the shared PlanItem type stays unchanged. */
export function i18nOf(row: unknown): EntityI18n | undefined {
  return (row as { i18n?: EntityI18n } | null | undefined)?.i18n
}

interface PlanTreePaneProps {
  rows: FlatRow[]
  collapsed: ReadonlySet<string>
  onToggle: (id: string) => void
  onOpen: (item: PlanItem) => void
  onAddChild: (parentId: string) => void
  itemName: (item: PlanItem) => string
  canEdit: boolean
  api: PlanItemsApi
}

/** Row action: 32px square target (WCAG 2.5.8) with a text glyph icon. */
function RowAction({ label, onClick, className, children }: { label: string; onClick: () => void; className?: string; children: string }) {
  return (
    <IconButton
      label={label}
      size="sm"
      onClick={onClick}
      className={cn("text-caption", className)}
      icon={<span aria-hidden="true">{children}</span>}
    />
  )
}

/** Left pane: hierarchical item names with expand/collapse and row actions. */
export function PlanTreePane({ rows, collapsed, onToggle, onOpen, onAddChild, itemName, canEdit, api }: PlanTreePaneProps) {
  const { t } = useLanguage()
  return (
    <div className="shrink-0 border-r border-border" style={{ width: LEFT_PANE_WIDTH }}>
      <div
        className="border-b border-border bg-surface-muted px-3 flex items-center text-caption font-semibold text-fg-muted"
        style={{ height: HEADER_HEIGHT }}
      >
        {t.planTitle}
      </div>
      <ul>
        {rows.map((row) => {
          const { item } = row
          const name = itemName(item)
          const isCollapsed = collapsed.has(item.id)
          return (
            <li
              key={item.id}
              className="border-b border-border/60 px-2 flex items-center gap-1.5 group hover:bg-surface-muted"
              style={{ height: ROW_HEIGHT, paddingLeft: 8 + row.depth * INDENT_PX }}
            >
              {row.hasChildren ? (
                <button
                  type="button"
                  onClick={() => onToggle(item.id)}
                  aria-expanded={!isCollapsed}
                  aria-label={`${isCollapsed ? t.planExpand : t.planCollapse}: ${name}`}
                  className="w-6 h-6 inline-flex items-center justify-center text-fg-muted hover:text-fg shrink-0 rounded-ui-sm"
                >
                  <svg aria-hidden="true" className={cn("w-3.5 h-3.5 transition-transform", !isCollapsed && "rotate-90")} viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z" clipRule="evenodd"/>
                  </svg>
                </button>
              ) : (
                <span aria-hidden="true" className="w-6 h-6 shrink-0" />
              )}
              {item.isMilestone && <span aria-hidden="true" className="text-violet-600 text-caption">◆</span>}
              <button
                type="button"
                onClick={() => onOpen(item)}
                className="flex-1 min-w-0 text-left text-caption text-fg truncate hover:text-primary"
                title={name}
              >
                <I18nText i18n={i18nOf(item)} field="name" original={item.name} entity={{ type: "plan_item", id: item.id }} />
              </button>
              <span className={`text-caption px-1.5 py-0.5 rounded font-medium shrink-0 ${statusBadgeColor(item.status)}`}>
                {item.progressPct}%
              </span>
              {canEdit && (
                <div className="flex items-center gap-1 shrink-0 opacity-100 [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100 [@media(hover:hover)]:group-focus-within:opacity-100 transition-opacity">
                  <RowAction label={`${t.planMoveUp}: ${name}`} onClick={() => void api.moveItem(item.id, "up")}>↑</RowAction>
                  <RowAction label={`${t.planMoveDown}: ${name}`} onClick={() => void api.moveItem(item.id, "down")}>↓</RowAction>
                  <RowAction label={`${t.planOutdent}: ${name}`} onClick={() => void api.outdentItem(item.id)}>◀</RowAction>
                  <RowAction label={`${t.planIndent}: ${name}`} onClick={() => void api.indentItem(item.id)}>▶</RowAction>
                  <RowAction label={`${t.planAddChild}: ${name}`} onClick={() => onAddChild(item.id)} className="text-primary hover:text-primary-hover">+</RowAction>
                </div>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
