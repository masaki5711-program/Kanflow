import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireProjectMember } from "@/lib/api-helpers"
import { recalcSprintActualScore } from "@/lib/sprint-score"
import { z } from "zod"

const updateSchema = z.object({
  taskName: z.string().max(500).optional(),
  assignee: z.string().max(200).nullable().optional(),
  estimatedHours: z.number().nullable().optional(),
  actualHours: z.number().nullable().optional(),
  status: z.enum(["todo", "in_progress", "review", "done"]).optional(),
})

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ projectId: string; sprintId: string; taskId: string }> }
) {
  const { projectId, sprintId, taskId } = await params
  const result = await requireProjectMember(projectId)
  if ("error" in result) return result.error

  try {
    const body = await request.json()
    const data = updateSchema.parse(body)

    const existing = await prisma.sprintBacklogItem.findFirst({
      where: { id: taskId, sprintId, sprint: { projectId } },
      select: { id: true },
    })
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 })

    const updateData: Record<string, unknown> = { ...data }
    if (data.status === "done") updateData.completedAt = new Date()
    else if (data.status) updateData.completedAt = null

    const task = await prisma.sprintBacklogItem.update({
      where: { id: taskId },
      data: updateData,
      include: { pbItem: true },
    })

    await recalcSprintActualScore(sprintId)

    return NextResponse.json(task)
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues }, { status: 400 })
    }
    console.error("Sprint task PATCH error:", error)
    return NextResponse.json({ error: "更新に失敗しました" }, { status: 500 })
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ projectId: string; sprintId: string; taskId: string }> }
) {
  const { projectId, sprintId, taskId } = await params
  const result = await requireProjectMember(projectId)
  if ("error" in result) return result.error

  const existing = await prisma.sprintBacklogItem.findFirst({
    where: { id: taskId, sprintId, sprint: { projectId } },
    select: { id: true },
  })
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 })

  await prisma.sprintBacklogItem.delete({ where: { id: taskId } })
  await recalcSprintActualScore(sprintId)

  return NextResponse.json({ success: true })
}
