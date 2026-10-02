"use client"

import { useCallback, useEffect, useId, useRef, useState } from "react"
import { usePathname } from "next/navigation"
import { X } from "lucide-react"
import { useLanguage } from "@/lib/language-context"
import { projectTypeOptions, type ProjectType } from "@/lib/project-type-labels"
import type { Language } from "@/lib/i18n"
import { useI18nText, type EntityI18n } from "@/components/i18n-text"
import { IconButton, Truncate, cn } from "@/components/ui"
import { useBodyScrollLock, useFocusTrap, useMediaQuery } from "@/hooks"
import { useSidebarDrawer } from "@/components/app-shell/sidebar-drawer"
import { buildSidebarGroups, buildSidebarHome, buildSidebarTalk } from "@/components/app-shell/sidebar-nav"
import { useTeamChatSummary } from "@/components/updates/use-team-chat-summary"
import { useProjectUpdateSummary } from "@/components/updates/use-project-updates"
import { SidebarSections } from "@/components/app-shell/sidebar-group"

interface SidebarProps {
  projectId: string
  projectName?: string
  /** Both-language text of the project (name). */
  projectI18n?: EntityI18n
  /** Show the project trash entry (users with the "trash.manage" permission). */
  showTrash?: boolean
  /** Show team settings (hidden for non-member section managers). Default true. */
  showSettings?: boolean
  /** Show AI chat (users with "ai.use"). Default true. */
  showChat?: boolean
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

export function Sidebar(props: SidebarProps) {
  const drawer = useSidebarDrawer()
  const isDesktop = useMediaQuery("(min-width: 1024px)")
  const drawerOpen = !!drawer?.isOpen && !isDesktop

  return (
    <>
      <aside className="hidden lg:flex lg:sticky lg:top-14 lg:self-start lg:h-[calc(100vh-3.5rem)] w-60 shrink-0 flex-col border-r border-border bg-surface/80 backdrop-blur-sm">
        <SidebarContent {...props} />
      </aside>
      {drawerOpen && drawer && (
        <SidebarDrawer onClose={drawer.close} drawerId={drawer.drawerId}>
          <SidebarContent {...props} />
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

function SidebarContent({ projectId, projectName, projectI18n, showTrash = false, showSettings = true, showChat = true }: SidebarProps) {
  const pathname = usePathname()
  const { t, pt, projectType, language } = useLanguage()
  const shownName = useI18nText(projectI18n, "name", projectName).text
  const groups = buildSidebarGroups(projectId, t, pt, { showTrash, showSettings, showChat })
  const summary = useProjectUpdateSummary(projectId, pathname)
  const newCount = summary ? summary.unread + summary.newActivity : 0
  const home = { ...buildSidebarHome(projectId, t), badge: { count: newCount, label: t.updatesSidebarBadge.replace("{n}", String(newCount)) } }
  const chat = useTeamChatSummary(projectId, pathname)
  const talk = {
    ...buildSidebarTalk(projectId, t),
    badge: chat && chat.forYou > 0
      ? { count: chat.forYou, label: t.talkSidebarForYou.replace("{n}", String(chat.forYou)), tone: "alert" as const }
      : { count: chat?.unread ?? 0, label: t.talkSidebarBadge.replace("{n}", String(chat?.unread ?? 0)) },
  }
  // The content renders twice (desktop aside + mobile drawer) -> unique ids per instance.
  const idPrefix = useId().replace(/:/g, "")

  return (
    <>
      <nav aria-label={t.navProjectMenu} className="flex-1 overflow-y-auto px-2 pb-3 pt-2">
        <SidebarSections groups={groups} pinned={[home, talk]} pathname={pathname} idPrefix={idPrefix} />
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
