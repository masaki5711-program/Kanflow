"use client"

import { useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode, type RefObject } from "react"
import { createPortal } from "react-dom"
import { IconButton } from "@/components/ui"
import { MoreHorizontal } from "lucide-react"
import { placeMenu, type MenuPlacement } from "@/lib/menu-placement"

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
  /**
   * Render the menu in <body> with fixed positioning (flips above the button
   * when the space below is short). For menus inside scroll boxes that would
   * clip it. Default false: the menu is positioned inside the button's wrapper.
   */
  portal?: boolean
}

/** Fixed-position style of a portaled menu, re-measured on resize / scroll while open. */
function usePortalPlacement(open: boolean, enabled: boolean, buttonRef: RefObject<HTMLElement | null>, menuRef: RefObject<HTMLElement | null>): CSSProperties | undefined {
  const [placement, setPlacement] = useState<MenuPlacement | null>(null)
  useLayoutEffect(() => {
    if (!open || !enabled) return
    const measure = () => {
      const button = buttonRef.current
      const menu = menuRef.current
      if (!button || !menu) return
      const r = button.getBoundingClientRect()
      const size = { width: menu.offsetWidth, height: menu.scrollHeight }
      setPlacement(placeMenu({ top: r.top, bottom: r.bottom, left: r.left, right: r.right }, size, { width: window.innerWidth, height: window.innerHeight }))
    }
    measure()
    window.addEventListener("resize", measure)
    window.addEventListener("scroll", measure, true)
    return () => {
      window.removeEventListener("resize", measure)
      window.removeEventListener("scroll", measure, true)
      setPlacement(null)
    }
  }, [open, enabled, buttonRef, menuRef])
  if (!enabled) return undefined
  // Before the first measure: in the DOM (focusable, measurable) but not visible.
  if (!placement) return { position: "fixed", top: 0, left: 0, opacity: 0 }
  return { position: "fixed", top: placement.top, left: placement.left, maxHeight: placement.maxHeight }
}

/**
 * Small menu button (WAI-ARIA menu pattern): opens with click / Enter / ↓,
 * ↑/↓/Home/End move between items, Esc or Tab closes (focus returns to the
 * button), a click outside closes.
 */
export function CardMenu({ label, items, portal = false }: Props) {
  const [open, setOpen] = useState(false)
  const menuId = useId()
  const buttonRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const portalStyle = usePortalPlacement(open, portal, buttonRef, menuRef)

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
      // A portaled menu sits at the end of <body>: return focus to the button instead of leaving the page.
      if (portal) e.preventDefault()
      close(portal)
    }
  }

  const menu = open ? (
    <div
      ref={menuRef}
      id={menuId}
      role="menu"
      aria-label={label}
      onKeyDown={onMenuKeyDown}
      style={portalStyle}
      className={portal
        ? "z-50 min-w-40 overflow-y-auto rounded-ui-md border border-border bg-surface py-1 shadow-ui-md"
        : "absolute right-0 top-full z-30 mt-1 min-w-40 rounded-ui-md border border-border bg-surface py-1 shadow-ui-md"}
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
  ) : null

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
      {menu && (portal ? createPortal(menu, document.body) : menu)}
    </div>
  )
}
