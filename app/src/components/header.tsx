"use client"

import { useSession, signOut } from "next-auth/react"
import Link from "next/link"
import Image from "next/image"
import { usePathname } from "next/navigation"
import { ChevronRight, FolderOpen, LogOut, Menu, UserRound } from "lucide-react"
import { useLanguage } from "@/lib/language-context"
import { useI18nText, type EntityI18n } from "@/components/i18n-text"
import { Truncate, cn } from "@/components/ui"
import { useSidebarDrawer } from "@/components/app-shell/sidebar-drawer"
import { AdminMenu } from "@/components/app-shell/admin-menu"
import { LanguageMenu } from "@/components/language-switcher"
import { HeaderTools } from "@/components/app-shell/header-tools"

interface HeaderProps {
  projectName?: string
  /** Both-language text of the project (name) for the breadcrumb. */
  projectI18n?: EntityI18n
  projectId?: string
}

const NAV_LINK =
  "inline-flex min-h-9 items-center gap-1.5 rounded-full px-3 py-1.5 text-body font-medium transition-colors"

export function Header({ projectName, projectI18n, projectId }: HeaderProps = {}) {
  const { data: session } = useSession()
  const { t } = useLanguage()
  const pathname = usePathname()
  const drawer = useSidebarDrawer()
  const shownProjectName = useI18nText(projectI18n, "name", projectName).text

  const initials = session?.user?.name ? session.user.name.slice(0, 2).toUpperCase() : "?"
  const isAdmin = session?.user?.role === "admin"

  function navLinkClass(active: boolean) {
    return cn(NAV_LINK, active ? "bg-primary-soft text-primary-active" : "text-fg-muted hover:bg-surface-muted hover:text-fg")
  }

  return (
    <header className="sticky top-0 z-40 flex h-14 items-center justify-between gap-2 border-b border-border bg-surface/90 px-4 shadow-ui-sm backdrop-blur-md sm:px-6">
      <div className="flex min-w-0 items-center gap-2">
        {drawer && (
          <button
            type="button"
            onClick={drawer.open}
            aria-label={t.navOpenMenu}
            title={t.navOpenMenu}
            aria-expanded={drawer.isOpen}
            aria-controls={drawer.drawerId}
            className="-ml-1 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-ui-sm text-fg-muted hover:bg-surface-muted hover:text-fg lg:hidden"
          >
            <Menu aria-hidden className="h-5 w-5" />
          </button>
        )}
        <Link href="/" className="group flex shrink-0 items-center gap-2.5">
          <Image src="/logo.svg" alt="" width={32} height={32} className="rounded-lg shadow-ui-sm" />
          <span className="hidden text-title font-semibold tracking-tight text-fg transition-colors group-hover:text-primary sm:inline">
            {t.appTitle}
          </span>
          <span className="sr-only sm:hidden">{t.appTitle}</span>
        </Link>
        {projectName && projectId && (
          <nav aria-label={t.navBreadcrumb} className="flex min-w-0 items-center gap-2">
            <ChevronRight aria-hidden className="h-4 w-4 shrink-0 text-fg-subtle" />
            <Link
              href={`/projects/${projectId}`}
              aria-current={pathname === `/projects/${projectId}` ? "page" : undefined}
              className="block min-w-0 max-w-[40vw] text-body font-medium text-fg-muted transition-colors hover:text-primary md:max-w-xs"
            >
              <Truncate text={shownProjectName} lines={1} />
            </Link>
          </nav>
        )}
      </div>

      {session?.user && (
        <nav aria-label={t.navPrimary} className="flex shrink-0 items-center gap-1">
          <HeaderTools />
          <Link href="/" className={navLinkClass(pathname === "/")} aria-current={pathname === "/" ? "page" : undefined}>
            <FolderOpen aria-hidden className="h-4 w-4" />
            <span className="hidden md:inline">{t.projectListTitle}</span>
            <span className="sr-only md:hidden">{t.projectListTitle}</span>
          </Link>
          <Link href="/me" className={navLinkClass(pathname === "/me")} aria-current={pathname === "/me" ? "page" : undefined}>
            <UserRound aria-hidden className="h-4 w-4" />
            <span className="hidden md:inline">{t.myProfileMenu}</span>
            <span className="sr-only md:hidden">{t.myProfileMenu}</span>
          </Link>

          {isAdmin && <AdminMenu />}

          <LanguageMenu />

          <div aria-hidden="true" className="mx-1.5 hidden h-5 w-px bg-border sm:block" />

          <div className="flex items-center gap-2.5">
            <div
              aria-hidden="true"
              className="flex h-8 w-8 items-center justify-center rounded-full bg-primary-soft text-caption font-semibold text-primary-active ring-2 ring-surface"
            >
              {initials}
            </div>
            <span className="sr-only max-w-[10rem] truncate text-body font-medium text-fg lg:not-sr-only lg:block" title={session.user.name ?? undefined}>
              {session.user.name}
            </span>
          </div>
          <div aria-hidden="true" className="mx-1.5 hidden h-5 w-px bg-border sm:block" />
          <button
            type="button"
            onClick={() => signOut()}
            title={t.logout}
            className={cn(NAV_LINK, "text-fg-muted hover:bg-danger-soft hover:text-danger-strong")}
          >
            <LogOut aria-hidden className="h-4 w-4 sm:hidden" />
            <span className="hidden sm:inline">{t.logout}</span>
            <span className="sr-only sm:hidden">{t.logout}</span>
          </button>
        </nav>
      )}
    </header>
  )
}
