"use client"

import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react"
import { IconButton } from "@/components/ui"
import { MoreHorizontal } from "lucide-react"

export interface CardMenuItem {
  key: string
  label: string
  icon?: ReactNode
  disabled?: boolean
  onSelect: () => void
}

interface Props {
  label: string
  items: readonly CardMenuItem[]
}

/**
 * Small menu button (WAI-ARIA menu pattern): opens with click / Enter / ↓,
 * ↑/↓/Home/End move between items, Esc or Tab closes (focus returns to the
 * button), a click outside closes.
 */
export function CardMenu({ label, items }: Props) {
  const [open, setOpen] = useState(false)
  const menuId = useId()
  const buttonRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    menuRef.current?.querySelector<HTMLElement>("[role=menuitem]:not([disabled])")?.focus()
    function onDown(e: MouseEvent) {
      const target = e.target as Node
      if (!menuRef.current?.contains(target) && !buttonRef.current?.contains(target)) setOpen(false)
    }
    document.addEventListener("mousedown", onDown)
    return () => document.removeEventListener("mousedown", onDown)
  }, [open])

  function close(restoreFocus: boolean) {
    setOpen(false)
    if (restoreFocus) buttonRef.current?.focus()
  }

  function onMenuKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const enabled = Array.from(menuRef.current?.querySelectorAll<HTMLElement>("[role=menuitem]:not([disabled])") ?? [])
    const index = enabled.indexOf(document.activeElement as HTMLElement)
    const go = (i: number) => enabled[(i + enabled.length) % enabled.length]?.focus()
    if (e.key === "Escape") {
      e.preventDefault()
      e.stopPropagation()
      close(true)
    } else if (e.key === "ArrowDown") {
      e.preventDefault()
      go(index + 1)
    } else if (e.key === "ArrowUp") {
      e.preventDefault()
      go(index - 1)
    } else if (e.key === "Home") {
      e.preventDefault()
      go(0)
    } else if (e.key === "End") {
      e.preventDefault()
      go(enabled.length - 1)
    } else if (e.key === "Tab") {
      close(false)
    }
  }

  return (
    <div className="relative">
      <IconButton
        ref={buttonRef}
        label={label}
        size="sm"
        icon={<MoreHorizontal className="h-4 w-4" />}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown" && !open) {
            e.preventDefault()
            setOpen(true)
          }
        }}
      />
      {open && (
        <div
          ref={menuRef}
          id={menuId}
          role="menu"
          aria-label={label}
          onKeyDown={onMenuKeyDown}
          className="absolute right-0 top-full z-30 mt-1 min-w-40 rounded-ui-md border border-border bg-surface py-1 shadow-ui-md"
        >
          {items.map((item) => (
            <button
              key={item.key}
              type="button"
              role="menuitem"
              tabIndex={-1}
              disabled={item.disabled}
              onClick={() => {
                close(true)
                item.onSelect()
              }}
              className="flex min-h-9 w-full items-center gap-2 px-3 text-left text-body text-fg hover:bg-surface-muted focus-visible:bg-surface-muted disabled:cursor-not-allowed disabled:text-fg-subtle"
            >
              {item.icon}
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
