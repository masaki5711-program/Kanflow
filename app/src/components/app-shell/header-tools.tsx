"use client"

import { useCallback, useState } from "react"
import { usePathname, useRouter } from "next/navigation"
import { Search } from "lucide-react"
import { useLanguage } from "@/lib/language-context"
import { useShortcuts } from "@/hooks/use-shortcuts"
import { NotificationBell } from "@/components/notifications/notification-bell"
import { SearchPalette } from "@/components/search/search-palette"
import { projectIdFromPath } from "@/components/search/palette-commands"
import { ShortcutsHelp } from "@/components/shortcuts/shortcuts-help"

type Overlay = "search" | "help" | null

/**
 * Icon-only round button below `xl` (so the bar fits a phone and a crowded
 * admin header); the "Search" label appears from `xl`, the Ctrl K hint from `2xl`.
 */
export const SEARCH_BUTTON_CLASS =
  "inline-flex h-9 min-w-9 shrink-0 items-center justify-center gap-2 rounded-full border border-border px-2 text-body text-fg-muted transition-colors hover:bg-surface-muted hover:text-fg xl:px-3"

/**
 * Signed-in header tools: search button (+ palette), notification bell, and
 * the global keyboard shortcuts (`?`, `/`, Ctrl+K / ⌘K, `g` sequences).
 * The current project comes from the URL, so it works on every page.
 */
export function HeaderTools() {
  const { t } = useLanguage()
  const router = useRouter()
  const pathname = usePathname()
  const projectId = projectIdFromPath(pathname)
  const [overlay, setOverlay] = useState<Overlay>(null)
  const close = useCallback(() => setOverlay(null), [])

  useShortcuts({
    projectId,
    onOpenSearch: () => setOverlay("search"),
    onOpenHelp: () => setOverlay("help"),
    onNavigate: (href) => router.push(href),
  })

  return (
    <>
      <button
        type="button"
        onClick={() => setOverlay("search")}
        title={t.searchButtonHint}
        aria-label={t.searchButton}
        aria-keyshortcuts="Control+K Meta+K /"
        className={SEARCH_BUTTON_CLASS}
      >
        <Search aria-hidden className="h-4 w-4" />
        <span aria-hidden="true" className="hidden xl:inline">
          {t.searchButton}
        </span>
        <kbd aria-hidden="true" className="hidden rounded-ui-sm bg-surface-sunken px-1.5 font-mono text-caption text-fg-muted 2xl:inline">
          Ctrl K
        </kbd>
      </button>
      <NotificationBell />
      <SearchPalette open={overlay === "search"} onClose={close} projectId={projectId} />
      <ShortcutsHelp open={overlay === "help"} onClose={close} />
    </>
  )
}
