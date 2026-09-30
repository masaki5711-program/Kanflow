"use client"

import { useState } from "react"
import { Pencil, Trash2 } from "lucide-react"
import { useLanguage } from "@/lib/language-context"
import { I18nText } from "@/components/i18n-text"
import { apiFetch } from "@/hooks"
import { IconButton, useToast, useConfirm } from "@/components/ui"
import type { FixedTaskItem } from "../fixed-tasks-modal"
import { InlineNameEdit } from "./inline-name-edit"

interface Props {
  groupId: string
  item: FixedTaskItem
  /** Replace this item in the parent group (`null` removes it). */
  onReplace: (next: FixedTaskItem | null) => void
}

/** Child task row. Actions: hover/focus reveal on md+, always visible on touch widths. */
export function FixedTaskItemRow({ groupId, item, onReplace }: Props) {
  const { t } = useLanguage()
  const toast = useToast()
  const confirm = useConfirm()
  const [editing, setEditing] = useState(false)
  const url = `/api/user/fixed-tasks/${groupId}/items/${item.id}`

  function fail(err: unknown) {
    toast.error(err instanceof Error ? err.message : t.error)
  }

  async function save(name: string) {
    try {
      const updated = await apiFetch<FixedTaskItem>(url, { method: "PATCH", json: { taskName: name } })
      onReplace(updated)
      setEditing(false)
    } catch (err) {
      fail(err)
    }
  }

  async function remove() {
    const ok = await confirm({
      message: t.fixedTasksDeleteItemConfirm.replace("{name}", item.taskName),
      confirmLabel: t.delete,
      cancelLabel: t.cancel,
      variant: "danger",
    })
    if (!ok) return
    try {
      await apiFetch(url, { method: "DELETE" })
      onReplace(null)
    } catch (err) {
      fail(err)
    }
  }

  return (
    <li className="group/item flex items-center gap-2 px-2 py-1 rounded-ui-sm hover:bg-surface-muted">
      <span aria-hidden className="text-fg-subtle text-caption">•</span>
      {editing ? (
        <InlineNameEdit initial={item.taskName} label={t.fixedTasksItemNameLabel} onSave={save} onCancel={() => setEditing(false)} />
      ) : (
        <>
          <span className="flex-1 min-w-0 text-body text-fg truncate">
            <I18nText i18n={item.i18n} field="taskName" original={item.taskName} entity={{ type: "fixed_task_item", id: item.id }} />
          </span>
          <div className="flex opacity-100 [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover/item:opacity-100 [@media(hover:hover)]:group-focus-within/item:opacity-100">
            <IconButton label={`${t.edit}: ${item.taskName}`} icon={<Pencil className="h-4 w-4" />} size="sm" onClick={() => setEditing(true)} />
            <IconButton label={`${t.delete}: ${item.taskName}`} icon={<Trash2 className="h-4 w-4" />} size="sm" variant="danger" onClick={remove} />
          </div>
        </>
      )}
    </li>
  )
}
