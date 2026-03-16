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

function NavIcon({ type, active }: { type: string; active: boolean }) {
  const color = active ? "text-blue-600" : "text-gray-400 group-hover:text-gray-600"
  const cls = `w-5 h-5 ${color} transition-colors shrink-0`

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

export function Sidebar({ projectId }: SidebarProps) {
  const pathname = usePathname()
  const { t, pt } = useLanguage()

  return (
    <aside className="w-56 bg-white border-r border-gray-200/80 min-h-[calc(100vh-49px)] py-4 px-3">
      <nav className="space-y-0.5">
        {/* Dashboard - uses i18n t */}
        {(() => {
          const href = `/projects/${projectId}`
          const isActive = pathname === href
          return (
            <Link
              href={href}
              className={`group flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
                isActive
                  ? "bg-blue-50 text-blue-700 shadow-sm"
                  : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
              }`}
            >
              <NavIcon type="dashboard" active={isActive} />
              {t.navDashboard}
            </Link>
          )
        })()}

        {/* Type-aware nav items */}
        {navItems.map((item) => {
          const href = `/projects/${projectId}${item.href}`
          const isActive = pathname.startsWith(href)
          return (
            <Link
              key={item.href}
              href={href}
              className={`group flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
                isActive
                  ? "bg-blue-50 text-blue-700 shadow-sm"
                  : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
              }`}
            >
              <NavIcon type={item.icon} active={isActive} />
              {pt[item.labelKey]}
            </Link>
          )
        })}

        {/* Settings - uses i18n t */}
        {(() => {
          const href = `/projects/${projectId}/settings`
          const isActive = pathname.startsWith(href)
          return (
            <Link
              href={href}
              className={`group flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
                isActive
                  ? "bg-blue-50 text-blue-700 shadow-sm"
                  : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
              }`}
            >
              <NavIcon type="settings" active={isActive} />
              {t.navSettings}
            </Link>
          )
        })()}
      </nav>
    </aside>
  )
}
