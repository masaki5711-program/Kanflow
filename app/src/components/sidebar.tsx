"use client"

import { useCallback, useEffect, useId, useRef, useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { X } from "lucide-react"
import { useLanguage } from "@/lib/language-context"
import { projectTypeOptions, type ProjectType } from "@/lib/project-type-labels"
import type { Language } from "@/lib/i18n"
import { useI18nText, type EntityI18n } from "@/components/i18n-text"
import { IconButton, Truncate, cn } from "@/components/ui"
import { useBodyScrollLock, useFocusTrap, useMediaQuery } from "@/hooks"
import { useSidebarDrawer } from "@/components/app-shell/sidebar-drawer"
import { buildSidebarGroups, isNavItemActive, type SidebarNavItem } from "@/components/app-shell/sidebar-nav"

interface SidebarProps {
  projectId: string
  projectName?: string
  /** Both-language text of the project (name). */
  projectI18n?: EntityI18n
}

const projectTypeBadgeColors: Record<ProjectType, string> = {
  software: "bg-primary-soft text-primary-active",
  process_improvement: "bg-warning-soft text-warning-strong",
  general: "bg-surface-sunken text-fg-muted",
}

function projectTypeLabel(type: ProjectType, language: Language): string {
  const opt = projectTypeOptions.find((o) => o.value === type)
  if (!opt) return type
  return language === "ja" ? opt.labelJa : language === "id" ? opt.labelId : opt.labelEn
}

export function Sidebar({ projectId, projectName, projectI18n }: SidebarProps) {
  const drawer = useSidebarDrawer()
  const isDesktop = useMediaQuery("(min-width: 1024px)")
  const drawerOpen = !!drawer?.isOpen && !isDesktop

  return (
    <>
      <aside className="hidden lg:flex lg:sticky lg:top-14 lg:self-start lg:h-[calc(100vh-3.5rem)] w-60 shrink-0 flex-col border-r border-border bg-surface/80 backdrop-blur-sm">
        <SidebarContent projectId={projectId} projectName={projectName} projectI18n={projectI18n} />
      </aside>
      {drawerOpen && drawer && (
        <SidebarDrawer onClose={drawer.close} drawerId={drawer.drawerId}>
          <SidebarContent projectId={projectId} projectName={projectName} projectI18n={projectI18n} />
        </SidebarDrawer>
      )}
    </>
  )
}

/** Duration of the drawer's slide-out (matches .animate-drawer-out in globals.css). */
const DRAWER_EXIT_MS = 150

function SidebarDrawer({ onClose, drawerId, children }: { onClose: () => void; drawerId: string; children: React.ReactNode }) {
  const { t } = useLanguage()
  const panelRef = useRef<HTMLDivElement>(null)
  const reduceMotion = useMediaQuery("(prefers-reduced-motion: reduce)")
  const [closing, setClosing] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Slide out, then unmount. With reduced motion the drawer closes at once.
  const requestClose = useCallback(() => {
    if (reduceMotion) {
      onClose()
      return
    }
    if (timerRef.current) return
    setClosing(true)
    timerRef.current = setTimeout(onClose, DRAWER_EXIT_MS)
  }, [onClose, reduceMotion])

  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    },
    [],
  )

  useFocusTrap(panelRef, true, { onEscape: requestClose })
  useBodyScrollLock(true)

  return (
    <div className="lg:hidden fixed inset-0 z-50">
      <div
        className={cn("absolute inset-0 bg-black/40", closing ? "opacity-0 transition-opacity duration-150" : "animate-fade-in")}
        aria-hidden="true"
        onClick={requestClose}
      />
      <div
        ref={panelRef}
        id={drawerId}
        role="dialog"
        aria-modal="true"
        aria-label={t.navDrawerLabel}
        tabIndex={-1}
        className={cn(
          "absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col bg-surface shadow-ui-overlay",
          closing ? "animate-drawer-out" : "animate-drawer-in",
        )}
      >
        <div className="flex items-center justify-between border-b border-border px-4 py-2">
          <span aria-hidden="true" className="text-body font-semibold text-fg">{t.navProjectMenu}</span>
          <IconButton label={t.navCloseMenu} icon={<X className="h-5 w-5" />} onClick={requestClose} />
        </div>
        {children}
      </div>
    </div>
  )
}

function SidebarContent({ projectId, projectName, projectI18n }: SidebarProps) {
  const pathname = usePathname()
  const { t, pt, projectType, language } = useLanguage()
  const shownName = useI18nText(projectI18n, "name", projectName).text
  const groups = buildSidebarGroups(projectId, t, pt)
  // The content renders twice (desktop aside + mobile drawer) -> unique ids per instance.
  const idPrefix = useId().replace(/:/g, "")

  return (
    <>
      <nav aria-label={t.navProjectMenu} className="flex-1 overflow-y-auto px-2 py-3">
        {groups.map((group) => {
          const labelId = `${idPrefix}-group-${group.id}`
          return (
            <div key={group.id} className={group.label ? "mt-3 first:mt-0" : undefined}>
              {/* Not a heading: the page's own h1 must be the first heading on the page. */}
              {group.label && (
                <p id={labelId} className="px-3 pb-0.5 text-caption font-semibold text-fg-subtle">
                  {group.label}
                </p>
              )}
              <ul className="space-y-px" aria-labelledby={group.label ? labelId : undefined}>
                {group.items.map((item) => (
                  <li key={item.href}>
                    <SidebarLink item={item} active={isNavItemActive(pathname, item)} idPrefix={idPrefix} />
                  </li>
                ))}
              </ul>
            </div>
          )
        })}
      </nav>

      <div className="border-t border-border px-6 py-4">
        {shownName && (
          <Truncate text={shownName} lines={2} className="text-caption font-medium text-fg" />
        )}
        <span
          className={cn(
            "mt-1.5 inline-block rounded-full px-2 py-0.5 text-caption font-medium",
            projectTypeBadgeColors[projectType] ?? projectTypeBadgeColors.general,
          )}
          title={t.navProjectType}
        >
          {projectTypeLabel(projectType, language)}
        </span>
      </div>
    </>
  )
}

/**
 * Single-line nav item. The accessible name is the label only; the one-line
 * description is a hover tooltip (inactive items) or shown under the active
 * item and referenced via aria-describedby - never both, so it is read once.
 */
function SidebarLink({ item, active, idPrefix }: { item: SidebarNavItem; active: boolean; idPrefix: string }) {
  const { Icon } = item
  const descId = `${idPrefix}-desc-${item.href.replace(/[^a-z0-9]/gi, "-")}`
  return (
    <>
      <Link
        href={item.href}
        aria-current={active ? "page" : undefined}
        aria-describedby={active ? descId : undefined}
        title={active ? undefined : item.description}
        className={cn(
          "group relative flex min-h-9 items-center gap-2.5 rounded-ui-sm px-3 py-1.5 text-body font-medium transition-colors",
          active ? "bg-primary-soft text-primary-strong" : "text-fg-muted hover:bg-surface-sunken hover:text-fg",
        )}
      >
        {active && (
          <span aria-hidden="true" className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-primary" />
        )}
        <Icon
          aria-hidden
          className={cn("h-[18px] w-[18px] shrink-0", active ? "text-primary-strong" : "text-fg-subtle group-hover:text-fg-muted")}
        />
        <span className="min-w-0 truncate">{item.label}</span>
      </Link>
      {active && (
        <p id={descId} className="pb-1 pl-[2.625rem] pr-3 pt-0.5 text-caption text-fg-muted">
          {item.description}
        </p>
      )}
    </>
  )
}
