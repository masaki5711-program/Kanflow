"use client"

import { useLanguage } from "@/lib/language-context"
import { APP_GENERATION, appVersion } from "@/lib/app-version"
import { cn } from "@/components/ui"

interface VersionBadgeProps {
  className?: string
}

/**
 * "Ver2" next to the product name, so everyone can tell at a glance which Kanflow they are on. The exact build
 * version (git tag) is the tooltip and the accessible name.
 */
export function VersionBadge({ className }: VersionBadgeProps) {
  const { t } = useLanguage()
  const version = appVersion()
  const label = `${t.appVersionLabel} ${version}`
  return (
    <span
      title={label}
      aria-label={`${APP_GENERATION} — ${label}`}
      data-app-version={version}
      className={cn(
        "inline-flex shrink-0 items-center rounded-full bg-primary-soft px-2 py-0.5 text-caption font-semibold leading-none tracking-wide text-primary-active ring-1 ring-inset ring-primary/20",
        className,
      )}
    >
      {APP_GENERATION}
    </span>
  )
}
