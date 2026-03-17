import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireProjectMember } from "@/lib/api-helpers"
import { z } from "zod"

const updateSchema = z.object({
  initiative: z.string().optional(),
  epic: z.string().optional(),
  userStory: z.string().optional(),
  acceptanceCriteria: z.string().optional(),
  referenceDoc: z.string().optional(),
  workloadScore: z.number().int().min(0).optional(),
  assignedPo: z.string().optional(),
  poNote: z.string().optional(),
  status: z.enum(["ready", "not_ready", "completed"]).optional(),
  notReadyReason: z.string().optional(),
  sortOrder: z.number().int().optional(),
  productGoalId: z.string().nullable().optional(),
})

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ projectId: string; itemId: string }> }
) {
  const { projectId, itemId } = await params

  const result = await requireProjectMember(projectId, { roles: ["po"] })
  if ("error" in result) return result.error

  try {
    const body = await request.json()
    const data = updateSchema.parse(body)

    if (data.productGoalId === "") data.productGoalId = null

    const updateData = {
      ...data,
      ...(data.status === "completed"
        ? { completedAt: new Date() }
        : data.status ? { completedAt: null } : {}),
    }

    const item = await prisma.productBacklogItem.update({
      where: { id: itemId, projectId },
      data: updateData,
    })

    return NextResponse.json(item)
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues }, { status: 400 })
    }
    return NextResponse.json({ error: "更新に失敗しました" }, { status: 500 })
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ projectId: string; itemId: string }> }
) {
  const { projectId, itemId } = await params

  const result = await requireProjectMember(projectId, { roles: ["po"] })
  if ("error" in result) return result.error

  try {
    await prisma.productBacklogItem.delete({ where: { id: itemId, projectId } })
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Backlog DELETE error:", error)
    return NextResponse.json({ error: "Failed to delete item" }, { status: 500 })
  }
}
