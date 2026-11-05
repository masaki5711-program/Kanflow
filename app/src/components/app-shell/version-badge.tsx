"use client"

import { useLanguage } from "@/lib/language-context"
import { APP_GENERATION, appVersion } from "@/lib/app-version"
import { Badge, cn } from "@/components/ui"

interface VersionProps {
  className?: string
}

function useVersionLabel(): { version: string; label: string } {
  const { t } = useLanguage()
  const version = appVersion()
  return { version, label: `${t.appVersionLabel} ${version}` }
}

/**
 * "Ver2" next to the product name, so everyone can tell at a glance which Kanflow they are on. The exact build
 * version is the mouse tooltip and is read out to screen readers; it is shown as text by AppVersionText (user menu,
 * login page), since a tooltip never reaches keyboard or touch users.
 */
export function VersionBadge({ className }: VersionProps) {
  const { version, label } = useVersionLabel()
  return (
    <Badge tone="primary" title={label} data-app-version={version} className={cn("shrink-0 font-semibold tracking-wide", className)}>
      {APP_GENERATION}
      <span className="sr-only">, {label}</span>
    </Badge>
  )
}

/** The exact version as visible text ("Ver2 · バージョン v2-prod-20261105"). */
export function AppVersionText({ className }: VersionProps) {
  const { version, label } = useVersionLabel()
  return (
    <p data-app-version={version} className={cn("text-caption text-fg-subtle", className)}>
      {APP_GENERATION} · {label}
    </p>
  )
}
