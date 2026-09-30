"use client"

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react"
import { usePathname } from "next/navigation"

interface SidebarDrawerValue {
  /** Drawer is open (only meaningful below the `lg` breakpoint). */
  isOpen: boolean
  open: () => void
  close: () => void
  /** id of the drawer element, for `aria-controls` on the toggle button. */
  drawerId: string
}

const SidebarDrawerContext = createContext<SidebarDrawerValue | null>(null)

export const SIDEBAR_DRAWER_ID = "project-sidebar-drawer"

/**
 * Open state of the off-canvas project sidebar (below `lg`). The drawer
 * remembers the path it was opened on, so any navigation closes it without
 * an effect.
 */
export function SidebarDrawerProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  const [openedAt, setOpenedAt] = useState<string | null>(null)
  const isOpen = openedAt !== null && openedAt === pathname

  const open = useCallback(() => setOpenedAt(pathname), [pathname])
  const close = useCallback(() => setOpenedAt(null), [])

  const value = useMemo(
    () => ({ isOpen, open, close, drawerId: SIDEBAR_DRAWER_ID }),
    [isOpen, open, close],
  )
  return <SidebarDrawerContext.Provider value={value}>{children}</SidebarDrawerContext.Provider>
}

/** null outside a project layout (no sidebar → no hamburger). */
export function useSidebarDrawer(): SidebarDrawerValue | null {
  return useContext(SidebarDrawerContext)
}
