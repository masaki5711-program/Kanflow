"use client"

import { Moon } from "lucide-react"
import { cn } from "@/components/ui"
import { formatDateTime, formatLongDate, formatRelative } from "@/lib/format-date"
import { useLanguage } from "@/lib/language-context"
import { dormantDays, lastActivityTime } from "./dormancy"
import type { Project } from "./types"

function fill(template: string, values: Record<string, string | number>): string {
  return Object.entries(values).reduce((text, [key, value]) => text.replaceAll(`{${key}}`, String(value)), template)
}

/** Subtle "dormant N days" badge with an archive hint; renders nothing for live projects. */
export function DormantBadge({ project, now, className }: { project: Project; now: Date; className?: string }) {
  const { t } = useLanguage()
  const days = dormantDays(project, now)
  if (days === null) return null
  const hint = fill(t.projectDormantHint, { days })
  return (
    <span
      data-testid="project-dormant-badge"
      title={hint}
      aria-label={hint}
      className={cn(
        "relative z-10 inline-flex shrink-0 items-center gap-1 rounded-full border border-warning/30 bg-warning-soft px-2 py-0.5 text-caption font-medium text-warning-strong",
        className,
      )}
    >
      <Moon aria-hidden="true" className="h-3 w-3" />
      <span aria-hidden="true">{fill(t.projectDormantBadge, { days })}</span>
    </span>
  )
}

interface DatesProps {
  project: Project
  now: Date
  /** Compact rows only show "updated …". */
  compact?: boolean
  className?: string
}

/**
 * "作成 2026/4/12 · 更新 3日前 (· アーカイブ 2026/9/30)" with the full date
 * and time of each part in the tooltip. Relative times depend on "now", so
 * the text may differ between SSR and the browser by a minute.
 */
export function ProjectDates({ project, now, compact = false, className }: DatesProps) {
  const { t, language } = useLanguage()
  const last = lastActivityTime(project)
  const parts: { key: string; text: string; full: string }[] = []
  if (!compact && project.createdAt) {
    parts.push({
      key: "created",
      text: fill(t.projectDateCreated, { date: formatLongDate(new Date(project.createdAt), language) }),
      full: fill(t.projectDateCreatedFull, { date: formatDateTime(new Date(project.createdAt), language) }),
    })
  }
  if (last !== null) {
    const date = new Date(last)
    parts.push({
      key: "updated",
      text: fill(t.projectDateUpdated, { date: formatRelative(date, now, language) }),
      full: fill(t.projectDateUpdatedFull, { date: formatDateTime(date, language) }),
    })
  }
  if (!compact && project.archivedAt) {
    parts.push({
      key: "archived",
      text: fill(t.projectDateArchived, { date: formatLongDate(new Date(project.archivedAt), language) }),
      full: fill(t.projectDateArchivedFull, { date: formatDateTime(new Date(project.archivedAt), language) }),
    })
  }
  if (parts.length === 0) return null
  return (
    <p
      data-testid="project-dates"
      title={parts.map((p) => p.full).join("\n")}
      className={cn("relative z-10 text-caption text-fg-muted", className)}
      suppressHydrationWarning
    >
      {parts.map((p, i) => (
        <span key={p.key} data-date={p.key} suppressHydrationWarning>
          {i > 0 && <span aria-hidden="true"> · </span>}
          {p.text}
        </span>
      ))}
    </p>
  )
}
