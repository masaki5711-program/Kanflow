"use client"

import { useSession } from "next-auth/react"
import Link from "next/link"
import Image from "next/image"
import { usePathname } from "next/navigation"
import { Briefcase, ChevronRight, FolderOpen, Menu, UserRound } from "lucide-react"
import { useLanguage } from "@/lib/language-context"
import { useI18nText, type EntityI18n } from "@/components/i18n-text"
import { Truncate, cn } from "@/components/ui"
import { useSidebarDrawer } from "@/components/app-shell/sidebar-drawer"
import { AdminMenu } from "@/components/app-shell/admin-menu"
import { LanguageMenu } from "@/components/language-switcher"
import { HeaderTools } from "@/components/app-shell/header-tools"
import { UserMenu } from "@/components/app-shell/user-menu"
import {
  HEADER_LABEL_SR_ONLY,
  HEADER_LABEL_VISIBLE,
  HEADER_PRIMARY_INLINE,
  HEADER_SECONDARY_INLINE,
} from "@/components/app-shell/header-breakpoints"
import { canViewPortfolio } from "@/services/portfolio/portfolio.scope"

interface HeaderProps {
  projectName?: string
  /** Both-language text of the project (name) for the breadcrumb. */
  projectI18n?: EntityI18n
  projectId?: string
}

const NAV_LINK =
  "min-h-9 min-w-9 items-center justify-center gap-1.5 rounded-full px-2.5 py-1.5 text-body font-medium transition-colors"

/**
 * App header. The start group (☰, logo, breadcrumb) may shrink — only the
 * breadcrumb truncates — while the end group never overlaps it: items that do
 * not fit a narrow bar move into the user menu (header-breakpoints.ts).
 */
export function Header({ projectName, projectI18n, projectId }: HeaderProps = {}) {
  const { data: session } = useSession()
  const { t } = useLanguage()
  const pathname = usePathname()
  const drawer = useSidebarDrawer()
  const shownProjectName = useI18nText(projectI18n, "name", projectName).text

  const isAdmin = session?.user?.role === "admin"
  const showPortfolio = canViewPortfolio(session?.user ? { userId: session.user.id, systemRole: session.user.role ?? "member" } : null)

  function navLinkClass(active: boolean, visibility: string) {
    return cn(NAV_LINK, visibility, active ? "bg-primary-soft text-primary-active" : "text-fg-muted hover:bg-surface-muted hover:text-fg")
  }

  return (
    <header className="sticky top-0 z-40 flex h-14 items-center gap-2 border-b border-border bg-surface/90 px-3 shadow-ui-sm backdrop-blur-md sm:px-6">
      <div data-header-start="" className="flex min-w-0 flex-1 items-center gap-1.5 sm:gap-2">
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
          <nav aria-label={t.navBreadcrumb} className="flex min-w-0 flex-1 items-center gap-1.5 sm:gap-2">
            <ChevronRight aria-hidden className="h-4 w-4 shrink-0 text-fg-subtle" />
            <Link
              href={`/projects/${projectId}`}
              aria-current={pathname === `/projects/${projectId}` ? "page" : undefined}
              title={shownProjectName}
              className="block min-w-0 max-w-full text-body font-medium text-fg-muted transition-colors hover:text-primary md:max-w-xs"
            >
              <Truncate text={shownProjectName} lines={1} />
            </Link>
          </nav>
        )}
      </div>

      {session?.user && (
        <nav aria-label={t.navPrimary} data-header-end="" className="flex shrink-0 items-center gap-0.5 sm:gap-1">
          <HeaderTools />
          <Link href="/" className={navLinkClass(pathname === "/", HEADER_PRIMARY_INLINE)} aria-current={pathname === "/" ? "page" : undefined}>
            <FolderOpen aria-hidden className="h-4 w-4" />
            <span className={HEADER_LABEL_VISIBLE}>{t.projectListTitle}</span>
            <span className={HEADER_LABEL_SR_ONLY}>{t.projectListTitle}</span>
          </Link>
          <Link href="/me" className={navLinkClass(pathname === "/me", HEADER_PRIMARY_INLINE)} aria-current={pathname === "/me" ? "page" : undefined}>
            <UserRound aria-hidden className="h-4 w-4" />
            <span className={HEADER_LABEL_VISIBLE}>{t.myProfileMenu}</span>
            <span className={HEADER_LABEL_SR_ONLY}>{t.myProfileMenu}</span>
          </Link>

          {showPortfolio && (
            <Link
              href="/portfolio"
              className={navLinkClass(pathname === "/portfolio", HEADER_SECONDARY_INLINE)}
              aria-current={pathname === "/portfolio" ? "page" : undefined}
            >
              <Briefcase aria-hidden className="h-4 w-4" />
              <span className={HEADER_LABEL_VISIBLE}>{t.portfolioNav}</span>
              <span className={HEADER_LABEL_SR_ONLY}>{t.portfolioNav}</span>
            </Link>
          )}

          {isAdmin && <AdminMenu className={HEADER_SECONDARY_INLINE} />}

          <LanguageMenu className={HEADER_SECONDARY_INLINE} />

          <div aria-hidden="true" className="mx-1 hidden h-5 w-px bg-border md:block" />

          <UserMenu userName={session.user.name} isAdmin={isAdmin} showPortfolio={showPortfolio} />
        </nav>
      )}
    </header>
  )
}
