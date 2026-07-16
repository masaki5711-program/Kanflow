import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireProjectMember } from "@/lib/api-helpers"
import { recalcSprintActualScore } from "@/lib/sprint-score"
import { syncPbiStatusFromTasks } from "@/lib/pbi-status-sync"
import { z } from "zod"

const createSchema = z.object({
  pbItemId: z.string().min(1),
  taskName: z.string().max(500).optional(),
  assignee: z.string().max(200).nullable().optional(),
  estimatedHours: z.number().nullable().optional(),
})

export async function POST(
  request: Request,
  { params }: { params: Promise<{ projectId: string; sprintId: string }> }
) {
  const { projectId, sprintId } = await params
  const result = await requireProjectMember(projectId)
  if ("error" in result) return result.error

  try {
    const body = await request.json()
    const data = createSchema.parse(body)

    const sprint = await prisma.sprint.findFirst({
      where: { id: sprintId, projectId },
      select: { id: true },
    })
    if (!sprint) return NextResponse.json({ error: "Not found" }, { status: 404 })

    const pb = await prisma.productBacklogItem.findFirst({
      where: { id: data.pbItemId, projectId },
      select: { id: true },
    })
    if (!pb) return NextResponse.json({ error: "PBI not found" }, { status: 404 })

    const task = await prisma.sprintBacklogItem.create({
      data: {
        sprintId,
        pbItemId: data.pbItemId,
        taskName: data.taskName,
        assignee: data.assignee ?? null,
        estimatedHours: data.estimatedHours ?? null,
        status: "todo",
      },
      include: { pbItem: true },
    })

    await recalcSprintActualScore(sprintId)
    await syncPbiStatusFromTasks(data.pbItemId)

    return NextResponse.json(task, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues }, { status: 400 })
    }
    console.error("Sprint task CREATE error:", error)
    return NextResponse.json({ error: "作成に失敗しました" }, { status: 500 })
  }
}
