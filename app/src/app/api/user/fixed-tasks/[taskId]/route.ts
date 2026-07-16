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
  { params }: { params: Promise<{ taskId: string }> }
) {
  const gate = await requireAuth()
  if ("error" in gate) return gate.error
  const { taskId } = await params

  try {
    const body = await request.json()
    const data = updateSchema.parse(body)

    const existing = await prisma.userFixedTask.findFirst({
      where: { id: taskId, userId: gate.session.user.id },
    })
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 })

    const task = await prisma.userFixedTask.update({
      where: { id: taskId },
      data,
    })

    return NextResponse.json(task)
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues }, { status: 400 })
    }
    console.error("FixedTask PATCH error:", error)
    return NextResponse.json({ error: "更新に失敗しました" }, { status: 500 })
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ taskId: string }> }
) {
  const gate = await requireAuth()
  if ("error" in gate) return gate.error
  const { taskId } = await params

  const existing = await prisma.userFixedTask.findFirst({
    where: { id: taskId, userId: gate.session.user.id },
  })
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 })

  await prisma.userFixedTask.delete({ where: { id: taskId } })
  return NextResponse.json({ success: true })
}
