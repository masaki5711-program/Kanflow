import { prisma } from "@/lib/prisma"
import { auth } from "@/lib/auth"
import { notFound, redirect } from "next/navigation"
import { DashboardContent } from "./dashboard-content"

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
  if (!membership) notFound()

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: {
      productGoals: { orderBy: { createdAt: "asc" } },
      attachmentFolders: {
        orderBy: { sortOrder: "asc" },
        include: { attachments: { orderBy: { createdAt: "desc" } } },
      },
      attachments: { orderBy: { createdAt: "desc" } },
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
        include: {
          items: true,
        },
      },
    },
  })

  if (!project) {
    notFound()
  }

  const activeSprint = project.sprints[0] ?? null
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
      productGoals={project.productGoals.map((g) => ({
        id: g.id,
        title: g.title,
        description: g.description,
      }))}
      folders={project.attachmentFolders.map((f) => ({
        id: f.id,
        name: f.name,
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
      activeSprint={
        activeSprint
          ? {
              name: activeSprint.sprintName,
              goal: activeSprint.sprintGoal,
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
