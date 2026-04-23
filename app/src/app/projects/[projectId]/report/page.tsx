import { prisma } from "@/lib/prisma"
import { auth } from "@/lib/auth"
import { notFound, redirect } from "next/navigation"
import { ReportContent } from "./report-content"

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
  if (!membership) notFound()

  const project = await prisma.project.findUnique({
    where: { id: projectId },
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
    where: { projectId },
    include: {
      productGoal: { select: { title: true } },
    },
    orderBy: { sortOrder: "asc" },
  })
  const readyItems = backlogItems.filter((i) => i.status === "ready")
  const notReadyItems = backlogItems.filter((i) => i.status === "not_ready")
  const completedItems = backlogItems.filter((i) => i.status === "completed")
  const totalReadyWorkload = readyItems.reduce((sum, i) => sum + (i.workloadScore ?? 0), 0)

  // Icebox counts
  const iceboxItems = await prisma.iceboxItem.findMany({
    where: { projectId },
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

  // Serialize dates for client component
  const serializedSprints = sprints.map((s) => ({
    id: s.id,
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
      taskName: item.taskName,
      assignee: item.assignee,
      estimatedHours: item.estimatedHours,
      actualHours: item.actualHours,
      status: item.status,
      pbItem: item.pbItem,
    })),
  }))

  const serializedEvents = events.map((e) => ({
    id: e.id,
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
      language={project.language}
      pointUnit={project.pointUnit}
      members={project.members.map((m) => ({
        name: m.user.name,
        email: m.user.email,
        role: m.role,
      }))}
      productGoals={project.productGoals.map((g) => ({
        title: g.title,
        description: g.description,
      }))}
      sprints={serializedSprints}
      backlogItems={backlogItems.map((i) => ({
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
