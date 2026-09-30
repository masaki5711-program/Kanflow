"use client"

import { useId } from "react"
import { useLanguage } from "@/lib/language-context"
import { cn } from "@/components/ui"
import type { Member } from "./types"

interface Props {
  members: Member[]
  /** Selected members' user ids (TaskAssignee). */
  value: string[]
  onChange: (userIds: string[]) => void
}

/**
 * Single-owner assignee picker over the project's members (toggle buttons,
 * one owner per task — 責任所在の明確化). Emits user ids; clicking the
 * selected member again clears the assignment. A task that already has
 * several assignees (legacy data) collapses to the one picked.
 */
export default function TaskAssigneePicker({ members, value, onChange }: Props) {
  const { t } = useLanguage()
  const labelId = useId()

  function pick(userId: string) {
    const isOnlySelected = value.length === 1 && value[0] === userId
    onChange(isOnlySelected ? [] : [userId])
  }

  return (
    <div className="flex flex-col gap-1.5">
      <span id={labelId} className="text-body font-medium text-fg">{t.sprintAssignee}</span>
      <div role="group" aria-labelledby={labelId}
        className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto p-2 border border-border-strong rounded-ui-sm bg-surface">
        {members.length === 0 ? (
          <span className="text-caption text-fg-subtle">{t.sprintUnassigned}</span>
        ) : members.map((m) => {
          const pressed = value.includes(m.user.id)
          return (
            <button key={m.id} type="button" aria-pressed={pressed} onClick={() => pick(m.user.id)}
              className={cn(
                "inline-flex items-center min-h-8 text-caption px-2.5 rounded-full border transition-colors",
                pressed ? "bg-primary-soft border-primary/40 text-primary-active font-medium" : "bg-surface border-border text-fg-muted hover:border-border-strong",
              )}>
              {m.user.name}
            </button>
          )
        })}
      </div>
    </div>
  )
}
