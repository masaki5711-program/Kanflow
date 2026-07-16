import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireProjectAccess } from "@/lib/api-helpers"
import { z } from "zod"

const updateSchema = z.object({
  author: z.string().max(200).optional(),
  request: z.string().min(1).max(5000).optional(),
  background: z.string().max(5000).nullable().optional(),
  status: z.enum(["unreviewed", "reviewed", "completed", "frozen"]).optional(),
  assignedPo: z.string().max(200).nullable().optional(),
  poHearingMemo: z.string().max(5000).nullable().optional(),
  poReviewMemo: z.string().max(5000).nullable().optional(),
  rejectionReason: z.string().max(5000).nullable().optional(),
  freezeReason: z.string().max(5000).nullable().optional(),
  policyDoc: z.string().max(10000).nullable().optional(),
  planningDoc: z.string().max(10000).nullable().optional(),
  pbEpic: z.string().max(500).nullable().optional(),
  poFlag: z.string().max(100).nullable().optional(),
  sortOrder: z.number().int().optional(),
})

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ projectId: string; itemId: string }> }
) {
  const { projectId, itemId } = await params
  const result = await requireProjectAccess(projectId, "icebox")
  if ("error" in result) return result.error

  try {
    const body = await request.json()
    const data = updateSchema.parse(body)

    const item = await prisma.iceboxItem.update({
      where: { id: itemId, projectId },
      data,
      include: { attachments: true },
    })

    return NextResponse.json(item)
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues }, { status: 400 })
    }
    console.error("Icebox PATCH error:", error)
    return NextResponse.json({ error: "更新に失敗しました" }, { status: 500 })
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ projectId: string; itemId: string }> }
) {
  const { projectId, itemId } = await params
  const result = await requireProjectAccess(projectId, "icebox")
  if ("error" in result) return result.error

  try {
    await prisma.iceboxItem.delete({ where: { id: itemId, projectId } })
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Icebox DELETE error:", error)
    return NextResponse.json({ error: "削除に失敗しました" }, { status: 500 })
  }
}
