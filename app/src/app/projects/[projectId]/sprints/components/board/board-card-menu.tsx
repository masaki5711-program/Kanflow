"use client"

import { useEffect, useId, useRef, useState } from "react"
import { useLanguage } from "@/lib/language-context"
import { IconButton, TaskStatusIcon } from "@/components/ui"
import { BOARD_STATUSES, type BoardStatus } from "./board-model"
import { ArrowRightLeft } from "lucide-react"

interface Props {
  taskName: string
  status: BoardStatus
  columnLabels: Record<BoardStatus, string>
  onMove: (to: BoardStatus) => void
}

/**
 * "Move to…" disclosure menu of a board card — the touch / mobile (and
 * pointer-free) alternative to dragging. Lists the other columns.
 */
export default function BoardCardMenu({ taskName, status, columnLabels, onMove }: Props) {
  const { t } = useLanguage()
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const listId = useId()

  useEffect(() => {
    if (!open) return
    rootRef.current?.querySelector<HTMLButtonElement>("[data-move-option]")?.focus()
    const onPointerDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener("pointerdown", onPointerDown)
    return () => document.removeEventListener("pointerdown", onPointerDown)
  }, [open])

  function close(restoreFocus: boolean) {
    setOpen(false)
    if (restoreFocus) buttonRef.current?.focus()
  }

  return (
    <div ref={rootRef} className="relative flex-shrink-0" data-card-control
      onKeyDown={(e) => {
        if (e.key !== "Escape" || !open) return
        e.stopPropagation()
        close(true)
      }}>
      <IconButton ref={buttonRef} size="sm" label={t.sprintBoardMoveTo.replace("{name}", taskName)}
        icon={<ArrowRightLeft className="w-4 h-4" />} aria-expanded={open} aria-controls={open ? listId : undefined}
        onClick={() => setOpen((v) => !v)} />
      {open && (
        <ul id={listId} aria-label={t.sprintBoardMoveToShort}
          className="absolute right-0 top-full z-20 mt-1 min-w-40 rounded-ui-sm border border-border bg-surface p-1 shadow-ui-md">
          {BOARD_STATUSES.filter((s) => s !== status).map((s) => (
            <li key={s}>
              <button type="button" data-move-option
                className="flex w-full min-h-9 items-center gap-2 rounded-ui-sm px-2 text-left text-body text-fg hover:bg-surface-muted"
                onClick={() => {
                  close(false)
                  onMove(s)
                }}>
                <TaskStatusIcon status={s} className="w-4 h-4 text-fg-muted" />
                {columnLabels[s]}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
