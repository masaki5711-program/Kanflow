"use client"

import Link from "next/link"
import { memo, useRef, useState, type MouseEvent } from "react"
import { Pencil } from "lucide-react"
import { cn, IconButton, Input } from "@/components/ui"
import { I18nText } from "@/components/i18n-text"
import { useLanguage } from "@/lib/language-context"
import {
  CategoryBadges,
  FavoriteButton,
  OptionsButton,
  ProjectCounts,
  ProjectTypeMark,
  SectionBadges,
} from "./project-parts"
import { cardTint, clampPct, roleLabel, roleStyle, rowTint, type Category, type Project } from "./types"

export interface ProjectItemProps {
  project: Project
  /** Categories this project is assigned to (badges). */
  badges: Category[]
  color: string | null
  isFavorite: boolean
  menuOpen: boolean
  editing: boolean
  /*
   * Handlers receive the project (id) so the list can pass the SAME stable
   * functions to every item — required for the React.memo on cards / rows.
   */
  onToggleFavorite: (project: Project) => void
  onOpenOptions: (e: MouseEvent<HTMLButtonElement>, projectId: string) => void
  onContextMenu: (e: MouseEvent<HTMLElement>, projectId: string) => void
  onStartEdit: (projectId: string) => void
  onCancelEdit: () => void
  onRename: (projectId: string, name: string) => void | Promise<void>
}

/** Inline project-name editor: Enter / blur saves, Escape cancels. */
function RenameInput({ project, onRename, onCancel }: { project: Project; onRename: (name: string) => void | Promise<void>; onCancel: () => void }) {
  const { t } = useLanguage()
  const [draft, setDraft] = useState(project.name)
  const busy = useRef(false)

  async function commit() {
    if (busy.current) return
    const trimmed = draft.trim()
    if (!trimmed || trimmed === project.name) {
      onCancel()
      return
    }
    busy.current = true
    try {
      await onRename(trimmed)
    } finally {
      busy.current = false
    }
  }

  return (
    <Input
      autoFocus
      aria-label={t.projectEditName}
      value={draft}
      onFocus={(e) => e.currentTarget.select()}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => void commit()}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault()
          void commit()
        } else if (e.key === "Escape") {
          e.preventDefault()
          onCancel()
        }
      }}
      className="relative z-10 text-title font-semibold"
    />
  )
}

/** Project name as a stretched link: the whole card is clickable, the name is a real link. */
function NameLink({ project, className }: { project: Project; className?: string }) {
  return (
    <Link
      href={`/projects/${project.id}`}
      className={cn("min-w-0 after:absolute after:inset-0 after:rounded-[inherit] after:content-['']", className)}
    >
      {/* relative z-10 keeps the "translate now" badge clickable above the stretched overlay */}
      <span className="relative z-10">
        <I18nText i18n={project.i18n} field="name" original={project.name} entity={{ type: "project", id: project.id }} />
      </span>
    </Link>
  )
}

function RenameButton({ onClick }: { onClick: () => void }) {
  const { t } = useLanguage()
  return (
    <IconButton
      label={t.projectEditName}
      size="sm"
      icon={<Pencil className="h-3.5 w-3.5" />}
      className="relative z-10 shrink-0 opacity-100 [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100 [@media(hover:hover)]:group-focus-within:opacity-100"
      onClick={(e) => {
        e.stopPropagation()
        onClick()
      }}
    />
  )
}

export const ProjectCard = memo(function ProjectCard(props: ProjectItemProps) {
  const { project, badges, color, isFavorite, menuOpen, editing } = props
  const { t } = useLanguage()
  const tint = color ? cardTint[color] : null
  const pct = clampPct(project.progressPct)

  return (
    <article
      onContextMenu={(e) => props.onContextMenu(e, project.id)}
      className={cn(
        "group relative rounded-2xl border p-6 shadow-sm transition-shadow hover:shadow-md",
        tint ?? "border-border bg-surface hover:border-border-strong",
      )}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          {editing ? (
            <RenameInput project={project} onRename={(name) => props.onRename(project.id, name)} onCancel={props.onCancelEdit} />
          ) : (
            <div className="flex items-center gap-2">
              <FavoriteButton active={isFavorite} onToggle={() => props.onToggleFavorite(project)} />
              <h3 className="min-w-0 text-title font-semibold text-fg group-hover:text-primary">
                <NameLink project={project} />
              </h3>
              <ProjectTypeMark type={project.projectType} className="shrink-0 rounded-md bg-surface-sunken px-1.5 py-0.5 text-caption" />
              <RenameButton onClick={() => props.onStartEdit(project.id)} />
            </div>
          )}
          {project.description && (
            <I18nText
              as="p"
              className="mt-1 line-clamp-2 text-body text-fg-muted"
              i18n={project.i18n}
              field="description"
              original={project.description}
              noBadge
            />
          )}
          <SectionBadges sections={project.sections} />
          {badges.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              <CategoryBadges categories={badges} />
            </div>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-4 text-caption">
          <ProjectCounts project={project} />
          <OptionsButton expanded={menuOpen} onOpen={(e) => props.onOpenOptions(e, project.id)} />
        </div>
      </div>
      {/* Progress bar — manually set by PO on the dashboard */}
      <div className="mt-3">
        <div className="mb-1 flex items-center justify-between text-caption">
          <span className="text-fg-muted">{t.projectProgress}</span>
          <span className="font-semibold text-success">{pct}%</span>
        </div>
        <div
          className="h-1.5 w-full overflow-hidden rounded-full bg-surface-sunken"
          role="progressbar"
          aria-label={t.projectProgress}
          aria-valuenow={pct}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <div className="h-full rounded-full bg-success transition-[width] duration-500" style={{ width: `${pct}%` }} />
        </div>
      </div>
      <ul className="mt-4 flex flex-wrap gap-2">
        {project.members.map((m) => (
          <li
            key={m.user.id}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-caption font-medium ring-1 ring-inset",
              roleStyle[m.role] ?? "bg-surface-muted text-fg-muted ring-border",
            )}
          >
            {m.user.name}
            {/* No opacity on the role label: faded text fails WCAG contrast (P-10). */}
            <span className="font-semibold">{roleLabel[m.role] ?? m.role}</span>
          </li>
        ))}
      </ul>
    </article>
  )
})

/** Compact one-line variant of the project card. */
export const ProjectRow = memo(function ProjectRow(props: ProjectItemProps) {
  const { project, badges, color, isFavorite, menuOpen, editing } = props
  const { t } = useLanguage()
  const pct = clampPct(project.progressPct)

  return (
    <div
      onContextMenu={(e) => props.onContextMenu(e, project.id)}
      className={cn(
        "group relative flex items-center gap-3 rounded-lg border border-border bg-surface px-3 py-2 transition-colors hover:border-primary/40 hover:bg-primary-soft/30",
        color ? (rowTint[color] ?? "") : "",
      )}
    >
      <FavoriteButton active={isFavorite} onToggle={() => props.onToggleFavorite(project)} size="sm" />
      <ProjectTypeMark type={project.projectType} className="w-6 shrink-0 text-center text-body" />
      {editing ? (
        <div className="min-w-0 flex-1">
          <RenameInput project={project} onRename={(name) => props.onRename(project.id, name)} onCancel={props.onCancelEdit} />
        </div>
      ) : (
        <>
          <NameLink project={project} className="flex-1 truncate text-body font-semibold text-fg group-hover:text-primary" />
          <RenameButton onClick={() => props.onStartEdit(project.id)} />
        </>
      )}
      <CategoryBadges categories={badges} max={3} compact />
      <div className="hidden shrink-0 items-center gap-2 sm:flex">
        <div className="h-1 w-20 overflow-hidden rounded-full bg-surface-sunken" aria-hidden="true">
          <div className="h-full rounded-full bg-success" style={{ width: `${pct}%` }} />
        </div>
        <span className="w-10 text-right text-caption font-semibold text-success" title={t.projectProgress}>
          {pct}%
        </span>
      </div>
      <div className="hidden shrink-0 items-center gap-3 text-caption md:flex">
        <ProjectCounts project={project} />
      </div>
      <OptionsButton expanded={menuOpen} onOpen={(e) => props.onOpenOptions(e, project.id)} />
    </div>
  )
})
