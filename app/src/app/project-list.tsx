"use client"

import { useMemo, useRef, useState, type MouseEvent } from "react"
import { Plus } from "lucide-react"
import { Button } from "@/components/ui"
import { useApiQuery, useStableHandlers } from "@/hooks"
import { useLanguage } from "@/lib/language-context"
import { ARCHIVED_PROJECTS_URL, ArchivedSection, type ArchivedProjectsResponse } from "./_project-list/archived-section"
import { filterAndSortProjects } from "./_project-list/filter-projects"
import { ProjectCard, ProjectRow } from "./_project-list/project-card"
import { ProjectCreateModal } from "./_project-list/project-create-modal"
import { CategoryView, FlatView } from "./_project-list/project-groups"
import { ProjectListToolbar } from "./_project-list/project-list-toolbar"
import { MENU_WIDTH, ProjectOptionsMenu, type MenuAnchor } from "./_project-list/project-options-menu"
import type { Category, Project, TypeFilter } from "./_project-list/types"
import { useProjectActions } from "./_project-list/use-project-actions"
import { useProjectListPrefs } from "./_project-list/use-project-list-prefs"

export { CARD_COLORS } from "./_project-list/types"

const NO_BADGES: Category[] = []

interface Props {
  activeProjects: Project[]
  /** Archived projects are fetched when the section is first expanded. */
  archivedCount: number
  categories: Category[]
  isAdmin: boolean
}

export function ProjectList({ activeProjects, archivedCount, categories }: Props) {
  const { t, language } = useLanguage()
  const prefs = useProjectListPrefs()
  const actions = useProjectActions(categories)
  const [showCreate, setShowCreate] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all")
  const [searchQuery, setSearchQuery] = useState("")
  const [showArchived, setShowArchived] = useState(false)
  // Latches on the first expand so collapsing again keeps the loaded list.
  const [archivedRequested, setArchivedRequested] = useState(false)
  const archived = useApiQuery<ArchivedProjectsResponse>(archivedRequested ? ARCHIVED_PROJECTS_URL : null)
  const archivedProjects = archived.data?.items
  const [menu, setMenu] = useState<MenuAnchor | null>(null)
  const menuTriggerRef = useRef<HTMLElement | null>(null)

  const hasCategories = actions.categories.length > 0
  const filtered = filterAndSortProjects(activeProjects, {
    query: searchQuery,
    typeFilter,
    sortBy: prefs.sortBy,
    language,
    isFav: actions.isFav,
  })

  function openContextMenu(e: MouseEvent<HTMLElement>, projectId: string) {
    e.preventDefault()
    menuTriggerRef.current = null
    setMenu({ x: Math.min(e.clientX, window.innerWidth - MENU_WIDTH - 8), y: e.clientY, projectId })
  }

  /** ⋮ button: anchor the options menu below the button (toggles). */
  function openOptionsMenu(e: MouseEvent<HTMLButtonElement>, projectId: string) {
    e.stopPropagation()
    if (menu?.projectId === projectId) {
      setMenu(null)
      return
    }
    menuTriggerRef.current = e.currentTarget
    const rect = e.currentTarget.getBoundingClientRect()
    setMenu({
      x: Math.max(8, Math.min(rect.right - MENU_WIDTH, window.innerWidth - MENU_WIDTH - 8)),
      y: rect.bottom + 4,
      projectId,
    })
  }

  function closeMenu(restoreFocus: boolean) {
    setMenu(null)
    if (restoreFocus) menuTriggerRef.current?.focus()
  }

  async function rename(projectId: string, name: string) {
    if (await actions.renameProject(projectId, name)) setEditingId(null)
  }

  // Per-project badge lists computed once per category change (stable arrays
  // keep the memoized cards from re-rendering on unrelated list state).
  const badgesByProject = useMemo(() => {
    const map = new Map<string, Category[]>()
    for (const category of actions.categories) {
      for (const a of category.assignments) {
        const list = map.get(a.projectId) ?? []
        if (!list.includes(category)) map.set(a.projectId, [...list, category])
      }
    }
    return map
  }, [actions.categories])

  const itemHandlers = useStableHandlers({
    onToggleFavorite: (project: Project) => actions.toggleFavorite(project),
    onOpenOptions: openOptionsMenu,
    onContextMenu: openContextMenu,
    onStartEdit: (projectId: string) => setEditingId(projectId),
    onCancelEdit: () => setEditingId(null),
    onRename: rename,
  })

  function renderItem(project: Project, allowCompact = true) {
    const Item = allowCompact && prefs.density === "compact" ? ProjectRow : ProjectCard
    return (
      <Item
        key={project.id}
        project={project}
        badges={badgesByProject.get(project.id) ?? NO_BADGES}
        color={actions.cardColorOf(project)}
        isFavorite={actions.isFav(project)}
        menuOpen={menu?.projectId === project.id}
        editing={editingId === project.id}
        {...itemHandlers}
      />
    )
  }

  const menuProject = menu
    ? (activeProjects.find((p) => p.id === menu.projectId) ?? archivedProjects?.find((p) => p.id === menu.projectId))
    : undefined

  const createButton = (
    <Button leftIcon={<Plus className="h-4 w-4" />} onClick={() => setShowCreate(true)}>
      {t.projectCreateButton}
    </Button>
  )

  return (
    <div>
      {activeProjects.length > 0 && <div className="mb-4 flex justify-end">{createButton}</div>}

      {activeProjects.length > 0 && (
        <ProjectListToolbar
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          typeFilter={typeFilter}
          onTypeFilterChange={setTypeFilter}
          sortBy={prefs.sortBy}
          onSortChange={prefs.setSortBy}
          density={prefs.density}
          onDensityChange={prefs.setDensity}
          viewMode={hasCategories ? prefs.viewMode : null}
          onViewModeChange={prefs.setViewMode}
        />
      )}

      <ProjectCreateModal open={showCreate} onClose={() => setShowCreate(false)} />

      {prefs.viewMode === "category" && hasCategories ? (
        <CategoryView
          projects={filtered}
          categories={actions.categories}
          density={prefs.density}
          collapsed={prefs.collapsedSections}
          onToggleSection={prefs.toggleSection}
          renderItem={(p) => renderItem(p)}
        />
      ) : (
        <FlatView
          projects={filtered}
          totalCount={activeProjects.length}
          density={prefs.density}
          renderItem={(p) => renderItem(p)}
          createAction={createButton}
        />
      )}

      <ArchivedSection
        count={archivedCount}
        expanded={showArchived}
        onToggle={() => {
          setArchivedRequested(true)
          setShowArchived((v) => !v)
        }}
        projects={archivedProjects}
        isLoading={archived.isLoading}
        error={archived.error}
        onRetry={archived.refetch}
        renderItem={(project) => renderItem(project, false)}
      />

      {menu && (
        <ProjectOptionsMenu
          anchor={menu}
          categories={actions.categories}
          currentColor={menuProject ? actions.cardColorOf(menuProject) : null}
          onToggleCategory={(categoryId) => actions.toggleCategory(categoryId, menu.projectId)}
          onSetColor={(c) => actions.setCardColor(menu.projectId, c)}
          onClose={closeMenu}
        />
      )}
    </div>
  )
}
