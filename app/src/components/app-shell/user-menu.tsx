"use client"

import { useCallback, useEffect, useId, useRef, useState, type FocusEvent, type ReactNode } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { signOut } from "next-auth/react"
import { Briefcase, FolderOpen, LayoutTemplate, LogOut, UserRound } from "lucide-react"
import { useLanguage } from "@/lib/language-context"
import { LanguageMenu } from "@/components/language-switcher"
import { cn } from "@/components/ui"
import { adminLinks } from "./admin-menu"
import { useAnchoredPopover } from "./anchored-popover"
import { HEADER_PRIMARY_IN_MENU, HEADER_SECONDARY_IN_MENU } from "./header-breakpoints"

/** Preferred panel width (px, = w-72). */
const PANEL_WIDTH = 288

interface UserMenuProps {
  userName: string | null | undefined
  isAdmin: boolean
  showPortfolio: boolean
}

const ITEM = "flex min-h-10 w-full items-center gap-2.5 px-3 py-2 text-left text-body"

function initialsOf(name: string | null | undefined): string {
  return name ? name.slice(0, 2).toUpperCase() : "?"
}

function MenuLink({ href, icon, children, onNavigate }: { href: string; icon: ReactNode; children: ReactNode; onNavigate: () => void }) {
  const pathname = usePathname()
  const active = pathname === href || (href !== "/" && pathname.startsWith(`${href}/`))
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      onClick={onNavigate}
      className={cn(ITEM, active ? "bg-primary-soft font-medium text-primary-active" : "text-fg hover:bg-surface-muted focus-visible:bg-surface-muted")}
    >
      {icon}
      {children}
    </Link>
  )
}

/**
 * Avatar button + dropdown (disclosure). Always holds the user's name and
 * logout; below `md` / `lg` it also lists the header items that no longer fit
 * the bar (see header-breakpoints.ts). Esc closes and returns focus to the
 * button; an outside click or tabbing away closes it.
 */
export function UserMenu({ userName, isAdmin, showPortfolio }: UserMenuProps) {
  const { t } = useLanguage()
  const [open, setOpen] = useState(false)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const wrapperRef = useRef<HTMLDivElement>(null)
  const panelId = useId()
  // fitHeight: on short screens (375x600, landscape) the panel scrolls instead of running off the bottom (N-02).
  const panelStyle = useAnchoredPopover(buttonRef, open, PANEL_WIDTH, { fitHeight: true })
  const close = useCallback(() => setOpen(false), [])

  useEffect(() => {
    if (!open) return
    function onPointerDown(e: PointerEvent) {
      if (wrapperRef.current?.contains(e.target as Node)) return
      setOpen(false)
    }
    document.addEventListener("pointerdown", onPointerDown)
    return () => document.removeEventListener("pointerdown", onPointerDown)
  }, [open])

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key !== "Escape" || !open) return
    e.preventDefault()
    e.stopPropagation()
    setOpen(false)
    buttonRef.current?.focus()
  }

  function onBlur(e: FocusEvent<HTMLDivElement>) {
    const next = e.relatedTarget as Node | null
    if (next && !wrapperRef.current?.contains(next)) setOpen(false)
  }

  const label = userName ? `${t.navUserMenu}: ${userName}` : t.navUserMenu

  return (
    <div ref={wrapperRef} className="relative shrink-0" onKeyDown={onKeyDown} onBlur={onBlur}>
      <button
        ref={buttonRef}
        type="button"
        aria-label={label}
        title={label}
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        onClick={() => setOpen((v) => !v)}
        className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-primary-soft text-caption font-semibold text-primary-active ring-2 ring-surface transition-shadow hover:ring-primary/40"
      >
        <span aria-hidden="true">{initialsOf(userName)}</span>
      </button>
      {open && (
        <div
          id={panelId}
          data-testid="user-menu-panel"
          style={panelStyle}
          className="fixed right-2 top-14 z-50 flex max-h-[calc(100dvh-4rem)] max-w-[calc(100vw-1rem)] flex-col overflow-hidden rounded-ui-md border border-border bg-surface py-1.5 shadow-ui-lg"
        >
          {userName && <p className="shrink-0 truncate border-b border-border px-3 pb-2 pt-1 text-body font-semibold text-fg">{userName}</p>}
          {/* Scrollable middle; the name above and logout below always stay visible. */}
          <div data-testid="user-menu-scroll" className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
            <ul className="py-1">
              <li className={HEADER_PRIMARY_IN_MENU}>
                <MenuLink href="/" icon={<FolderOpen aria-hidden className="h-4 w-4 shrink-0 text-fg-muted" />} onNavigate={close}>
                  {t.projectListTitle}
                </MenuLink>
              </li>
              <li className={HEADER_PRIMARY_IN_MENU}>
                <MenuLink href="/me" icon={<UserRound aria-hidden className="h-4 w-4 shrink-0 text-fg-muted" />} onNavigate={close}>
                  {t.myProfileMenu}
                </MenuLink>
              </li>
              <li>
                <MenuLink href="/templates" icon={<LayoutTemplate aria-hidden className="h-4 w-4 shrink-0 text-fg-muted" />} onNavigate={close}>
                  {t.tplNav}
                </MenuLink>
              </li>
              {showPortfolio && (
                <li className={HEADER_SECONDARY_IN_MENU}>
                  <MenuLink href="/portfolio" icon={<Briefcase aria-hidden className="h-4 w-4 shrink-0 text-fg-muted" />} onNavigate={close}>
                    {t.portfolioNav}
                  </MenuLink>
                </li>
              )}
            </ul>
            {isAdmin && (
              <div className={cn(HEADER_SECONDARY_IN_MENU, "border-t border-border py-1")}>
                <p id={`${panelId}-admin`} className="px-3 pb-1 pt-1.5 text-caption font-semibold text-fg-muted">
                  {t.navAdminMenu}
                </p>
                <ul aria-labelledby={`${panelId}-admin`}>
                  {adminLinks(t).map(({ href, label: linkLabel, Icon }) => (
                    <li key={href}>
                      <MenuLink href={href} icon={<Icon aria-hidden className="h-4 w-4 shrink-0 text-fg-muted" />} onNavigate={close}>
                        {linkLabel}
                      </MenuLink>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <div className={cn(HEADER_SECONDARY_IN_MENU, "border-t border-border px-1 py-1")}>
              <LanguageMenu className="w-full rounded-ui-sm" />
            </div>
          </div>
          <div data-testid="user-menu-footer" className="shrink-0 border-t border-border pt-1">
            <button
              type="button"
              onClick={() => signOut()}
              className={cn(ITEM, "text-danger-strong hover:bg-danger-soft focus-visible:bg-danger-soft")}
            >
              <LogOut aria-hidden className="h-4 w-4 shrink-0" />
              {t.logout}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
