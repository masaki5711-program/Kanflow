"use client"

import { useRef } from "react"
import { ArrowLeft, ArrowRight, Copy, Pencil, Plus, Trash2 } from "lucide-react"
import { ActionMenu, IconButton, cn, type ActionMenuItem } from "@/components/ui"
import { useLanguage } from "@/lib/language-context"
import type { BoardSheetDto } from "./board-api"

interface SheetTabsProps {
  sheets: readonly BoardSheetDto[]
  activeId: string
  /** DOM id of the tab of a sheet (the panel is labelled by it). */
  tabId: (sheetId: string) => string
  /** DOM id of the panel the tabs control. */
  panelId: string
  readOnly: boolean
  /** No further sheet can be added (limit reached). */
  canAdd: boolean
  onSelect: (sheetId: string) => void
  onAdd: () => void
  onRename: (sheet: BoardSheetDto) => void
  onDuplicate: (sheet: BoardSheetDto) => void
  onMove: (sheet: BoardSheetDto, direction: -1 | 1) => void
  onDelete: (sheet: BoardSheetDto) => void
}

/**
 * The sheet tabs under the canvas, like the sheets of a spreadsheet. Tab pattern with manual activation:
 * ← / → / Home / End move the focus, Enter or Space opens the sheet (opening saves the current one first).
 * The "⋯" menu next to the tabs acts on the open sheet: rename, duplicate, move, delete.
 */
export function SheetTabs({ sheets, activeId, tabId, panelId, readOnly, canAdd, onSelect, onAdd, onRename, onDuplicate, onMove, onDelete }: SheetTabsProps) {
  const { t } = useLanguage()
  const listRef = useRef<HTMLDivElement>(null)
  const activeIndex = sheets.findIndex((sheet) => sheet.id === activeId)
  const active = activeIndex >= 0 ? sheets[activeIndex] : undefined

  function onKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key) || e.ctrlKey || e.metaKey || e.altKey) return
    const tabs = Array.from(listRef.current?.querySelectorAll<HTMLButtonElement>('[role="tab"]') ?? [])
    if (tabs.length === 0) return
    const index = tabs.indexOf(document.activeElement as HTMLButtonElement)
    const next = e.key === "Home" ? 0 : e.key === "End" ? tabs.length - 1 : (index + (e.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length
    e.preventDefault()
    tabs[next].focus()
  }

  const items: ActionMenuItem[] = []
  if (active && !readOnly) {
    items.push({ key: "rename", label: t.wbRename, icon: <Pencil className="h-4 w-4" aria-hidden />, onSelect: () => onRename(active) })
    if (canAdd) items.push({ key: "duplicate", label: t.wbSheetDuplicate, icon: <Copy className="h-4 w-4" aria-hidden />, onSelect: () => onDuplicate(active) })
    if (activeIndex > 0) {
      items.push({ key: "left", label: t.wbSheetMoveLeft, icon: <ArrowLeft className="h-4 w-4" aria-hidden />, onSelect: () => onMove(active, -1) })
    }
    if (activeIndex < sheets.length - 1) {
      items.push({ key: "right", label: t.wbSheetMoveRight, icon: <ArrowRight className="h-4 w-4" aria-hidden />, onSelect: () => onMove(active, 1) })
    }
    // A board always keeps one sheet.
    if (sheets.length > 1) {
      items.push({ key: "delete", label: t.wbSheetDelete, icon: <Trash2 className="h-4 w-4" aria-hidden />, onSelect: () => onDelete(active), danger: true })
    }
  }

  return (
    <div className="flex items-center gap-1 border-t border-border bg-surface px-2 py-1">
      <div
        ref={listRef}
        role="tablist"
        aria-label={t.wbSheetsLabel}
        aria-orientation="horizontal"
        className="flex min-w-0 items-center gap-1 overflow-x-auto p-1"
        onKeyDown={onKeyDown}
      >
        {sheets.map((sheet) => {
          const selected = sheet.id === activeId
          return (
            <button
              key={sheet.id}
              type="button"
              role="tab"
              id={tabId(sheet.id)}
              aria-selected={selected}
              aria-controls={selected ? panelId : undefined}
              tabIndex={selected ? 0 : -1}
              onClick={() => onSelect(sheet.id)}
              onDoubleClick={readOnly ? undefined : () => onRename(sheet)}
              className={cn(
                "max-w-48 shrink-0 truncate rounded-ui-sm border px-3 py-1 text-caption",
                selected
                  ? "border-primary bg-primary-soft font-semibold text-primary-strong"
                  : "border-transparent text-fg-muted hover:bg-surface-sunken hover:text-fg",
              )}
            >
              {sheet.name}
            </button>
          )
        })}
      </div>
      {active && <ActionMenu label={t.wbActionsFor.replace("{name}", active.name)} items={items} />}
      {!readOnly && (
        <IconButton label={t.wbSheetAdd} icon={<Plus className="h-4 w-4" />} size="sm" disabled={!canAdd} onClick={onAdd} />
      )}
    </div>
  )
}
