"use client"

import { useRef, useState, type MouseEvent } from "react"
import { MENU_WIDTH, type MenuAnchor } from "./project-options-menu"

/** Anchor state of the per-project options menu (⋮ button or right-click). */
export function useOptionsMenu() {
  const [menu, setMenu] = useState<MenuAnchor | null>(null)
  const triggerRef = useRef<HTMLElement | null>(null)

  function openContextMenu(e: MouseEvent<HTMLElement>, projectId: string) {
    e.preventDefault()
    triggerRef.current = null
    setMenu({ x: Math.min(e.clientX, window.innerWidth - MENU_WIDTH - 8), y: e.clientY, projectId })
  }

  /** ⋮ button: anchor the menu below the button (toggles). */
  function openOptionsMenu(e: MouseEvent<HTMLButtonElement>, projectId: string) {
    e.stopPropagation()
    if (menu?.projectId === projectId) {
      setMenu(null)
      return
    }
    triggerRef.current = e.currentTarget
    const rect = e.currentTarget.getBoundingClientRect()
    setMenu({
      x: Math.max(8, Math.min(rect.right - MENU_WIDTH, window.innerWidth - MENU_WIDTH - 8)),
      y: rect.bottom + 4,
      projectId,
    })
  }

  function closeMenu(restoreFocus: boolean) {
    setMenu(null)
    if (restoreFocus) triggerRef.current?.focus()
  }

  return { menu, openContextMenu, openOptionsMenu, closeMenu }
}
