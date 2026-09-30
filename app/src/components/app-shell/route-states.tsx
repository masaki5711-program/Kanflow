"use client"

import Link from "next/link"
import { SearchX, ShieldAlert } from "lucide-react"
import { Skeleton, SkeletonCard, SkeletonTable, buttonClasses, cn } from "@/components/ui"
import { useLanguage } from "@/lib/language-context"

/*
 * Route-level loading (`loading.tsx`) and not-found (`not-found.tsx`) bodies.
 * They render inside the root layout, so the user's language is available
 * through the LanguageProvider (same approach as `error.tsx` / ErrorView).
 */

/** Title bar placeholder shared by the page skeletons. */
function HeaderSkeleton() {
  return (
    <div className="mb-6 space-y-2">
      <Skeleton className="h-7 w-48" />
      <Skeleton className="h-4 w-72 max-w-full" />
    </div>
  )
}

/** Top-level pages (project list, /me, admin): header bar + page title + cards. */
export function AppPageSkeleton() {
  const { t } = useLanguage()
  return (
    <div className="min-h-screen bg-surface-muted">
      <div aria-hidden="true" className="h-14 border-b border-border bg-surface shadow-ui-sm" />
      <div className="page-wide" role="status" aria-busy="true">
        <span className="sr-only">{t.loading}</span>
        <Skeleton className="mb-8 h-36 w-full rounded-3xl" />
        <HeaderSkeleton />
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </div>
      </div>
    </div>
  )
}

/** Project dashboard / generic project page (inside the project layout's <main>). */
export function ProjectPageSkeleton() {
  const { t } = useLanguage()
  return (
    <div role="status" aria-busy="true">
      <span className="sr-only">{t.loading}</span>
      <HeaderSkeleton />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <SkeletonCard />
        <SkeletonCard />
        <SkeletonCard />
        <SkeletonCard />
      </div>
      <SkeletonCard className="mt-6" />
    </div>
  )
}

/** Chart page (burndown): toolbar + large chart area. */
export function ChartPageSkeleton() {
  const { t } = useLanguage()
  return (
    <div role="status" aria-busy="true">
      <span className="sr-only">{t.loading}</span>
      <HeaderSkeleton />
      <div className="mb-4 flex gap-2">
        <Skeleton className="h-9 w-40" />
        <Skeleton className="h-9 w-24" />
      </div>
      <Skeleton className="h-80 w-full rounded-ui-lg" />
    </div>
  )
}

/** Document-like page (report): title + summary cards + table. */
export function ReportPageSkeleton() {
  const { t } = useLanguage()
  return (
    <div role="status" aria-busy="true">
      <span className="sr-only">{t.loading}</span>
      <HeaderSkeleton />
      <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-4">
        <Skeleton className="h-20" />
        <Skeleton className="h-20" />
        <Skeleton className="h-20" />
        <Skeleton className="h-20" />
      </div>
      <SkeletonTable rows={6} columns={4} />
    </div>
  )
}

interface NotFoundViewProps {
  /** "project" = a project (or a page inside it) does not exist / is not accessible. */
  variant?: "page" | "project"
  className?: string
}

/** Localized 404 body with a way back to the project list. */
export function NotFoundView({ variant = "page", className }: NotFoundViewProps) {
  const { t } = useLanguage()
  const title = variant === "project" ? t.notFoundProjectTitle : t.notFoundTitle
  const message = variant === "project" ? t.notFoundProjectMessage : t.notFoundMessage
  return (
    <div className={cn("flex items-center justify-center", className)}>
      <div className="mx-auto max-w-md px-6 text-center">
        <div
          aria-hidden="true"
          className="mb-4 inline-flex h-14 w-14 items-center justify-center rounded-ui-lg bg-surface-sunken"
        >
          <SearchX className="h-7 w-7 text-fg-muted" />
        </div>
        <p className="mb-1 text-caption font-semibold uppercase tracking-widest text-fg-subtle">404</p>
        <h1 className="mb-2 text-title font-bold text-fg">{title}</h1>
        <p className="mb-6 text-body text-fg-muted">{message}</p>
        <Link href="/" className={buttonClasses({ variant: "primary" })}>
          {t.notFoundBackToProjects}
        </Link>
      </div>
    </div>
  )
}

interface ForbiddenViewProps {
  /** Inside a project: the "back" link goes to its dashboard instead of the project list. */
  projectId?: string
  className?: string
}

/**
 * Localized 403 body for a page the user may not use although they can see
 * the project (e.g. the project trash for a Developer). Unlike NotFoundView it
 * does not pretend the page is missing.
 */
export function ForbiddenView({ projectId, className }: ForbiddenViewProps) {
  const { t } = useLanguage()
  const backHref = projectId ? `/projects/${projectId}` : "/"
  const backLabel = projectId ? t.forbiddenBackToProject : t.notFoundBackToProjects
  return (
    <div className={cn("flex items-center justify-center", className)}>
      <div className="mx-auto max-w-md px-6 text-center">
        <div aria-hidden="true" className="mb-4 inline-flex h-14 w-14 items-center justify-center rounded-ui-lg bg-warning-soft">
          <ShieldAlert className="h-7 w-7 text-warning-strong" />
        </div>
        <p className="mb-1 text-caption font-semibold uppercase tracking-widest text-fg-subtle">403</p>
        <h1 className="mb-2 text-title font-bold text-fg">{t.forbiddenTitle}</h1>
        <p className="mb-6 text-body text-fg-muted">{t.forbiddenMessage}</p>
        <Link href={backHref} className={buttonClasses({ variant: "primary" })}>
          {backLabel}
        </Link>
      </div>
    </div>
  )
}
