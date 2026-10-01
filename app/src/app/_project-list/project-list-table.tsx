"use client"

import { memo, type ReactNode } from "react"
import { Clock } from "lucide-react"
import { cn, VisuallyHidden } from "@/components/ui"
import { formatDateTime, formatRelative } from "@/lib/format-date"
import { useLanguage } from "@/lib/language-context"
import { getProjectTypeLabels, type ProjectType } from "@/lib/project-type-labels"
import { projectRoleLabel, projectRoleShortLabel } from "@/lib/project-roles"
import { NameLink, RenameButton, RenameInput, type ProjectItemProps } from "./project-card"
import { DormantBadge } from "./project-dates"
import { FavoriteButton, OptionsButton, ProjectTypeMark } from "./project-parts"
import { lastActivityTime } from "./dormancy"
import { clampPct, colorDot, projectTypeLabel, roleStyle, type Project } from "./types"

/**
 * Column template of the dense list (lg and up). Below lg every row collapses
 * to two compact lines (name + menu, then type / role / updated / dormant), so
 * nothing overflows a 375px phone.
 */
const ROW_GRID =
  "grid grid-cols-[auto_auto_minmax(0,1fr)_auto] items-center gap-x-2 gap-y-1 lg:grid-cols-[2rem_0.75rem_minmax(0,1fr)_10rem_7rem_7.5rem_7rem_6.5rem_2.5rem] lg:gap-x-3"

const CELL_LABEL = "text-caption font-semibold uppercase tracking-wide text-fg-muted"

/** The viewer's own role chip; "viewer" when they only see the project (section manager / admin). */
function MyRoleChip({ project }: { project: Project }) {
  const { t, language } = useLanguage()
  const role = project.myRole ?? null
  if (!role) {
    return (
      <span className="relative z-10 inline-flex items-center rounded-lg bg-surface-sunken px-2 py-0.5 text-caption font-medium text-fg-muted ring-1 ring-inset ring-border">
        {t.projectListRoleViewer}
      </span>
    )
  }
  const full = projectRoleLabel(role, getProjectTypeLabels(project.projectType as ProjectType, language))
  return (
    <span
      title={full}
      className={cn(
        "relative z-10 inline-flex items-center rounded-lg px-2 py-0.5 text-caption font-semibold ring-1 ring-inset",
        roleStyle[role] ?? "bg-surface-muted text-fg-muted ring-border",
      )}
    >
      <span aria-hidden="true">{projectRoleShortLabel(role, language, project.projectType)}</span>
      <VisuallyHidden>{full}</VisuallyHidden>
    </span>
  )
}

function UpdatedCell({ project, now }: { project: Project; now: Date }) {
  const { t, language } = useLanguage()
  const last = lastActivityTime(project)
  if (last === null) return null
  const date = new Date(last)
  return (
    <span
      data-testid="project-row-updated"
      title={t.projectDateUpdatedFull.replaceAll("{date}", formatDateTime(date, language))}
      className="relative z-10 inline-flex items-center gap-1 whitespace-nowrap text-caption text-fg-muted"
      suppressHydrationWarning
    >
      <Clock aria-hidden="true" className="h-3 w-3 lg:hidden" />
      <VisuallyHidden>{t.projectListColUpdated}: </VisuallyHidden>
      {formatRelative(date, now, language)}
    </span>
  )
}

function ProgressCell({ pct }: { pct: number }) {
  const { t } = useLanguage()
  return (
    <div className="flex items-center gap-2" title={t.projectProgress}>
      <div className="h-1.5 w-12 overflow-hidden rounded-full bg-surface-sunken" aria-hidden="true">
        <div className="h-full rounded-full bg-success" style={{ width: `${pct}%` }} />
      </div>
      <span className="text-caption font-semibold tabular-nums text-success-strong">
        {pct}%<VisuallyHidden> {t.projectProgress}</VisuallyHidden>
      </span>
    </div>
  )
}

/** One project in the dense list layout (a `row` of the list table). */
export const ProjectListRow = memo(function ProjectListRow(props: ProjectItemProps) {
  const { project, color, isFavorite, menuOpen, editing } = props
  const { language } = useLanguage()
  const now = props.now ?? new Date()
  return (
    <div
      role="row"
      data-testid="project-list-row"
      onContextMenu={(e) => props.onContextMenu(e, project.id)}
      className={cn(
        ROW_GRID,
        "group relative border-b border-border px-3 py-2 transition-colors last:border-b-0 hover:bg-primary-soft/30 focus-within:bg-primary-soft/30",
      )}
    >
      <div role="cell">
        <FavoriteButton active={isFavorite} onToggle={() => props.onToggleFavorite(project)} size="sm" />
      </div>
      <div role="cell">
        <span aria-hidden="true" className={cn("block h-2.5 w-2.5 rounded-full", color ? (colorDot[color] ?? colorDot.gray) : "bg-border")} />
      </div>
      <div role="cell" className="flex min-w-0 items-center gap-1">
        {editing ? (
          <div className="min-w-0 flex-1">
            <RenameInput project={project} onRename={(name) => props.onRename(project.id, name)} onCancel={props.onCancelEdit} />
          </div>
        ) : (
          <>
            <NameLink
              project={project}
              className="line-clamp-2 break-words text-body font-semibold text-fg [overflow-wrap:anywhere] group-hover:text-primary"
            />
            <RenameButton onClick={() => props.onStartEdit(project.id)} />
          </>
        )}
      </div>
      {/* Phones / tablets: these cells wrap onto a second line; lg+: their own columns (display: contents). */}
      <div className="col-span-full col-start-1 flex flex-wrap items-center gap-x-3 gap-y-1 pl-12 lg:contents">
        <div role="cell" className="relative z-10 flex min-w-0 items-center gap-1.5 text-caption text-fg-muted">
          <ProjectTypeMark type={project.projectType} />
          <span aria-hidden="true" className="hidden truncate lg:inline">
            {projectTypeLabel(project.projectType, language)}
          </span>
        </div>
        <div role="cell">
          <MyRoleChip project={project} />
        </div>
        <div role="cell">
          <UpdatedCell project={project} now={now} />
        </div>
        <div role="cell" className="empty:hidden lg:empty:block">
          <DormantBadge project={project} now={now} />
        </div>
        <div role="cell" className="hidden lg:block">
          <ProgressCell pct={clampPct(project.progressPct)} />
        </div>
      </div>
      <div role="cell" className="col-start-4 row-start-1 flex justify-end lg:col-start-auto lg:row-start-auto">
        <OptionsButton expanded={menuOpen} onOpen={(e) => props.onOpenOptions(e, project.id)} />
      </div>
    </div>
  )
})

/** Dense table-like list: column headers on lg+, then one row per project. */
export function ProjectListTable({ projects, renderRow, label }: { projects: Project[]; renderRow: (p: Project) => ReactNode; label: string }) {
  const { t } = useLanguage()
  return (
    <div role="table" aria-label={label} className="min-w-0 overflow-hidden rounded-xl border border-border bg-surface shadow-ui-sm">
      <div role="rowgroup" className="hidden border-b border-border bg-surface-muted lg:block">
        <div role="row" className={cn(ROW_GRID, "px-3 py-2")}>
          <div role="columnheader">
            <VisuallyHidden>{t.projectFavorite}</VisuallyHidden>
          </div>
          <div role="columnheader">
            <VisuallyHidden>{t.projectCardColor}</VisuallyHidden>
          </div>
          <div role="columnheader" className={CELL_LABEL}>
            {t.projectListColName}
          </div>
          <div role="columnheader" className={CELL_LABEL}>
            {t.projectListColType}
          </div>
          <div role="columnheader" className={CELL_LABEL}>
            {t.projectListColRole}
          </div>
          <div role="columnheader" className={CELL_LABEL}>
            {t.projectListColUpdated}
          </div>
          <div role="columnheader" className={CELL_LABEL}>
            {t.projectListColStatus}
          </div>
          <div role="columnheader" className={CELL_LABEL}>
            {t.projectProgress}
          </div>
          <div role="columnheader">
            <VisuallyHidden>{t.projectListColActions}</VisuallyHidden>
          </div>
        </div>
      </div>
      <div role="rowgroup">{projects.map(renderRow)}</div>
    </div>
  )
}
