import { prisma } from "@/lib/prisma"
import { auth } from "@/lib/auth"
import { notFound, redirect } from "next/navigation"
import { getI18nFor } from "@/lib/translation/hooks"
import { ReportContent } from "./report-content"
import { buildPageMetadata } from "@/app/page-metadata"

export async function generateMetadata({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params
  return buildPageMetadata(({ t }) => t.reportTitle, projectId)
}

export default async function ReportPage({
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
  if (!membership) {
    // Admin: full access. Section manager: read access if project's sections overlap.
    if (session.user.role === "admin") {
      // proceed
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
        if (!overlap) notFound()
      } else {
        notFound()
      }
    } else {
      notFound()
    }
  }

  const project = await prisma.project.findUnique({
    where: { id: projectId, deletedAt: null },
    include: {
      members: {
        include: { user: { select: { id: true, name: true, email: true } } },
        orderBy: { joinedAt: "asc" },
      },
      productGoals: { orderBy: { createdAt: "asc" } },
    },
  })

  if (!project) notFound()

  // Sprints (exclude archived for active list, include all for results)
  const sprints = await prisma.sprint.findMany({
    where: { projectId },
    include: {
      items: {
        // Tasks of trashed PBIs are hidden like in every sprint view.
        where: { pbItem: { deletedAt: null } },
        include: {
          pbItem: {
            select: {
              id: true,
              displayId: true,
              initiative: true,
              epic: true,
              userStory: true,
              workloadScore: true,
            },
          },
        },
      },
    },
    orderBy: { startDate: "desc" },
  })

  // Backlog full details
  const backlogItems = await prisma.productBacklogItem.findMany({
    where: { projectId, deletedAt: null },
    include: {
      productGoal: { select: { id: true, title: true } },
    },
    orderBy: { sortOrder: "asc" },
  })
  const readyItems = backlogItems.filter((i) => i.status === "ready")
  const notReadyItems = backlogItems.filter((i) => i.status === "not_ready")
  const completedItems = backlogItems.filter((i) => i.status === "completed")
  const totalReadyWorkload = readyItems.reduce((sum, i) => sum + (i.workloadScore ?? 0), 0)

  // Icebox counts
  const iceboxItems = await prisma.iceboxItem.findMany({
    where: { projectId, deletedAt: null },
    select: { status: true },
  })
  const iceboxUnreviewed = iceboxItems.filter((i) => i.status === "unreviewed").length
  const iceboxReviewed = iceboxItems.filter((i) => i.status === "reviewed").length
  const iceboxFrozen = iceboxItems.filter((i) => i.status === "frozen").length

  // Upcoming events (next 30 days)
  const now = new Date()
  const thirtyDaysLater = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)
  const events = await prisma.calendarEvent.findMany({
    where: {
      projectId,
      date: { gte: now, lte: thirtyDaysLater },
    },
    orderBy: { date: "asc" },
    take: 20,
  })

  // Both-language text, one query per entity type.
  const allSprintItems = sprints.flatMap((s) => s.items)
  const [projectI18n, goalI18n, sprintI18n, taskI18n, pbI18n, eventI18n] = await Promise.all([
    getI18nFor("project", [project.id]),
    getI18nFor("product_goal", [
      ...project.productGoals.map((g) => g.id),
      ...backlogItems.map((i) => i.productGoal?.id ?? "").filter(Boolean),
    ]),
    getI18nFor("sprint", sprints.map((s) => s.id)),
    getI18nFor("sprint_task", allSprintItems.map((i) => i.id)),
    getI18nFor("backlog_item", [...allSprintItems.map((i) => i.pbItem.id), ...backlogItems.map((i) => i.id)]),
    getI18nFor("calendar_event", events.map((e) => e.id)),
  ])

  // Serialize dates for client component
  const serializedSprints = sprints.map((s) => ({
    id: s.id,
    i18n: sprintI18n.get(s.id) ?? {},
    sprintName: s.sprintName,
    startDate: s.startDate.toISOString(),
    endDate: s.endDate.toISOString(),
    sprintGoal: s.sprintGoal,
    capacity: s.capacity,
    actualScore: s.actualScore,
    status: s.status,
    reviewComment: s.reviewComment,
    retrospectiveMemo: s.retrospectiveMemo,
    retrospectiveKeep: s.retrospectiveKeep,
    retrospectiveProblem: s.retrospectiveProblem,
    retrospectiveTry: s.retrospectiveTry,
    items: s.items.map((item) => ({
      id: item.id,
      i18n: taskI18n.get(item.id) ?? {},
      taskName: item.taskName,
      assignee: item.assignee,
      estimatedHours: item.estimatedHours,
      actualHours: item.actualHours,
      status: item.status,
      pbItem: { ...item.pbItem, i18n: pbI18n.get(item.pbItem.id) ?? {} },
    })),
  }))

  const serializedEvents = events.map((e) => ({
    id: e.id,
    i18n: eventI18n.get(e.id) ?? {},
    title: e.title,
    description: e.description,
    date: e.date.toISOString(),
    endDate: e.endDate?.toISOString() ?? null,
    color: e.color,
  }))

  return (
    <ReportContent
      projectId={projectId}
      projectName={project.name}
      projectDescription={project.description}
      projectI18n={projectI18n.get(project.id) ?? {}}
      language={project.language}
      pointUnit={project.pointUnit}
      members={project.members.map((m) => ({
        id: m.user.id,
        name: m.user.name,
        email: m.user.email,
        role: m.role,
      }))}
      productGoals={project.productGoals.map((g) => ({
        id: g.id,
        title: g.title,
        description: g.description,
        i18n: goalI18n.get(g.id) ?? {},
      }))}
      sprints={serializedSprints}
      backlogItems={backlogItems.map((i) => ({
        i18n: pbI18n.get(i.id) ?? {},
        productGoalI18n: i.productGoal ? goalI18n.get(i.productGoal.id) ?? {} : null,
        displayId: i.displayId,
        initiative: i.initiative,
        epic: i.epic,
        userStory: i.userStory,
        workloadScore: i.workloadScore,
        status: i.status,
        assignedPo: i.assignedPo,
        completedAt: i.completedAt?.toISOString() ?? null,
        productGoalTitle: i.productGoal?.title ?? null,
      }))}
      backlogSummary={{
        ready: readyItems.length,
        notReady: notReadyItems.length,
        completed: completedItems.length,
        totalReadyWorkload,
      }}
      icebox={{
        unreviewed: iceboxUnreviewed,
        reviewed: iceboxReviewed,
        frozen: iceboxFrozen,
      }}
      events={serializedEvents}
    />
  )
}
