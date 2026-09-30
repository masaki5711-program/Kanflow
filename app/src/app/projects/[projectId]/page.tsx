import { prisma } from "@/lib/prisma"
import { auth } from "@/lib/auth"
import { can } from "@/lib/authz"
import { notFound, redirect } from "next/navigation"
import { getI18nFor } from "@/lib/translation/hooks"
import { DashboardContent } from "./dashboard-content"
import { buildPageMetadata } from "@/app/page-metadata"
import { computeBurndown } from "@/services/sprints/burndown"
import { loadDuePlanItems, loadMyProjectTasks } from "./dashboard/dashboard-data"
import { buildUpcomingDue, countSprintTasks, sparklineOf } from "./dashboard/dashboard-summary"

export async function generateMetadata({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params
  return buildPageMetadata(({ t }) => t.dashboardTitle, projectId)
}

export default async function ProjectDashboard({
  params,
}: {
  params: Promise<{ projectId: string }>
}) {
  const session = await auth()
  if (!session?.user?.id) redirect("/login")

  const { projectId } = await params

  const membership = await prisma.projectMember.findFirst({
    where: { projectId, userId: session.user.id },
  })
  let effectiveRole = membership?.role ?? null
  if (!membership) {
    // Admin: full PO-level access. Section manager: read access if project's
    // section overlaps with one of the user's sections.
    if (session.user.role === "admin") {
      effectiveRole = "po"
    } else if (session.user.role === "section_manager") {
      const project = await prisma.project.findUnique({
        where: { id: projectId },
        select: { sections: { select: { sectionId: true } } },
      })
      const projectSectionIds = project?.sections.map((s) => s.sectionId) ?? []
      if (projectSectionIds.length > 0) {
        const overlap = await prisma.userSection.findFirst({
          where: { userId: session.user.id, sectionId: { in: projectSectionIds } },
          select: { sectionId: true },
        })
        if (overlap) effectiveRole = "section_manager"
      }
    }
    if (!effectiveRole) notFound()
  }

  const actor = {
    userId: session.user.id,
    systemRole: session.user.role ?? "member",
    projectRole: membership?.role ?? null,
    isSectionManagerOfProject: effectiveRole === "section_manager",
  }

  const project = await prisma.project.findUnique({
    where: { id: projectId, deletedAt: null },
    include: {
      productGoals: { orderBy: { createdAt: "asc" } },
      attachmentFolders: {
        orderBy: { sortOrder: "asc" },
        include: { attachments: { orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }] } },
      },
      attachments: { orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }] },
      _count: {
        select: {
          iceboxItems: { where: { deletedAt: null } },
          backlogItems: { where: { deletedAt: null } },
          sprints: true,
        },
      },
      sprints: {
        where: { status: "active" },
        take: 1,
        // Tasks of trashed PBIs are hidden like in every sprint view.
        include: { items: { where: { pbItem: { deletedAt: null } } } },
      },
    },
  })

  if (!project) {
    notFound()
  }

  // Project progress is a manual value the PO maintains on the dashboard.
  const projectProgressPct = project.progressPct ?? 0

  const activeSprint = project.sprints[0] ?? null
  const now = new Date()

  const [myTasks, duePlanItems] = await Promise.all([
    loadMyProjectTasks(projectId, session.user.id, session.user.name),
    loadDuePlanItems(projectId, now),
  ])

  // Both-language text for the project, its goals, the active sprint and my tasks.
  const [projectI18n, goalI18n, sprintI18n, taskI18n, pbI18n] = await Promise.all([
    getI18nFor("project", [project.id]),
    getI18nFor("product_goal", project.productGoals.map((g) => g.id)),
    getI18nFor("sprint", activeSprint ? [activeSprint.id] : []),
    getI18nFor("sprint_task", myTasks.map((t) => t.id)),
    getI18nFor("backlog_item", myTasks.map((t) => t.pbItem.id)),
  ])
  const sparkline = activeSprint ? sparklineOf(computeBurndown([activeSprint], now)) : undefined
  const upcomingDue = buildUpcomingDue(
    duePlanItems,
    activeSprint ? { id: activeSprint.id, name: activeSprint.sprintName, endDate: activeSprint.endDate.toISOString() } : null,
    now,
  )
  const sprintTaskCounts = activeSprint ? countSprintTasks(activeSprint.items) : null

  return (
    <DashboardContent
      projectId={projectId}
      projectName={project.name}
      projectDescription={project.description}
      projectI18n={projectI18n.get(project.id) ?? {}}
      productGoals={project.productGoals.map((g) => ({
        id: g.id,
        title: g.title,
        description: g.description,
        i18n: goalI18n.get(g.id) ?? {},
      }))}
      folders={project.attachmentFolders.map((f) => ({
        id: f.id,
        name: f.name,
        parentId: f.parentId,
        sortOrder: f.sortOrder,
        attachments: f.attachments.map((a) => ({
          id: a.id,
          originalName: a.originalName,
          fileName: a.fileName,
          fileSize: a.fileSize,
          mimeType: a.mimeType,
          folderId: a.folderId,
          createdAt: a.createdAt.toISOString(),
        })),
      }))}
      attachments={project.attachments
        .filter((a) => !a.folderId)
        .map((a) => ({
          id: a.id,
          originalName: a.originalName,
          fileName: a.fileName,
          fileSize: a.fileSize,
          mimeType: a.mimeType,
          folderId: a.folderId,
          createdAt: a.createdAt.toISOString(),
        }))}
      iceboxCount={project._count.iceboxItems}
      backlogCount={project._count.backlogItems}
      sprintCount={project._count.sprints}
      projectProgressPct={projectProgressPct}
      currentUserRole={effectiveRole ?? "member"}
      canEditGoals={can(actor, "goal.write")}
      activeSprint={
        activeSprint
          ? {
              id: activeSprint.id,
              name: activeSprint.sprintName,
              goal: activeSprint.sprintGoal,
              i18n: sprintI18n.get(activeSprint.id) ?? {},
              startDate: activeSprint.startDate.toISOString(),
              endDate: activeSprint.endDate.toISOString(),
              capacity: activeSprint.capacity,
              taskCounts: sprintTaskCounts!,
              sparkline,
            }
          : null
      }
      myTasks={myTasks.map((t) => ({
        id: t.id,
        taskName: t.taskName,
        status: t.status,
        pbDisplayId: t.pbItem.displayId,
        pbUserStory: t.pbItem.userStory,
        i18n: taskI18n.get(t.id) ?? {},
        pbI18n: pbI18n.get(t.pbItem.id) ?? {},
      }))}
      upcomingDue={upcomingDue}
    />
  )
}
