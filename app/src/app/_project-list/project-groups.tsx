"use client"

import type { ReactNode } from "react"
import { ChevronRight, FolderOpen, SearchX } from "lucide-react"
import { cn, EmptyState } from "@/components/ui"
import { useLanguage } from "@/lib/language-context"
import { colorDot, type Category, type Density, type Project } from "./types"

interface SectionHeaderProps {
  title: string
  count: number
  expanded: boolean
  onToggle: () => void
  controlsId: string
  dotColor?: string
}

export function SectionHeader({ title, count, expanded, onToggle, controlsId, dotColor }: SectionHeaderProps) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={expanded}
      aria-controls={controlsId}
      className="flex w-full items-center gap-2 rounded-md py-2 text-left"
    >
      <ChevronRight aria-hidden="true" className={cn("h-4 w-4 text-fg-muted transition-transform", expanded && "rotate-90")} />
      {dotColor && <span aria-hidden="true" className={cn("h-2 w-2 rounded-full", dotColor)} />}
      <span className="text-body font-semibold text-fg">{title}</span>
      <span className="text-caption font-normal text-fg-muted">({count})</span>
    </button>
  )
}

function listClass(density: Density, indented = false): string {
  return cn(density === "compact" ? "space-y-1.5" : "grid gap-4", indented && "ml-6 mt-2")
}

interface CategoryViewProps {
  projects: Project[]
  categories: Category[]
  density: Density
  collapsed: Record<string, boolean>
  onToggleSection: (key: string) => void
  renderItem: (p: Project) => ReactNode
}

/** Projects grouped by the user's categories, then an "uncategorized" group. */
export function CategoryView({ projects, categories, density, collapsed, onToggleSection, renderItem }: CategoryViewProps) {
  const { t } = useLanguage()
  const categorized = new Set<string>()
  const sections = categories
    .map((cat) => {
      const ids = new Set(cat.assignments.map((a) => a.projectId))
      const items = projects.filter((p) => ids.has(p.id))
      items.forEach((p) => categorized.add(p.id))
      return { key: `cat-${cat.id}`, title: cat.name, dotColor: colorDot[cat.color] ?? colorDot.gray, items }
    })
    .filter((s) => s.items.length > 0)
  const uncategorized = projects.filter((p) => !categorized.has(p.id))
  const all =
    uncategorized.length > 0
      ? [...sections, { key: "uncategorized", title: t.categoryUncategorized, dotColor: undefined, items: uncategorized }]
      : sections

  if (all.length === 0) {
    return <EmptyState compact icon={<SearchX className="h-5 w-5" />} title={t.projectListNoActive} />
  }

  return (
    <div className="space-y-4">
      {all.map((section) => {
        const expanded = !collapsed[section.key]
        const listId = `project-section-${section.key}`
        return (
          <section key={section.key} aria-label={section.title}>
            <SectionHeader
              title={section.title}
              count={section.items.length}
              expanded={expanded}
              onToggle={() => onToggleSection(section.key)}
              controlsId={listId}
              dotColor={section.dotColor}
            />
            {expanded && (
              <div id={listId} className={listClass(density, true)}>
                {section.items.map(renderItem)}
              </div>
            )}
          </section>
        )
      })}
    </div>
  )
}

interface FlatViewProps {
  projects: Project[]
  totalCount: number
  density: Density
  renderItem: (p: Project) => ReactNode
  createAction: ReactNode
}

export function FlatView({ projects, totalCount, density, renderItem, createAction }: FlatViewProps) {
  const { t } = useLanguage()
  if (totalCount === 0) {
    return (
      <EmptyState
        icon={<FolderOpen className="h-7 w-7" />}
        title={t.projectListEmpty}
        description={t.projectListGetStarted}
        action={createAction}
      />
    )
  }
  if (projects.length === 0) {
    return <EmptyState compact icon={<SearchX className="h-5 w-5" />} title={t.projectNoMatch} />
  }
  return <div className={listClass(density)}>{projects.map(renderItem)}</div>
}
