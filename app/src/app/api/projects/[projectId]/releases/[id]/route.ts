import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireProjectMember } from "@/lib/api-helpers"
import { z } from "zod"

const updateSchema = z.object({
  planVersion: z.string().max(100).nullable().optional(),
  releaseVersion: z.string().max(100).nullable().optional(),
  releaseDate: z.string().nullable().optional(),
  releaseNote: z.string().max(20000).nullable().optional(),
  manualLink: z.string().max(2000).nullable().optional(),
  poNote: z.string().max(10000).nullable().optional(),
  assignedPo: z.string().max(200).nullable().optional(),
  initiative: z.string().max(500).nullable().optional(),
  epic: z.string().max(500).nullable().optional(),
  userStory: z.string().max(5000).nullable().optional(),
  status: z.enum(["staged", "ready", "released", "deferred"]).optional(),
})

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ projectId: string; id: string }> }
) {
  const { projectId, id } = await params
  const result = await requireProjectMember(projectId, { roles: ["po"] })
  if ("error" in result) return result.error

  try {
    const body = await request.json()
    const data = updateSchema.parse(body)

    const updateData: Record<string, unknown> = { ...data }
    if (data.releaseDate !== undefined) {
      updateData.releaseDate = data.releaseDate ? new Date(data.releaseDate) : null
    }

    const item = await prisma.releaseBacklogItem.update({
      where: { id, projectId },
      data: updateData,
    })

    return NextResponse.json(item)
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues }, { status: 400 })
    }
    console.error("Release PATCH error:", error)
    return NextResponse.json({ error: "更新に失敗しました" }, { status: 500 })
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ projectId: string; id: string }> }
) {
  const { projectId, id } = await params
  const result = await requireProjectMember(projectId, { roles: ["po"] })
  if ("error" in result) return result.error

  try {
    await prisma.releaseBacklogItem.delete({ where: { id, projectId } })
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Release DELETE error:", error)
    return NextResponse.json({ error: "削除に失敗しました" }, { status: 500 })
  }
}
