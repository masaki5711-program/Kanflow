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

  const userId = session.user.id
  const userName = session.user.name
  const isAdmin = session.user.role === "admin"
  const isSectionManager = session.user.role === "section_manager"

  // Build the WHERE clause based on role:
  // - admin: ALL projects (regardless of membership)
  // - section_manager: own member projects + projects in their sections
  // - others: own member projects only
  const userSections = isSectionManager
    ? await prisma.userSection.findMany({
        where: { userId },
        select: { sectionId: true },
      })
    : []
  const sectionIds = userSections.map((s) => s.sectionId)

  function buildWhere(status: string) {
    if (isAdmin) return { status }
    if (isSectionManager && sectionIds.length > 0) {
      return {
        status,
        OR: [
          { members: { some: { userId } } },
          { sections: { some: { sectionId: { in: sectionIds } } } },
        ],
      }
    }
    return { members: { some: { userId } }, status }
  }

  const [activeProjects, archivedProjects, categories, myTasks] = await Promise.all([
    prisma.project.findMany({
      where: buildWhere("active"),
      include: {
        members: {
          include: { user: { select: { id: true, name: true } } },
        },
        sections: { include: { section: { select: { id: true, name: true } } } },
        favoritedBy: { where: { userId }, select: { userId: true } },
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
      where: buildWhere("archived"),
      include: {
        members: {
          include: { user: { select: { id: true, name: true } } },
        },
        sections: { include: { section: { select: { id: true, name: true } } } },
        favoritedBy: { where: { userId }, select: { userId: true } },
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
    // Fetch active sprint tasks assigned to current user across all projects.
    // Assignees are stored as a comma-separated string of names; match by
    // substring so multi-assignee tasks still appear for each member.
    prisma.sprintBacklogItem.findMany({
      where: {
        assignee: userName ? { contains: userName } : undefined,
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

  // Flatten ProjectSection junction rows into a simple array of section refs,
  // and surface the per-user favorite flag.
  type RawProject = (typeof activeProjects)[number]
  const flatten = (p: RawProject) => ({
    ...p,
    sections: p.sections.map((ps) => ps.section),
    isFavorite: p.favoritedBy.length > 0,
  })
  const flatActive = activeProjects.map(flatten)
  const flatArchived = archivedProjects.map(flatten)

  return (
    <div className="min-h-screen bg-gray-50/50">
      <Header />
      <main className="max-w-7xl mx-auto px-6 py-8">
        <TopPage
          activeProjects={flatActive}
          archivedProjects={flatArchived}
          categories={categories}
          isAdmin={isAdmin}
          userName={userName}
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
