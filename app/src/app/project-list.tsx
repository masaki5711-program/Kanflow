"use client"

import { useMemo, useState, type ReactNode } from "react"
import { Plus } from "lucide-react"
import { Button } from "@/components/ui"
import { useApiQuery, useStableHandlers } from "@/hooks"
import { useLanguage } from "@/lib/language-context"
import { ARCHIVED_PROJECTS_URL, ArchivedSection, type ArchivedProjectsResponse } from "./_project-list/archived-section"
import { BulkArchiveDialog } from "./_project-list/bulk-archive-dialog"
import { planBulkArchive, type BulkArchivePlan } from "./_project-list/bulk-archive"
import { DormantBanner } from "./_project-list/dormant-banner"
import { DormantBulkBar } from "./_project-list/dormant-bulk-bar"
import { useDormantReminder } from "./_project-list/dormant-reminder"
import { dormantDays } from "./_project-list/dormancy"
import { filterAndSortProjects } from "./_project-list/filter-projects"
import { ProjectCard } from "./_project-list/project-card"
import { ProjectCreateModal } from "./_project-list/project-create-modal"
import { CategoryView, FlatView, RoleView } from "./_project-list/project-groups"
import { ProjectListRow, ProjectListTable } from "./_project-list/project-list-table"
import { ProjectListToolbar } from "./_project-list/project-list-toolbar"
import { ProjectOptionsMenu } from "./_project-list/project-options-menu"
import type { Category, Project, TypeFilter } from "./_project-list/types"
import { useBulkArchive } from "./_project-list/use-bulk-archive"
import { useOptionsMenu } from "./_project-list/use-options-menu"
import { useProjectActions } from "./_project-list/use-project-actions"
import { useProjectArchive } from "./_project-list/use-project-archive"
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
  const [dormantOnly, setDormantOnly] = useState(false)
  // One "now" per page view: relative dates and dormancy agree across cards (and keep memoized cards stable).
  const [now] = useState(() => new Date())
  const [showArchived, setShowArchived] = useState(false)
  // Latches on the first expand so collapsing again keeps the loaded list.
  const [archivedRequested, setArchivedRequested] = useState(false)
  const archived = useApiQuery<ArchivedProjectsResponse>(archivedRequested ? ARCHIVED_PROJECTS_URL : null)
  const refreshArchived = () => {
    // Refresh the archived section only when it has been loaded (otherwise it loads fresh on first expand).
    if (archivedRequested) archived.refetch()
  }
  const archiving = useProjectArchive({ onChanged: refreshArchived })
  const bulk = useBulkArchive({ markStatus: archiving.markStatus, onChanged: refreshArchived })
  // Snapshot of the confirm dialog's list (it must not shrink while the batch archives the projects).
  const [bulkPlan, setBulkPlan] = useState<BulkArchivePlan | null>(null)
  const reminder = useDormantReminder(now)
  // Optimistic status: an archived card leaves the active list at once (and vice versa).
  const visibleActive = activeProjects.filter((p) => archiving.statusOf(p, "active") === "active")
  const archivedProjects = archived.data?.items.filter((p) => archiving.statusOf(p, "archived") === "archived")
  const { menu, openContextMenu, openOptionsMenu, closeMenu } = useOptionsMenu()

  const hasCategories = actions.categories.length > 0
  const viewMode = prefs.viewMode === "category" && !hasCategories ? "flat" : prefs.viewMode
  const dormantCount = visibleActive.filter((p) => dormantDays(p, now) !== null).length
  const dormantFilterOn = dormantOnly && dormantCount > 0
  const archivableDormant = planBulkArchive(visibleActive, now).archivable.length
  const filtered = filterAndSortProjects(visibleActive, {
    query: searchQuery,
    typeFilter,
    sortBy: prefs.sortBy,
    language,
    isFav: actions.isFav,
    dormantOnly: dormantFilterOn,
    now,
  })

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

  function renderItem(project: Project, Item: typeof ProjectCard | typeof ProjectListRow) {
    return (
      <Item
        key={project.id}
        project={project}
        badges={badgesByProject.get(project.id) ?? NO_BADGES}
        color={actions.cardColorOf(project)}
        isFavorite={actions.isFav(project)}
        menuOpen={menu?.projectId === project.id}
        editing={editingId === project.id}
        now={now}
        {...itemHandlers}
      />
    )
  }

  /** The same filtered / sorted / grouped projects as cards or as the dense list. */
  function renderList(items: Project[], label: string): ReactNode {
    if (prefs.layout === "list") {
      return <ProjectListTable projects={items} label={label} renderRow={(p) => renderItem(p, ProjectListRow)} />
    }
    return <div className="grid gap-4">{items.map((p) => renderItem(p, ProjectCard))}</div>
  }

  const menuActive = menu ? activeProjects.find((p) => p.id === menu.projectId) : undefined
  const menuProject = menuActive ?? (menu ? archivedProjects?.find((p) => p.id === menu.projectId) : undefined)

  function archiveActionFor(project: Project) {
    const isArchived = archiving.statusOf(project, project === menuActive ? "active" : "archived") === "archived"
    return {
      archived: isArchived,
      onSelect: () => void (isArchived ? archiving.restore(project) : archiving.archive(project)),
    }
  }

  function closeBulk() {
    setBulkPlan(null)
    bulk.reset()
  }

  async function runBulk(plan: BulkArchivePlan) {
    const res = await bulk.archiveAll(plan.archivable)
    // Keep the dialog open only to show what failed.
    if (res.failed.length === 0) closeBulk()
  }

  const createButton = (
    <Button leftIcon={<Plus className="h-4 w-4" />} onClick={() => setShowCreate(true)}>
      {t.projectCreateButton}
    </Button>
  )

  return (
    <div>
      {activeProjects.length > 0 && <div className="mb-4 flex justify-end">{createButton}</div>}

      {reminder.visible && !dormantFilterOn && (
        <DormantBanner count={archivableDormant} onReview={() => setDormantOnly(true)} onDismiss={reminder.snooze} />
      )}

      {activeProjects.length > 0 && (
        <ProjectListToolbar
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          typeFilter={typeFilter}
          onTypeFilterChange={setTypeFilter}
          sortBy={prefs.sortBy}
          onSortChange={prefs.setSortBy}
          layout={prefs.layout}
          onLayoutChange={prefs.setLayout}
          viewMode={viewMode}
          onViewModeChange={prefs.setViewMode}
          hasCategories={hasCategories}
          dormantOnly={dormantFilterOn}
          onDormantOnlyChange={setDormantOnly}
          dormantCount={dormantCount}
        />
      )}

      {dormantFilterOn && <DormantBulkBar count={filtered.length} onBulkArchive={() => setBulkPlan(planBulkArchive(filtered, now))} />}

      <ProjectCreateModal open={showCreate} onClose={() => setShowCreate(false)} />

      {viewMode === "category" ? (
        <CategoryView
          projects={filtered}
          categories={actions.categories}
          collapsed={prefs.collapsedSections}
          onToggleSection={prefs.toggleSection}
          renderList={renderList}
        />
      ) : viewMode === "role" && visibleActive.length > 0 ? (
        <RoleView
          projects={filtered}
          isFav={actions.isFav}
          collapsed={prefs.collapsedSections}
          onToggleSection={prefs.toggleSection}
          renderList={renderList}
        />
      ) : (
        <FlatView projects={filtered} totalCount={visibleActive.length} renderList={renderList} createAction={createButton} />
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
        renderList={(items) => renderList(items, t.projectArchivedSection)}
      />

      {bulkPlan && (
        <BulkArchiveDialog
          open
          plan={bulkPlan}
          now={now}
          progress={bulk.progress}
          result={bulk.result}
          onConfirm={() => void runBulk(bulkPlan)}
          onClose={closeBulk}
        />
      )}

      {menu && (
        <ProjectOptionsMenu
          anchor={menu}
          categories={actions.categories}
          currentColor={menuProject ? actions.cardColorOf(menuProject) : null}
          onToggleCategory={(categoryId) => actions.toggleCategory(categoryId, menu.projectId)}
          onSetColor={(c) => actions.setCardColor(menu.projectId, c)}
          archiveAction={menuProject?.canUpdate ? archiveActionFor(menuProject) : null}
          onClose={closeMenu}
        />
      )}
    </div>
  )
}
