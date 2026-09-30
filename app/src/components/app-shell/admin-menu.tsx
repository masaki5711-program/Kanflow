"use client"

import { useEffect, useId, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { Activity, Building2, ChevronDown, KeyRound, Languages, ListChecks, ShieldCheck, Tags, Trash2, Users } from "lucide-react"
import { useLanguage } from "@/lib/language-context"
import { cn } from "@/components/ui"

interface AdminLink {
  href: string
  label: string
  Icon: typeof Users
}

/**
 * "管理" dropdown in the header (admin only). WAI-ARIA menu button:
 * Enter/Space/ArrowDown open and focus the first item, ArrowUp opens on the
 * last one, arrows/Home/End move, Esc closes and returns focus to the button,
 * Tab or an outside click closes.
 */
export function AdminMenu() {
  const { t } = useLanguage()
  const pathname = usePathname()
  const [open, setOpen] = useState(false)
  const [focusIndex, setFocusIndex] = useState(0)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLUListElement>(null)
  const menuId = useId()

  const links: AdminLink[] = [
    { href: "/admin/users", label: t.userManagementTitle, Icon: Users },
    { href: "/admin/sections", label: t.sectionAdminTitle, Icon: Building2 },
    { href: "/admin/categories", label: t.navCategoryAdmin, Icon: Tags },
    { href: "/admin/glossary", label: t.glossaryAdminMenu, Icon: Languages },
    { href: "/admin/translations", label: t.translationsAdminMenu, Icon: ListChecks },
    { href: "/admin/trash", label: t.trashAdminMenu, Icon: Trash2 },
    { href: "/admin/api-tokens", label: t.apiTokenAdminMenu, Icon: KeyRound },
    { href: "/admin/metrics", label: t.metricsAdminMenu, Icon: Activity },
  ]
  const isAdminPage = pathname.startsWith("/admin")

  // Move DOM focus to the requested item whenever the menu is open.
  useEffect(() => {
    if (!open) return
    const items = menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]')
    items?.[focusIndex]?.focus()
  }, [open, focusIndex])

  // Outside click closes.
  useEffect(() => {
    if (!open) return
    function onPointerDown(e: PointerEvent) {
      const target = e.target as Node
      if (menuRef.current?.contains(target) || buttonRef.current?.contains(target)) return
      setOpen(false)
    }
    document.addEventListener("pointerdown", onPointerDown)
    return () => document.removeEventListener("pointerdown", onPointerDown)
  }, [open])

  function openAt(index: number) {
    setFocusIndex(index)
    setOpen(true)
  }

  function closeAndFocusButton() {
    setOpen(false)
    buttonRef.current?.focus()
  }

  function onButtonKeyDown(e: ReactKeyboardEvent<HTMLButtonElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault()
      openAt(0)
    } else if (e.key === "ArrowUp") {
      e.preventDefault()
      openAt(links.length - 1)
    }
  }

  function onMenuKeyDown(e: ReactKeyboardEvent<HTMLUListElement>) {
    const last = links.length - 1
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault()
        setFocusIndex((i) => (i >= last ? 0 : i + 1))
        break
      case "ArrowUp":
        e.preventDefault()
        setFocusIndex((i) => (i <= 0 ? last : i - 1))
        break
      case "Home":
        e.preventDefault()
        setFocusIndex(0)
        break
      case "End":
        e.preventDefault()
        setFocusIndex(last)
        break
      case "Escape":
        e.preventDefault()
        e.stopPropagation()
        closeAndFocusButton()
        break
      case "Tab":
        setOpen(false)
        break
    }
  }

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => (open ? setOpen(false) : openAt(0))}
        onKeyDown={onButtonKeyDown}
        className={cn(
          "inline-flex min-h-9 items-center gap-1.5 rounded-full px-3 py-1.5 text-body font-medium transition-colors",
          isAdminPage || open ? "bg-primary-soft text-primary-active" : "text-fg-muted hover:bg-surface-muted hover:text-fg",
        )}
      >
        <ShieldCheck aria-hidden className="h-4 w-4" />
        <span className="hidden md:inline">{t.navAdminMenu}</span>
        <span className="sr-only md:hidden">{t.navAdminMenu}</span>
        <ChevronDown aria-hidden className={cn("h-4 w-4 transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <ul
          ref={menuRef}
          id={menuId}
          role="menu"
          aria-label={t.navAdminMenu}
          onKeyDown={onMenuKeyDown}
          className="absolute right-0 z-50 mt-2 w-60 rounded-ui-md border border-border bg-surface py-1.5 shadow-ui-lg"
        >
          {links.map(({ href, label, Icon }, index) => {
            const active = pathname === href || pathname.startsWith(`${href}/`)
            return (
              <li key={href} role="none">
                <Link
                  href={href}
                  role="menuitem"
                  tabIndex={index === focusIndex ? 0 : -1}
                  aria-current={active ? "page" : undefined}
                  onClick={() => setOpen(false)}
                  onFocus={() => setFocusIndex(index)}
                  className={cn(
                    "flex min-h-10 items-center gap-2.5 px-3 py-2 text-body",
                    active ? "bg-primary-soft font-medium text-primary-active" : "text-fg hover:bg-surface-muted focus:bg-surface-muted",
                  )}
                >
                  <Icon aria-hidden className="h-4 w-4 shrink-0 text-fg-muted" />
                  {label}
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
