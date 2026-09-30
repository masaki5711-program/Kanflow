"use client"

import { useCallback, useEffect, useId, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { Bell } from "lucide-react"
import { useLanguage } from "@/lib/language-context"
import { fillTemplate } from "@/lib/fill-template"
import { cn } from "@/components/ui"
import { isModalOpen } from "@/hooks/use-shortcuts"
import { badgeText } from "./notification-format"
import { NotificationPanel } from "./notification-panel"
import { useUnreadCount } from "./use-unread-count"

/**
 * Header bell: unread badge (polled while the tab is visible) and a
 * non-modal dropdown panel. Esc or a click outside closes it and returns
 * focus to the bell.
 */
export function NotificationBell() {
  const { t } = useLanguage()
  const router = useRouter()
  const { count, setCount, refresh } = useUnreadCount()
  const [open, setOpen] = useState(false)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const uid = useId().replace(/:/g, "")
  const panelId = `${uid}-panel`
  const headingId = `${uid}-heading`

  const close = useCallback((restoreFocus: boolean) => {
    setOpen(false)
    if (restoreFocus) buttonRef.current?.focus()
  }, [])

  useEffect(() => {
    if (!open) return
    panelRef.current?.focus()
    function onPointerDown(e: PointerEvent) {
      const target = e.target as Node
      if (panelRef.current?.contains(target) || buttonRef.current?.contains(target)) return
      close(false)
    }
    function onKeyDown(e: KeyboardEvent) {
      // A modal on top (e.g. the search palette) owns Escape.
      if (e.key !== "Escape" || e.defaultPrevented || isModalOpen()) return
      e.preventDefault()
      close(true)
    }
    document.addEventListener("pointerdown", onPointerDown)
    document.addEventListener("keydown", onKeyDown)
    return () => {
      document.removeEventListener("pointerdown", onPointerDown)
      document.removeEventListener("keydown", onKeyDown)
    }
  }, [open, close])

  const onNavigate = useCallback(
    (href: string | null) => {
      close(false)
      if (href) router.push(href)
    },
    [close, router],
  )

  const label = count > 0 ? fillTemplate(t.notifBellUnread, { count }) : t.notifBell

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        type="button"
        aria-label={label}
        title={label}
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        aria-haspopup="dialog"
        onClick={() => {
          if (open) return close(false)
          setOpen(true)
          refresh()
        }}
        className="relative inline-flex h-9 w-9 items-center justify-center rounded-full text-fg-muted transition-colors hover:bg-surface-muted hover:text-fg"
      >
        <Bell aria-hidden className="h-5 w-5" />
        {count > 0 && (
          <span
            aria-hidden="true"
            data-testid="notification-badge"
            className="absolute -right-0.5 -top-0.5 min-w-[1.125rem] rounded-full bg-danger px-1 text-center text-caption font-semibold leading-[1.125rem] text-white ring-2 ring-surface"
          >
            {badgeText(count)}
          </span>
        )}
      </button>
      {open && (
        <div
          ref={panelRef}
          id={panelId}
          role="dialog"
          aria-labelledby={headingId}
          tabIndex={-1}
          className={cn(
            "fixed inset-x-2 top-14 z-50 overflow-hidden rounded-ui-lg border border-border bg-surface shadow-ui-overlay outline-none",
            "sm:absolute sm:inset-x-auto sm:right-0 sm:top-full sm:mt-2 sm:w-96",
          )}
        >
          <NotificationPanel headingId={headingId} onUnreadCount={setCount} onNavigate={onNavigate} />
        </div>
      )}
    </div>
  )
}
