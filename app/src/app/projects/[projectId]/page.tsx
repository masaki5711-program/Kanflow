import { prisma } from "@/lib/prisma"
import { auth } from "@/lib/auth"
import { notFound, redirect } from "next/navigation"
import { getI18nFor } from "@/lib/translation/hooks"
import { DashboardContent } from "./dashboard-content"
import { buildPageMetadata } from "@/app/page-metadata"

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

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: {
      productGoals: { orderBy: { createdAt: "asc" } },
      attachmentFolders: {
        orderBy: { sortOrder: "asc" },
        include: { attachments: { orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }] } },
      },
      attachments: { orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }] },
      _count: {
        select: {
          iceboxItems: true,
          backlogItems: true,
          sprints: true,
        },
      },
      sprints: {
        where: { status: "active" },
        take: 1,
        include: { items: true },
      },
    },
  })

  if (!project) {
    notFound()
  }

  // Project progress is a manual value the PO maintains on the dashboard.
  const projectProgressPct = project.progressPct ?? 0

  const activeSprint = project.sprints[0] ?? null

  // Both-language text for the project, its goals and the active sprint.
  const [projectI18n, goalI18n, sprintI18n] = await Promise.all([
    getI18nFor("project", [project.id]),
    getI18nFor("product_goal", project.productGoals.map((g) => g.id)),
    getI18nFor("sprint", activeSprint ? [activeSprint.id] : []),
  ])
  const sprintTaskCounts = activeSprint
    ? {
        todo: activeSprint.items.filter((i) => i.status === "todo").length,
        inProgress: activeSprint.items.filter((i) => i.status === "in_progress").length,
        done: activeSprint.items.filter((i) => i.status === "done").length,
      }
    : null

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
            }
          : null
      }
    />
  )
}
