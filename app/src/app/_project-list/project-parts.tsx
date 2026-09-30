"use client"

import type { MouseEvent, ReactNode } from "react"
import { Bot, ClipboardList, Layers, MoreVertical, Star, Tag, Zap } from "lucide-react"
import { cn, IconButton, VisuallyHidden } from "@/components/ui"
import { useLanguage } from "@/lib/language-context"
import { pickReportTitle } from "@/components/ai-report-language"
import {
  colorDot,
  colorMap,
  hasCriticalAiReport,
  projectTypeEmoji,
  projectTypeLabel,
  type Category,
  type Project,
} from "./types"

/** Emoji type marker with an accessible, localized label. */
export function ProjectTypeMark({ type, className }: { type: string; className?: string }) {
  const { language } = useLanguage()
  const label = projectTypeLabel(type, language)
  return (
    <span title={label} className={className}>
      <span aria-hidden="true">{projectTypeEmoji(type)}</span>
      <VisuallyHidden>{label}</VisuallyHidden>
    </span>
  )
}

export function FavoriteButton({
  active,
  onToggle,
  size = "md",
}: {
  active: boolean
  onToggle: () => void
  size?: "sm" | "md"
}) {
  const { t } = useLanguage()
  return (
    <IconButton
      label={t.projectFavorite}
      aria-pressed={active}
      size="sm"
      className={cn("relative z-10 shrink-0", active ? "text-amber-500 hover:text-amber-600" : "text-fg-subtle hover:text-amber-500")}
      icon={<Star className={size === "sm" ? "h-4 w-4" : "h-5 w-5"} fill={active ? "currentColor" : "none"} strokeWidth={1.8} />}
      onClick={(e) => {
        e.stopPropagation()
        onToggle()
      }}
    />
  )
}

export function OptionsButton({
  expanded,
  onOpen,
}: {
  expanded: boolean
  onOpen: (e: MouseEvent<HTMLButtonElement>) => void
}) {
  const { t } = useLanguage()
  return (
    <IconButton
      label={t.projectOptions}
      size="sm"
      data-ctx-trigger
      aria-haspopup="menu"
      aria-expanded={expanded}
      className="relative z-10 shrink-0"
      icon={<MoreVertical className="h-4 w-4" />}
      onClick={onOpen}
    />
  )
}

export function CategoryBadges({ categories, max, compact }: { categories: Category[]; max?: number; compact?: boolean }) {
  if (categories.length === 0) return null
  const shown = max ? categories.slice(0, max) : categories
  return (
    <>
      {shown.map((cat) => (
        <span
          key={cat.id}
          className={cn(
            "inline-flex max-w-full items-center gap-1 rounded-full border px-2 py-0.5 text-caption [overflow-wrap:anywhere]",
            compact && "hidden md:inline-flex",
            colorMap[cat.color] ?? colorMap.gray,
          )}
        >
          <span aria-hidden="true" className={cn("h-1.5 w-1.5 rounded-full", colorDot[cat.color] ?? colorDot.gray)} />
          {cat.name}
        </span>
      ))}
    </>
  )
}

export function SectionBadges({ sections }: { sections?: { id: string; name: string }[] }) {
  if (!sections || sections.length === 0) return null
  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      {sections.map((s) => (
        <span
          key={s.id}
          className="inline-flex max-w-full items-center gap-1 rounded-full bg-warning-soft px-2 py-0.5 text-caption font-medium text-warning-strong [overflow-wrap:anywhere]"
        >
          <Tag aria-hidden="true" className="h-3 w-3" />
          {s.name}
        </span>
      ))}
    </div>
  )
}

function Count({ icon, value, label }: { icon: ReactNode; value: number; label: string }) {
  return (
    <span className="flex items-center gap-1.5 text-fg-muted" title={label}>
      <span aria-hidden="true">{icon}</span>
      <span>{value}</span>
      <VisuallyHidden>{label}</VisuallyHidden>
    </span>
  )
}

/** AI report / IceBox / backlog / sprint counters shown on cards and rows. */
export function ProjectCounts({ project }: { project: Project }) {
  const { t, language } = useLanguage()
  const aiCount = project._count.aiReports ?? 0
  const critical = hasCriticalAiReport(project)
  // S-18: autonomous report titles are "JA / ID" pairs — show the viewer's side.
  const latestTitle = project.aiReports?.[0]?.title
  const aiTooltip = latestTitle ? pickReportTitle(latestTitle, language) : t.aiReportsTitle
  return (
    <>
      {aiCount > 0 && (
        <span
          className={cn(
            "flex items-center gap-1 rounded-full border px-2 py-0.5 font-semibold",
            critical ? "border-danger/30 bg-danger-soft text-danger-strong" : "border-info/30 bg-info-soft text-info",
          )}
          title={aiTooltip}
        >
          <Bot aria-hidden="true" className="h-3.5 w-3.5" />
          <span>{aiCount}</span>
          <VisuallyHidden>{t.projectCountAiReports}</VisuallyHidden>
        </span>
      )}
      <Count icon={<Layers className="h-3.5 w-3.5" />} value={project._count.iceboxItems} label={t.projectCountIcebox} />
      <Count icon={<ClipboardList className="h-3.5 w-3.5" />} value={project._count.backlogItems} label={t.projectCountBacklog} />
      <Count icon={<Zap className="h-3.5 w-3.5" />} value={project._count.sprints} label={t.projectCountSprints} />
    </>
  )
}
