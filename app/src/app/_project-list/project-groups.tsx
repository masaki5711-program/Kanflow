"use client"

import type { ReactNode } from "react"
import { ChevronRight, FolderOpen, SearchX } from "lucide-react"
import { cn, EmptyState } from "@/components/ui"
import { useLanguage } from "@/lib/language-context"
import { groupByRole, roleGroupTitle } from "./role-groups"
import { colorDot, type Category, type Project } from "./types"

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

interface Section {
  key: string
  title: string
  dotColor?: string
  items: Project[]
}

interface SectionsProps {
  sections: Section[]
  collapsed: Record<string, boolean>
  onToggleSection: (key: string) => void
  renderList: (items: Project[], label: string) => ReactNode
}

/** Collapsible sections with counts; the collapsed state is persisted by the caller. */
function CollapsibleSections({ sections, collapsed, onToggleSection, renderList }: SectionsProps) {
  const { t } = useLanguage()
  if (sections.length === 0) {
    return <EmptyState compact icon={<SearchX className="h-5 w-5" />} title={t.projectListNoActive} />
  }
  return (
    <div className="space-y-4">
      {sections.map((section) => {
        const expanded = !collapsed[section.key]
        const listId = `project-section-${section.key}`
        return (
          <section key={section.key} aria-label={section.title} data-testid={`project-section-${section.key}`}>
            <SectionHeader
              title={section.title}
              count={section.items.length}
              expanded={expanded}
              onToggle={() => onToggleSection(section.key)}
              controlsId={listId}
              dotColor={section.dotColor}
            />
            {expanded && (
              <div id={listId} className="ml-6 mt-2">
                {renderList(section.items, section.title)}
              </div>
            )}
          </section>
        )
      })}
    </div>
  )
}

interface CategoryViewProps {
  projects: Project[]
  categories: Category[]
  collapsed: Record<string, boolean>
  onToggleSection: (key: string) => void
  renderList: (items: Project[], label: string) => ReactNode
}

/** Projects grouped by the user's categories, then an "uncategorized" group. */
export function CategoryView({ projects, categories, collapsed, onToggleSection, renderList }: CategoryViewProps) {
  const { t } = useLanguage()
  const categorized = new Set<string>()
  const sections: Section[] = categories
    .map((cat) => {
      const ids = new Set(cat.assignments.map((a) => a.projectId))
      const items = projects.filter((p) => ids.has(p.id))
      items.forEach((p) => categorized.add(p.id))
      return { key: `cat-${cat.id}`, title: cat.name, dotColor: colorDot[cat.color] ?? colorDot.gray, items }
    })
    .filter((s) => s.items.length > 0)
  const uncategorized = projects.filter((p) => !categorized.has(p.id))
  const all = uncategorized.length > 0 ? [...sections, { key: "uncategorized", title: t.categoryUncategorized, items: uncategorized }] : sections
  return <CollapsibleSections sections={all} collapsed={collapsed} onToggleSection={onToggleSection} renderList={renderList} />
}

interface RoleViewProps {
  projects: Project[]
  isFav: (p: Project) => boolean
  collapsed: Record<string, boolean>
  onToggleSection: (key: string) => void
  renderList: (items: Project[], label: string) => ReactNode
}

/** Projects grouped by the viewer's own role (favorites first). */
export function RoleView({ projects, isFav, collapsed, onToggleSection, renderList }: RoleViewProps) {
  const { t, language } = useLanguage()
  const sections: Section[] = groupByRole(projects, isFav).map((g) => ({
    key: `role-${g.key}`,
    title: roleGroupTitle(g.key, t, language),
    items: g.items,
  }))
  return <CollapsibleSections sections={sections} collapsed={collapsed} onToggleSection={onToggleSection} renderList={renderList} />
}

interface FlatViewProps {
  projects: Project[]
  totalCount: number
  renderList: (items: Project[], label: string) => ReactNode
  createAction: ReactNode
}

export function FlatView({ projects, totalCount, renderList, createAction }: FlatViewProps) {
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
  return renderList(projects, t.projectListTitle)
}
