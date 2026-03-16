"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useLanguage } from "@/lib/language-context"
import type { ProjectTypeLabels } from "@/lib/project-type-labels"

interface SidebarProps {
  projectId: string
}

const navItems: { labelKey: keyof ProjectTypeLabels; href: string; icon: string }[] = [
  { labelKey: "navIcebox", href: "/icebox", icon: "icebox" },
  { labelKey: "navBacklog", href: "/backlog", icon: "backlog" },
  { labelKey: "navSprints", href: "/sprints", icon: "sprint" },
  { labelKey: "navReleases", href: "/releases", icon: "release" },
]

// i18n key nav items (not project-type dependent)
type I18nNavItem = { labelKey: "ganttTitle" | "calendarTitle"; href: string; icon: string }
const i18nNavItems: I18nNavItem[] = [
  { labelKey: "ganttTitle", href: "/gantt", icon: "gantt" },
  { labelKey: "calendarTitle", href: "/calendar", icon: "calendar" },
]

function NavIcon({ type, active }: { type: string; active: boolean }) {
  const color = active ? "text-blue-600" : "text-gray-400 group-hover:text-gray-600"
  const cls = `w-5 h-5 ${color} transition-colors duration-200 shrink-0`

  switch (type) {
    case "dashboard":
      return (
        <svg className={cls} viewBox="0 0 20 20" fill="currentColor">
          <path d="M10.707 2.293a1 1 0 00-1.414 0l-7 7a1 1 0 001.414 1.414L4 10.414V17a1 1 0 001 1h2a1 1 0 001-1v-2a1 1 0 011-1h2a1 1 0 011 1v2a1 1 0 001 1h2a1 1 0 001-1v-6.586l.293.293a1 1 0 001.414-1.414l-7-7z"/>
        </svg>
      )
    case "icebox":
      return (
        <svg className={cls} viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M5 2a2 2 0 00-2 2v14l3.5-2 3.5 2 3.5-2 3.5 2V4a2 2 0 00-2-2H5zm4.707 3.707a1 1 0 00-1.414-1.414l-3 3a1 1 0 000 1.414l3 3a1 1 0 001.414-1.414L8.414 9H10a3 3 0 013 3v1a1 1 0 102 0v-1a5 5 0 00-5-5H8.414l1.293-1.293z" clipRule="evenodd"/>
        </svg>
      )
    case "backlog":
      return (
        <svg className={cls} viewBox="0 0 20 20" fill="currentColor">
          <path d="M9 2a1 1 0 000 2h2a1 1 0 100-2H9z"/>
          <path fillRule="evenodd" d="M4 5a2 2 0 012-2 3 3 0 003 3h2a3 3 0 003-3 2 2 0 012 2v11a2 2 0 01-2 2H6a2 2 0 01-2-2V5zm3 4a1 1 0 000 2h.01a1 1 0 100-2H7zm3 0a1 1 0 000 2h3a1 1 0 100-2h-3zm-3 4a1 1 0 100 2h.01a1 1 0 100-2H7zm3 0a1 1 0 100 2h3a1 1 0 100-2h-3z" clipRule="evenodd"/>
        </svg>
      )
    case "sprint":
      return (
        <svg className={cls} viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M11.3 1.046A1 1 0 0112 2v5h4a1 1 0 01.82 1.573l-7 10A1 1 0 018 18v-5H4a1 1 0 01-.82-1.573l7-10a1 1 0 011.12-.38z" clipRule="evenodd"/>
        </svg>
      )
    case "release":
      return (
        <svg className={cls} viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-8.707l-3-3a1 1 0 00-1.414 0l-3 3a1 1 0 001.414 1.414L9 9.414V13a1 1 0 102 0V9.414l1.293 1.293a1 1 0 001.414-1.414z" clipRule="evenodd"/>
        </svg>
      )
    case "gantt":
      return (
        <svg className={cls} viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M3 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h8a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h10a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h6a1 1 0 110 2H4a1 1 0 01-1-1z" clipRule="evenodd"/>
        </svg>
      )
    case "calendar":
      return (
        <svg className={cls} viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M6 2a1 1 0 00-1 1v1H4a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2h-1V3a1 1 0 10-2 0v1H7V3a1 1 0 00-1-1zm0 5a1 1 0 000 2h8a1 1 0 100-2H6z" clipRule="evenodd"/>
        </svg>
      )
    case "settings":
      return (
        <svg className={cls} viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.533 1.533 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.533 1.533 0 01.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z" clipRule="evenodd"/>
        </svg>
      )
    default:
      return null
  }
}

const projectTypeBadgeColors: Record<string, string> = {
  software: "bg-blue-50 text-blue-600",
  marketing: "bg-emerald-50 text-emerald-600",
  design: "bg-violet-50 text-violet-600",
  business: "bg-amber-50 text-amber-600",
}

export function Sidebar({ projectId }: SidebarProps) {
  const pathname = usePathname()
  const { t, pt, projectType } = useLanguage()

  const badgeColor = projectTypeBadgeColors[projectType] ?? "bg-gray-50 text-gray-600"

  function navLink(href: string, icon: string, label: string) {
    const isActive = href === `/projects/${projectId}` ? pathname === href : pathname.startsWith(href)
    return (
      <Link
        key={href}
        href={href}
        className={`group relative flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
          isActive
            ? "bg-blue-50/80 text-blue-700"
            : "text-gray-600 hover:bg-gray-50/80 hover:text-gray-900 hover:translate-x-0.5"
        }`}
      >
        {isActive && (
          <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 bg-blue-600 rounded-r-full" />
        )}
        <NavIcon type={icon} active={isActive} />
        {label}
      </Link>
    )
  }

  return (
    <aside className="w-56 bg-white/80 backdrop-blur-sm border-r border-gray-200/60 min-h-[calc(100vh-49px)] py-4 px-3 flex flex-col justify-between">
      <nav className="space-y-0.5">
        {/* MAIN section */}
        <div className="px-3 pt-1 pb-2">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">
            Main
          </span>
        </div>
        {navLink(`/projects/${projectId}`, "dashboard", t.navDashboard)}

        {navItems.map((item) =>
          navLink(`/projects/${projectId}${item.href}`, item.icon, pt[item.labelKey])
        )}

        {/* TOOLS section */}
        <div className="px-3 pt-4 pb-2">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">
            Tools
          </span>
        </div>

        {i18nNavItems.map((item) =>
          navLink(`/projects/${projectId}${item.href}`, item.icon, t[item.labelKey])
        )}

        {/* SETTINGS section */}
        <div className="px-3 pt-4 pb-2">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">
            Settings
          </span>
        </div>

        {navLink(`/projects/${projectId}/settings`, "settings", t.navSettings)}
      </nav>

      {/* Bottom section: project info */}
      <div className="mt-4 pt-4 border-t border-gray-100 px-3">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-blue-500 shrink-0" />
          <span className="text-xs font-medium text-gray-700 truncate">{t.navDashboard}</span>
        </div>
        <span className={`mt-1.5 inline-block text-[10px] font-medium px-2 py-0.5 rounded-full ${badgeColor}`}>
          {projectType}
        </span>
      </div>
    </aside>
  )
}
