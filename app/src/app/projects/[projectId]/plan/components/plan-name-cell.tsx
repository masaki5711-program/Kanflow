"use client"

import { useState, type KeyboardEvent, type PointerEvent } from "react"
import { GripVertical } from "lucide-react"
import { CardMenu, type CardMenuItem } from "@/app/projects/[projectId]/backlog/card-menu"
import { DisclosureChevron, cn } from "@/components/ui"
import { I18nText } from "@/components/i18n-text"
import { gridKeyAction } from "../lib/interaction"
import type { PlanItem } from "../lib/plan-types"
import { fillTemplate } from "../lib/template"
import type { FlatRow } from "../lib/tree"
import type { ChartEnv, RowHandlers } from "./chart-types"

const INDENT_PX = 14

interface Props {
  row: FlatRow
  env: ChartEnv
  handlers: RowHandlers
  collapsed: boolean
  renaming: boolean
  width: number
  hintId: string
  onHandlePointerDown: (e: PointerEvent<HTMLElement>, id: string) => void
}

function RenameInput({ item, env, handlers }: { item: PlanItem; env: ChartEnv; handlers: RowHandlers }) {
  const [value, setValue] = useState(item.name)
  const [done, setDone] = useState(false)
  const finish = (save: boolean) => {
    if (done) return
    setDone(true)
    if (save && value.trim() && value.trim() !== item.name) handlers.commitRename(item, value.trim())
    else handlers.cancelRename()
  }
  return (
    <input
      autoFocus
      aria-label={fillTemplate(env.t.planRenameLabel, { name: item.name })}
      value={value}
      maxLength={255}
      onChange={(e) => setValue(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault()
          finish(true)
        } else if (e.key === "Escape") {
          e.preventDefault()
          e.stopPropagation()
          finish(false)
        }
      }}
      onBlur={() => finish(true)}
      className="min-w-0 flex-1 rounded-ui-sm border border-border-strong bg-surface px-1.5 py-0.5 text-body text-fg"
    />
  )
}

function menuItems(row: FlatRow, env: ChartEnv, handlers: RowHandlers): CardMenuItem[] {
  const { item } = row
  const { t } = env
  const leaf = !row.hasChildren && !item.isMilestone
  const items: CardMenuItem[] = [{ key: "edit", label: t.planMenuEdit, onSelect: () => handlers.open(item) }]
  if (!env.canEdit) return items
  items.push(
    { key: "up", label: t.planMoveUp, disabled: !row.moves.up, onSelect: () => handlers.move(item.id, "moveUp") },
    { key: "down", label: t.planMoveDown, disabled: !row.moves.down, onSelect: () => handlers.move(item.id, "moveDown") },
    { key: "indent", label: t.planIndent, disabled: !row.moves.indent, onSelect: () => handlers.move(item.id, "indent") },
    { key: "outdent", label: t.planOutdent, disabled: !row.moves.outdent, onSelect: () => handlers.move(item.id, "outdent") },
  )
  if (!item.isMilestone) items.push({ key: "child", label: t.planAddChild, onSelect: () => handlers.addChild(item.id) })
  items.push({ key: "successor", label: t.planAddSuccessor, onSelect: () => handlers.addSuccessor(item) })
  if (leaf) items.push({ key: "link", label: t.planLinkPbis, onSelect: () => handlers.linkPbis(item) })
  items.push({ key: "delete", label: t.delete, onSelect: () => handlers.remove(item) })
  return items
}

/**
 * Name cell of a grid row: drag handle, expand toggle, the name (click
 * selects, Enter opens, F2 / double click renames, Alt+arrows restructure)
 * and the "…" menu.
 */
export function PlanNameCell({ row, env, handlers, collapsed, renaming, width, hintId, onHandlePointerDown }: Props) {
  const { item } = row
  const { t } = env
  const name = env.nameOf(item)

  function onKeyDown(e: KeyboardEvent<HTMLButtonElement>) {
    const action = gridKeyAction(e)
    if (!action) return
    e.preventDefault()
    if (action === "open") handlers.open(item)
    else if (action === "rename") {
      if (env.canEdit) handlers.startRename(item.id)
    } else if (env.canEdit) handlers.move(item.id, action)
  }

  return (
    <div role="rowheader" className="flex h-full shrink-0 items-center gap-1 pr-1" style={{ width }}>
      {env.canEdit ? (
        <span
          role="img"
          aria-label={fillTemplate(t.planDragHandle, { name })}
          title={fillTemplate(t.planDragHandle, { name })}
          data-plan-handle={item.id}
          onPointerDown={(e) => onHandlePointerDown(e, item.id)}
          className="flex h-8 w-5 shrink-0 cursor-grab touch-none items-center justify-center text-fg-subtle hover:text-fg print:hidden"
        >
          <GripVertical aria-hidden="true" className="h-4 w-4" />
        </span>
      ) : (
        <span aria-hidden="true" className="w-2 shrink-0" />
      )}
      <span aria-hidden="true" className="shrink-0" style={{ width: row.depth * INDENT_PX }} />
      {row.hasChildren ? (
        <button
          type="button"
          onClick={() => handlers.toggle(item.id)}
          aria-expanded={!collapsed}
          aria-label={`${collapsed ? t.planExpand : t.planCollapse}: ${name}`}
          className="inline-flex h-7 w-6 shrink-0 items-center justify-center rounded-ui-sm text-fg-muted hover:text-fg"
        >
          <DisclosureChevron open={!collapsed} className="h-4 w-4" />
        </button>
      ) : (
        <span aria-hidden="true" className="w-6 shrink-0" />
      )}
      {item.isMilestone && <span aria-hidden="true" className="h-2.5 w-2.5 shrink-0 rotate-45 bg-plan-milestone" />}
      {renaming ? (
        <RenameInput item={item} env={env} handlers={handlers} />
      ) : (
        <button
          type="button"
          data-plan-name={item.id}
          onClick={() => handlers.select(item.id, { scrollBar: true })}
          onDoubleClick={() => env.canEdit && handlers.startRename(item.id)}
          onKeyDown={onKeyDown}
          aria-describedby={hintId}
          title={name}
          className={cn("min-w-0 flex-1 truncate rounded-ui-sm px-1 py-1 text-left text-body text-fg hover:text-primary-strong", row.hasChildren && "font-semibold")}
        >
          <I18nText i18n={item.i18n} field="name" original={item.name} entity={{ type: "plan_item", id: item.id }} />
        </button>
      )}
      <div className="shrink-0 opacity-100 print:hidden [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100 [@media(hover:hover)]:group-focus-within:opacity-100 [@media(hover:hover)]:group-data-[selected=true]:opacity-100">
        <CardMenu portal label={fillTemplate(t.planMenuLabel, { name })} items={menuItems(row, env, handlers)} />
      </div>
    </div>
  )
}
