import { auth } from "@/lib/auth"
import { redirect } from "next/navigation"
import { prisma } from "@/lib/prisma"
import { Header } from "@/components/header"
import { getI18nFor } from "@/lib/translation/hooks"
import { TopPage } from "../top-page"
import { buildPageMetadata } from "@/app/page-metadata"
import { isMyTask, myTaskAssigneeWhere } from "@/lib/my-tasks"
import { loadPoHomeSummary } from "@/services/projects/po-home-summary"
import {
  countProjectList,
  findProjectList,
  loadProjectListMeta,
  loadProjectListScope,
  toProjectListItem,
} from "@/services/projects/project-list"

export function generateMetadata() {
  return buildPageMetadata(({ t }) => t.projectListTitle)
}

export default async function HomePage() {
  const session = await auth()
  if (!session?.user?.id) {
    redirect("/login")
  }

  const userId = session.user.id
  const userName = session.user.name
  const isAdmin = session.user.role === "admin"

  // Role scope (admin: all / section manager: + their sections / others:
  // member projects). Archived projects are only COUNTED here — the list
  // loads them from /api/projects/archived when the section is expanded.
  const scope = await loadProjectListScope({ id: userId, role: session.user.role })

  const [activeProjects, archivedCount, categories, taskCandidates, poSummary] = await Promise.all([
    findProjectList(scope, "active"),
    countProjectList(scope, "archived"),
    prisma.userProjectCategory.findMany({
      where: { userId },
      include: {
        assignments: { select: { projectId: true } },
      },
      orderBy: { sortOrder: "asc" },
    }),
    // Active sprint tasks assigned to the current user across all projects:
    // TaskAssignee by user id, or (rows not backfilled yet) the display name
    // in the legacy string — refined to an exact name match by isMyTask below.
    prisma.sprintBacklogItem.findMany({
      where: {
        ...myTaskAssigneeWhere(userId, userName),
        sprint: {
          status: { in: ["planning", "active"] },
          project: {
            members: { some: { userId } },
            status: "active",
            deletedAt: null,
          },
        },
        // Tasks of trashed PBIs are hidden like in every sprint view.
        pbItem: { deletedAt: null },
      },
      include: {
        assignees: { select: { userId: true } },
        sprint: {
          select: {
            id: true,
            sprintName: true,
            status: true,
            startDate: true,
            endDate: true,
            projectId: true,
            project: { select: { name: true } },
          },
        },
        pbItem: {
          select: {
            id: true,
            displayId: true,
            userStory: true,
          },
        },
      },
      orderBy: { createdAt: "asc" },
    }),
    // Backlog / sprint numbers for Product Owners (A3-16).
    loadPoHomeSummary(userId),
  ])

  const myTasks = taskCandidates.filter((task) => isMyTask(task, userId, userName))

  // Both-language text (one query per entity type) for everything the top
  // page renders: project name/description, task names, PBI stories, sprints.
  const [projectI18n, taskI18n, pbI18n, sprintI18n, projectMeta] = await Promise.all([
    getI18nFor("project", activeProjects.map((p) => p.id)),
    getI18nFor("sprint_task", myTasks.map((t) => t.id)),
    getI18nFor("backlog_item", myTasks.map((t) => t.pbItem.id)),
    getI18nFor("sprint", myTasks.map((t) => t.sprint.id)),
    // Card dates (one grouped ActivityLog query) + per-project archive permission.
    loadProjectListMeta(activeProjects, scope, "active"),
  ])

  const flatActive = activeProjects.map((p) => toProjectListItem(p, projectI18n.get(p.id), projectMeta.get(p.id)))

  return (
    <div className="min-h-screen bg-surface-muted">
      <Header />
      <main id="main-content" className="page-wide">
        <TopPage
          activeProjects={flatActive}
          archivedCount={archivedCount}
          categories={categories}
          isAdmin={isAdmin}
          userName={userName}
          poSummary={poSummary}
          myTasks={myTasks.map((t) => ({
            id: t.id,
            taskName: t.taskName,
            status: t.status,
            version: t.version,
            estimatedHours: t.estimatedHours,
            actualHours: t.actualHours,
            pbId: t.pbItem.id,
            pbDisplayId: t.pbItem.displayId,
            pbUserStory: t.pbItem.userStory,
            i18n: taskI18n.get(t.id) ?? {},
            pbI18n: pbI18n.get(t.pbItem.id) ?? {},
            sprintI18n: sprintI18n.get(t.sprint.id) ?? {},
            projectI18n: projectI18n.get(t.sprint.projectId) ?? {},
            sprintId: t.sprint.id,
            sprintName: t.sprint.sprintName,
            sprintStatus: t.sprint.status,
            sprintStartDate: t.sprint.startDate.toISOString(),
            sprintEndDate: t.sprint.endDate.toISOString(),
            projectId: t.sprint.projectId,
            projectName: t.sprint.project.name,
          }))}
        />
      </main>
    </div>
  )
}
