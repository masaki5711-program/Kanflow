"use client"

import { useState } from "react"
import { ChevronRight, Pencil, Plus, Trash2 } from "lucide-react"
import { useLanguage } from "@/lib/language-context"
import { I18nText } from "@/components/i18n-text"
import { apiFetch } from "@/hooks"
import { Badge, Button, IconButton, Input, useToast, useConfirm } from "@/components/ui"
import type { FixedTaskGroup, FixedTaskItem } from "../fixed-tasks-modal"
import { InlineNameEdit } from "./inline-name-edit"
import { FixedTaskItemRow } from "./fixed-task-item-row"

interface Props {
  group: FixedTaskGroup
  expanded: boolean
  onToggle: () => void
  /** Replace (or remove with `null`) this group in the parent list. */
  onChange: (updater: (g: FixedTaskGroup) => FixedTaskGroup | null) => void
}

/** One parent group: name, count, edit/delete, and (expanded) its child items. */
export function FixedTaskGroupRow({ group, expanded, onToggle, onChange }: Props) {
  const { t } = useLanguage()
  const toast = useToast()
  const confirm = useConfirm()
  const [editing, setEditing] = useState(false)
  const [newItemName, setNewItemName] = useState("")
  const [addingItem, setAddingItem] = useState(false)
  const base = `/api/user/fixed-tasks/${group.id}`
  const panelId = `fixed-group-${group.id}`

  function fail(err: unknown) {
    toast.error(err instanceof Error ? err.message : t.error)
  }

  async function saveName(name: string) {
    try {
      const updated = await apiFetch<{ taskName: string }>(base, { method: "PATCH", json: { taskName: name } })
      onChange((g) => ({ ...g, taskName: updated.taskName }))
      setEditing(false)
    } catch (err) {
      fail(err)
    }
  }

  async function deleteGroup() {
    const ok = await confirm({
      message: t.fixedTasksDeleteGroupConfirm.replace("{name}", group.taskName),
      confirmLabel: t.delete,
      cancelLabel: t.cancel,
      variant: "danger",
    })
    if (!ok) return
    try {
      await apiFetch(base, { method: "DELETE" })
      onChange(() => null)
    } catch (err) {
      fail(err)
    }
  }

  async function addItem(e: React.FormEvent) {
    e.preventDefault()
    const trimmed = newItemName.trim()
    if (!trimmed || addingItem) return
    setAddingItem(true)
    try {
      const created = await apiFetch<FixedTaskItem>(`${base}/items`, { method: "POST", json: { taskName: trimmed } })
      onChange((g) => ({ ...g, items: [...g.items, created] }))
      setNewItemName("")
    } catch (err) {
      fail(err)
    } finally {
      setAddingItem(false)
    }
  }

  function replaceItem(itemId: string, next: FixedTaskItem | null) {
    onChange((g) => ({
      ...g,
      items: next ? g.items.map((it) => (it.id === itemId ? next : it)) : g.items.filter((it) => it.id !== itemId),
    }))
  }

  return (
    <li className="rounded-ui-md border border-border bg-surface-muted overflow-hidden">
      <div className="flex items-center gap-2 px-2 py-2">
        <IconButton
          label={expanded ? t.fixedTasksCollapse : t.fixedTasksExpand}
          icon={<ChevronRight className={`h-4 w-4 transition-transform ${expanded ? "rotate-90" : ""}`} />}
          size="sm"
          aria-expanded={expanded}
          aria-controls={panelId}
          onClick={onToggle}
        />
        {editing ? (
          <InlineNameEdit initial={group.taskName} label={t.fixedTasksGroupNameLabel} onSave={saveName} onCancel={() => setEditing(false)} />
        ) : (
          <>
            <span className="flex-1 min-w-0 text-body font-semibold text-fg truncate">
              <I18nText i18n={group.i18n} field="taskName" original={group.taskName} entity={{ type: "fixed_task", id: group.id }} />
            </span>
            <Badge tone="primary" size="sm">
              <span className="sr-only">{t.fixedTasksItemCount}: </span>
              {group.items.length}
            </Badge>
            <IconButton label={`${t.edit}: ${group.taskName}`} icon={<Pencil className="h-4 w-4" />} size="sm" onClick={() => setEditing(true)} />
            <IconButton label={`${t.delete}: ${group.taskName}`} icon={<Trash2 className="h-4 w-4" />} size="sm" variant="danger" onClick={deleteGroup} />
          </>
        )}
      </div>

      {expanded && (
        <div id={panelId} className="px-3 pb-3 pl-11 space-y-2 bg-surface border-t border-border">
          {group.items.length === 0 ? (
            <p className="text-caption text-fg-muted pt-3">{t.fixedTasksItemEmpty}</p>
          ) : (
            <ul className="space-y-1 pt-2">
              {group.items.map((item) => (
                <FixedTaskItemRow key={item.id} groupId={group.id} item={item} onReplace={(next) => replaceItem(item.id, next)} />
              ))}
            </ul>
          )}
          <form onSubmit={addItem} className="flex items-center gap-2 pt-1">
            <Input
              inputSize="sm"
              value={newItemName}
              onChange={(e) => setNewItemName(e.target.value)}
              placeholder={t.fixedTasksItemNamePlaceholder}
              aria-label={t.fixedTasksItemNameLabel}
              className="flex-1"
            />
            <Button type="submit" size="sm" leftIcon={<Plus className="h-4 w-4" />} loading={addingItem} disabled={!newItemName.trim()}>
              {t.fixedTasksAdd}
            </Button>
          </form>
        </div>
      )}
    </li>
  )
}
