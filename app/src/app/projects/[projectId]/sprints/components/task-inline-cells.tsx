"use client"

import { useEffect, useId, useRef, useState } from "react"
import { useLanguage } from "@/lib/language-context"
import { Input, cn } from "@/components/ui"
import { useAnchoredPosition } from "@/components/ui/use-anchored-position"
import { Clock, User } from "lucide-react"
import { displayAssignees } from "../lib/task-payload"
import type { Member, SprintItem } from "./types"

/** Keys shared by the inline editors: Enter saves, Escape cancels. */
function useCommitKeys(onCommit: () => void, onCancel: () => void) {
  return (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault()
      onCommit()
    } else if (e.key === "Escape") {
      e.stopPropagation()
      onCancel()
    }
  }
}

interface NameEditorProps {
  initial: string
  label: string
  /** Resolves true when saved; the editor closes either way (a failure is toasted by the caller). */
  onSave: (name: string) => Promise<boolean>
  onClose: () => void
}

/** Inline task-name input: Enter or leaving the field saves a changed, non-empty name; Escape cancels. */
export function TaskNameEditor({ initial, label, onSave, onClose }: NameEditorProps) {
  const [value, setValue] = useState(initial)
  const doneRef = useRef(false)

  async function commit() {
    if (doneRef.current) return
    doneRef.current = true
    const next = value.trim()
    if (next && next !== initial.trim()) await onSave(next)
    onClose()
  }
  function cancel() {
    doneRef.current = true
    onClose()
  }
  const onKeyDown = useCommitKeys(() => void commit(), cancel)

  return (
    <Input autoFocus inputSize="sm" aria-label={label} value={value} maxLength={200} className="min-w-[8rem] flex-1"
      onChange={(e) => setValue(e.target.value)} onKeyDown={onKeyDown} onBlur={() => void commit()} />
  )
}

interface HoursCellProps {
  task: SprintItem
  label: string
  onSave: (hours: number | null) => Promise<boolean>
}

/** Estimate / actual text; the estimate turns into a number input on click (empty clears it). */
export function TaskHoursCell({ task, label, onSave }: HoursCellProps) {
  const { t } = useLanguage()
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState("")
  const doneRef = useRef(false)

  function open() {
    doneRef.current = false
    setValue(task.estimatedHours?.toString() ?? "")
    setEditing(true)
  }
  async function commit() {
    if (doneRef.current) return
    doneRef.current = true
    setEditing(false)
    const parsed = value.trim() === "" ? null : Number(value)
    if (parsed !== null && (!Number.isFinite(parsed) || parsed < 0)) return
    if (parsed !== (task.estimatedHours ?? null)) await onSave(parsed)
  }
  const onKeyDown = useCommitKeys(() => void commit(), () => {
    doneRef.current = true
    setEditing(false)
  })

  if (editing) {
    return (
      <Input autoFocus type="number" inputSize="sm" step="0.5" min="0" aria-label={label} value={value} className="w-24"
        onChange={(e) => setValue(e.target.value)} onKeyDown={onKeyDown} onBlur={() => void commit()} />
    )
  }
  const hasHours = !!(task.estimatedHours || task.actualHours)
  return (
    <button type="button" onClick={open} aria-label={label}
      title={`${t.sprintEstimatedHoursShort} / ${t.sprintActualHoursShort} (${t.sprintHoursUnit})`}
      className="inline-flex min-h-8 items-center gap-1 whitespace-nowrap rounded-ui-sm px-1.5 text-caption text-fg-muted hover:bg-surface-sunken hover:text-fg">
      <Clock className="h-3.5 w-3.5" aria-hidden="true" />
      {hasHours
        ? `${t.sprintEstimatedHoursShort} ${task.estimatedHours ?? "-"} · ${t.sprintActualHoursShort} ${task.actualHours ?? "-"} ${t.sprintHoursUnit}`
        : t.sprintUxNoHours}
    </button>
  )
}

interface AssigneeCellProps {
  task: SprintItem
  members: readonly Member[]
  label: string
  /** Resolves true when saved; `ids` is the single new owner or [] to unassign. */
  onSave: (ids: string[]) => Promise<boolean>
}

/** Assignee chips; clicking opens the member list (one owner per task, picking the owner again unassigns). */
export function TaskAssigneeCell({ task, members, label, onSave }: AssigneeCellProps) {
  const { t } = useLanguage()
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const listRef = useRef<HTMLUListElement>(null)
  const listId = useId()
  useAnchoredPosition(open, buttonRef, listRef, "left", () => setOpen(false))
  const assignees = displayAssignees(task)
  const currentIds = (task.assignees ?? []).map((a) => a.id)

  useEffect(() => {
    if (!open) return
    const onPointerDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener("pointerdown", onPointerDown)
    return () => document.removeEventListener("pointerdown", onPointerDown)
  }, [open])

  function pick(userId: string) {
    setOpen(false)
    const only = currentIds.length === 1 && currentIds[0] === userId
    void onSave(only ? [] : [userId])
  }

  return (
    <div ref={rootRef} className="relative" onKeyDown={(e) => { if (e.key === "Escape" && open) { e.stopPropagation(); setOpen(false) } }}>
      <button ref={buttonRef} type="button" onClick={() => setOpen((v) => !v)} aria-label={label} aria-haspopup="listbox"
        aria-expanded={open} aria-controls={open ? listId : undefined}
        className="inline-flex min-h-8 flex-wrap items-center gap-1 rounded-ui-sm px-1 hover:bg-surface-sunken">
        {assignees.length > 0 ? assignees.map((a) => (
          <span key={a.key} className="inline-flex items-center gap-1 rounded-full bg-primary-soft px-2 py-0.5 text-caption text-primary-active">
            <User className="h-3.5 w-3.5" aria-hidden="true" /> {a.name}
          </span>
        )) : <span className="px-1 text-caption text-fg-subtle">{t.sprintUnassigned}</span>}
      </button>
      {open && (
        <ul ref={listRef} id={listId} role="listbox" aria-label={t.sprintAssignee}
          className="absolute left-0 top-full z-30 mt-1 max-h-56 min-w-44 overflow-auto rounded-ui-sm border border-border bg-surface p-1 shadow-ui-md">
          {members.map((m) => {
            const selected = currentIds.includes(m.user.id)
            return (
              <li key={m.id} role="option" aria-selected={selected}>
                <button type="button" onClick={() => pick(m.user.id)}
                  className={cn("flex min-h-9 w-full items-center gap-2 rounded-ui-sm px-2 text-left text-body hover:bg-surface-muted",
                    selected ? "font-medium text-primary-active" : "text-fg")}>
                  {m.user.name}
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
