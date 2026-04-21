import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireProjectMember } from "@/lib/api-helpers"
import { z } from "zod"

const updateSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().max(5000).nullable().optional(),
})

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ projectId: string; goalId: string }> }
) {
  const { projectId, goalId } = await params
  const result = await requireProjectMember(projectId, { roles: ["po", "sm"] })
  if ("error" in result) return result.error

  try {
    const body = await request.json()
    const data = updateSchema.parse(body)

    const goal = await prisma.productGoal.update({
      where: { id: goalId, projectId },
      data,
    })

    return NextResponse.json(goal)
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues }, { status: 400 })
    }
    console.error("Goal PATCH error:", error)
    return NextResponse.json({ error: "更新に失敗しました" }, { status: 500 })
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ projectId: string; goalId: string }> }
) {
  const { projectId, goalId } = await params
  const result = await requireProjectMember(projectId, { roles: ["po", "sm"] })
  if ("error" in result) return result.error

  try {
    await prisma.productGoal.delete({ where: { id: goalId, projectId } })
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Goal DELETE error:", error)
    return NextResponse.json({ error: "削除に失敗しました" }, { status: 500 })
  }
}
