"use client"

import { useState } from "react"
import { ListChecks, Plus } from "lucide-react"
import { useLanguage } from "@/lib/language-context"
import { apiFetch, useApiQuery } from "@/hooks"
import { Button, EmptyState, Input, Modal, SkeletonLines, useToast } from "@/components/ui"
import type { FixedTaskGroupDto, FixedTaskItemDto } from "@/types/api"
import { FixedTaskGroupRow } from "./fixed-tasks/fixed-task-group-row"

export type FixedTaskItem = FixedTaskItemDto
export type FixedTaskGroup = FixedTaskGroupDto

interface Props {
  open: boolean
  onClose: () => void
}

const FIXED_TASKS_URL = "/api/user/fixed-tasks"

export default function FixedTasksModal({ open, onClose }: Props) {
  const { t } = useLanguage()
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t.fixedTasksTitle}
      description={t.fixedTasksDesc}
      size="lg"
      footer={
        <Button variant="secondary" onClick={onClose}>
          {t.close}
        </Button>
      }
    >
      {/* Mounted only while open → data is (re)loaded each time the dialog opens. */}
      {open && <FixedTasksBody />}
    </Modal>
  )
}

function FixedTasksBody() {
  const { t } = useLanguage()
  const toast = useToast()
  const { data: groups = [], isLoading, mutate } = useApiQuery<FixedTaskGroup[]>(FIXED_TASKS_URL, {
    toastOnError: () => t.fixedTasksLoadFailed,
  })
  const [newGroupName, setNewGroupName] = useState("")
  const [adding, setAdding] = useState(false)
  const [expandedGroupId, setExpandedGroupId] = useState<string | null>(null)

  async function handleAddGroup(e: React.FormEvent) {
    e.preventDefault()
    const trimmed = newGroupName.trim()
    if (!trimmed || adding) return
    setAdding(true)
    try {
      const created = await apiFetch<FixedTaskGroup>(FIXED_TASKS_URL, { method: "POST", json: { taskName: trimmed } })
      mutate((prev) => [...(prev ?? []), { ...created, items: created.items ?? [] }])
      setNewGroupName("")
      setExpandedGroupId(created.id)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t.error)
    } finally {
      setAdding(false)
    }
  }

  function updateGroup(id: string, updater: (g: FixedTaskGroup) => FixedTaskGroup | null) {
    mutate((prev) =>
      (prev ?? []).flatMap((g) => {
        if (g.id !== id) return [g]
        const next = updater(g)
        return next ? [next] : []
      }),
    )
  }

  return (
    <div className="space-y-4">
      {isLoading ? (
        <SkeletonLines lines={4} label={t.loading} />
      ) : groups.length === 0 ? (
        <EmptyState compact icon={<ListChecks className="h-6 w-6" />} title={t.fixedTasksEmpty} />
      ) : (
        <ul className="space-y-2">
          {groups.map((group) => (
            <FixedTaskGroupRow
              key={group.id}
              group={group}
              expanded={expandedGroupId === group.id}
              onToggle={() => setExpandedGroupId((cur) => (cur === group.id ? null : group.id))}
              onChange={(updater) => updateGroup(group.id, updater)}
            />
          ))}
        </ul>
      )}

      <form onSubmit={handleAddGroup} className="flex items-center gap-2 border-t border-border pt-4">
        <Input
          value={newGroupName}
          onChange={(e) => setNewGroupName(e.target.value)}
          placeholder={t.fixedTasksGroupNamePlaceholder}
          aria-label={t.fixedTasksGroupNameLabel}
          className="flex-1"
        />
        <Button type="submit" leftIcon={<Plus className="h-4 w-4" />} loading={adding} disabled={!newGroupName.trim()}>
          {t.fixedTasksAdd}
        </Button>
      </form>
    </div>
  )
}
