"use client"

import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from "react"
import { MoreHorizontal } from "lucide-react"
import { cn } from "./cn"
import { IconButton } from "./button"

export interface ActionMenuItem {
  key: string
  label: string
  /** Longer accessible name when the visible `label` is kept short (e.g. names the target). */
  ariaLabel?: string
  icon?: ReactNode
  onSelect: () => void
  /** Destructive entry (red). */
  danger?: boolean
}

interface ActionMenuProps {
  /** Accessible name of the "⋯" button (name the thing it acts on). */
  label: string
  items: readonly ActionMenuItem[]
  className?: string
}

/**
 * "⋯" disclosure menu for the secondary actions of a row / card: opens a
 * list of menu items under the button; ↑/↓ move, Enter or click picks, Escape
 * (focus back to the button) and an outside click close it. Renders nothing
 * without items.
 */
export function ActionMenu({ label, items, className }: ActionMenuProps) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const listRef = useRef<HTMLUListElement>(null)
  const listId = useId()
  // Open upwards when the list would run past the bottom of the viewport.
  const [openUp, setOpenUp] = useState(false)

  useLayoutEffect(() => {
    if (!open) {
      setOpenUp(false)
      return
    }
    const list = listRef.current
    const button = buttonRef.current
    if (!list || !button) return
    const below = window.innerHeight - button.getBoundingClientRect().bottom
    const above = button.getBoundingClientRect().top
    setOpenUp(list.offsetHeight + 8 > below && above > below)
  }, [open])

  useEffect(() => {
    if (!open) return
    rootRef.current?.querySelector<HTMLButtonElement>("[role=menuitem]")?.focus()
    const onPointerDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener("pointerdown", onPointerDown)
    return () => document.removeEventListener("pointerdown", onPointerDown)
  }, [open])

  if (items.length === 0) return null

  function close(restoreFocus: boolean) {
    setOpen(false)
    if (restoreFocus) buttonRef.current?.focus()
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (!open) return
    if (e.key === "Escape") {
      e.stopPropagation()
      close(true)
      return
    }
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return
    e.preventDefault()
    const entries = [...(rootRef.current?.querySelectorAll<HTMLButtonElement>("[role=menuitem]") ?? [])]
    const at = entries.indexOf(document.activeElement as HTMLButtonElement)
    const step = e.key === "ArrowDown" ? 1 : -1
    entries[(at + step + entries.length) % entries.length]?.focus()
  }

  return (
    <div ref={rootRef} className={cn("relative shrink-0", className)} onKeyDown={onKeyDown}>
      <IconButton ref={buttonRef} size="sm" label={label} icon={<MoreHorizontal className="h-4 w-4" />}
        aria-haspopup="menu" aria-expanded={open} aria-controls={open ? listId : undefined}
        onClick={() => setOpen((v) => !v)} />
      {open && (
        <ul ref={listRef} id={listId} role="menu" aria-label={label}
          className={cn(
            "absolute right-0 z-30 w-max min-w-32 max-w-[min(16rem,calc(100vw-2rem))] rounded-ui-sm border border-border bg-surface p-1 shadow-ui-md",
            openUp ? "bottom-full mb-1" : "top-full mt-1",
          )}>
          {items.map((item) => (
            <li key={item.key} role="none">
              <button type="button" role="menuitem" aria-label={item.ariaLabel}
                className={cn(
                  "flex min-h-9 w-full items-center gap-2 rounded-ui-sm px-2 text-left text-body",
                  item.danger ? "text-danger-strong hover:bg-danger-soft" : "text-fg hover:bg-surface-muted",
                )}
                onClick={() => {
                  close(false)
                  item.onSelect()
                }}>
                {item.icon}
                {item.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
