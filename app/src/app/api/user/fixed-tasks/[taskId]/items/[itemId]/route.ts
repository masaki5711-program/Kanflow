import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAuth } from "@/lib/api-helpers"
import { z } from "zod"

const updateSchema = z.object({
  taskName: z.string().min(1).max(200).optional(),
  sortOrder: z.number().int().optional(),
})

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ taskId: string; itemId: string }> }
) {
  const gate = await requireAuth()
  if ("error" in gate) return gate.error
  const { taskId, itemId } = await params

  try {
    const body = await request.json()
    const data = updateSchema.parse(body)

    const item = await prisma.userFixedTaskItem.findFirst({
      where: { id: itemId, groupId: taskId, group: { userId: gate.session.user.id } },
    })
    if (!item) return NextResponse.json({ error: "Not found" }, { status: 404 })

    const updated = await prisma.userFixedTaskItem.update({
      where: { id: itemId },
      data,
    })

    return NextResponse.json(updated)
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues }, { status: 400 })
    }
    console.error("FixedTaskItem PATCH error:", error)
    return NextResponse.json({ error: "更新に失敗しました" }, { status: 500 })
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ taskId: string; itemId: string }> }
) {
  const gate = await requireAuth()
  if ("error" in gate) return gate.error
  const { taskId, itemId } = await params

  const item = await prisma.userFixedTaskItem.findFirst({
    where: { id: itemId, groupId: taskId, group: { userId: gate.session.user.id } },
  })
  if (!item) return NextResponse.json({ error: "Not found" }, { status: 404 })

  await prisma.userFixedTaskItem.delete({ where: { id: itemId } })
  return NextResponse.json({ success: true })
}
