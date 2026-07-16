import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireProjectMember, requireProjectAccess } from "@/lib/api-helpers"
import { z } from "zod"

const createSchema = z.object({
  sprintName: z.string().min(1).max(200),
  startDate: z.string(),
  endDate: z.string(),
  sprintGoal: z.string().max(5000).optional(),
  capacity: z.number().int().min(0).optional(),
  selectedPbIds: z.array(z.string()).optional(),
})

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params
  const result = await requireProjectAccess(projectId, "read")
  if ("error" in result) return result.error

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
              userStory: true,
              epic: true,
              workloadScore: true,
              acceptanceCriteria: true,
            },
          },
        },
        orderBy: { createdAt: "asc" },
      },
    },
    orderBy: [{ startDate: "desc" }, { createdAt: "desc" }],
  })

  return NextResponse.json(sprints)
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params
  const result = await requireProjectMember(projectId, { roles: ["po", "sm"] })
  if ("error" in result) return result.error

  try {
    const body = await request.json()
    const data = createSchema.parse(body)

    const start = new Date(data.startDate)
    const end = new Date(data.endDate)
    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      return NextResponse.json({ error: "日付が不正です" }, { status: 400 })
    }

    // Guard against sprint sprawl: don't allow creating a new sprint while a
    // planning or active one already exists in this project. The PO/SM must
    // finish or archive existing work first.
    const blocker = await prisma.sprint.findFirst({
      where: { projectId, status: { in: ["planning", "active"] } },
      select: { id: true, sprintName: true, status: true },
    })
    if (blocker) {
      return NextResponse.json(
        {
          error: "進行中または計画中のスプリントが既にあります",
          blocker,
        },
        { status: 409 }
      )
    }

    const sprint = await prisma.sprint.create({
      data: {
        projectId,
        sprintName: data.sprintName,
        startDate: start,
        endDate: end,
        sprintGoal: data.sprintGoal,
        capacity: data.capacity ?? 0,
        status: "planning",
        items: data.selectedPbIds && data.selectedPbIds.length > 0
          ? {
              create: data.selectedPbIds.map((pbItemId) => ({
                pbItemId,
                status: "todo",
              })),
            }
          : undefined,
      },
      include: { items: { include: { pbItem: true } } },
    })

    return NextResponse.json(sprint, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues }, { status: 400 })
    }
    console.error("Sprint CREATE error:", error)
    return NextResponse.json({ error: "作成に失敗しました" }, { status: 500 })
  }
}
