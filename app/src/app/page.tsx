import { auth } from "@/lib/auth"
import { redirect } from "next/navigation"
import { prisma } from "@/lib/prisma"
import { Header } from "@/components/header"
import { TopPage } from "./top-page"

export default async function HomePage() {
  const session = await auth()
  if (!session?.user?.id) {
    redirect("/login")
  }

  const userName = session.user.name

  const [activeProjects, archivedProjects, categories, myTasks] = await Promise.all([
    prisma.project.findMany({
      where: {
        members: { some: { userId: session.user.id } },
        status: "active",
      },
      include: {
        members: {
          include: { user: { select: { id: true, name: true } } },
        },
        _count: {
          select: {
            iceboxItems: true,
            backlogItems: true,
            sprints: true,
          },
        },
      },
      orderBy: { updatedAt: "desc" },
    }),
    prisma.project.findMany({
      where: {
        members: { some: { userId: session.user.id } },
        status: "archived",
      },
      include: {
        members: {
          include: { user: { select: { id: true, name: true } } },
        },
        _count: {
          select: {
            iceboxItems: true,
            backlogItems: true,
            sprints: true,
          },
        },
      },
      orderBy: { updatedAt: "desc" },
    }),
    prisma.userProjectCategory.findMany({
      where: { userId: session.user.id },
      include: {
        assignments: { select: { projectId: true } },
      },
      orderBy: { sortOrder: "asc" },
    }),
    // Fetch active sprint tasks assigned to current user across all projects
    prisma.sprintBacklogItem.findMany({
      where: {
        assignee: userName,
        sprint: {
          status: { in: ["planning", "active"] },
          project: {
            members: { some: { userId: session.user.id } },
            status: "active",
          },
        },
      },
      include: {
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
            displayId: true,
            userStory: true,
          },
        },
      },
      orderBy: { createdAt: "asc" },
    }),
  ])

  return (
    <div className="min-h-screen bg-gray-50/50">
      <Header />
      <main className="max-w-4xl mx-auto px-6 py-8">
        <TopPage
          activeProjects={activeProjects}
          archivedProjects={archivedProjects}
          categories={categories}
          isAdmin={session.user.role === "admin"}
          myTasks={myTasks.map((t) => ({
            id: t.id,
            taskName: t.taskName,
            status: t.status,
            estimatedHours: t.estimatedHours,
            actualHours: t.actualHours,
            pbDisplayId: t.pbItem.displayId,
            pbUserStory: t.pbItem.userStory,
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
