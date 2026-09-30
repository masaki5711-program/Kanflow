"use client"

import { useId } from "react"
import { useLanguage } from "@/lib/language-context"
import { cn } from "@/components/ui"
import type { Member } from "./types"

interface Props {
  members: Member[]
  /** Comma-separated legacy value is tolerated; picking collapses it to one name. */
  value: string
  onChange: (value: string) => void
}

/**
 * Single-owner assignee picker (toggle buttons). Clicking the selected
 * member again clears the assignment.
 */
export default function TaskAssigneePicker({ members, value, onChange }: Props) {
  const { t } = useLanguage()
  const labelId = useId()
  const selected = value.split(",").map((s) => s.trim()).filter(Boolean)

  function pick(name: string) {
    const isOnlySelected = selected.length === 1 && selected[0] === name
    onChange(isOnlySelected ? "" : name)
  }

  return (
    <div className="flex flex-col gap-1.5">
      <span id={labelId} className="text-body font-medium text-fg">{t.sprintAssignee}</span>
      <div role="group" aria-labelledby={labelId}
        className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto p-2 border border-border-strong rounded-ui-sm bg-surface">
        {members.length === 0 ? (
          <span className="text-caption text-fg-subtle">{t.sprintUnassigned}</span>
        ) : members.map((m) => {
          const pressed = selected.includes(m.user.name)
          return (
            <button key={m.id} type="button" aria-pressed={pressed} onClick={() => pick(m.user.name)}
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
