import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAuth } from "@/lib/api-helpers"
import { z } from "zod"

const createSchema = z.object({
  taskName: z.string().min(1).max(200),
})

export async function POST(
  request: Request,
  { params }: { params: Promise<{ taskId: string }> }
) {
  const gate = await requireAuth()
  if ("error" in gate) return gate.error
  const { taskId } = await params

  try {
    const body = await request.json()
    const data = createSchema.parse(body)

    const group = await prisma.userFixedTask.findFirst({
      where: { id: taskId, userId: gate.session.user.id },
      select: { id: true },
    })
    if (!group) return NextResponse.json({ error: "Not found" }, { status: 404 })

    const maxOrder = await prisma.userFixedTaskItem.aggregate({
      where: { groupId: taskId },
      _max: { sortOrder: true },
    })

    const item = await prisma.userFixedTaskItem.create({
      data: {
        groupId: taskId,
        taskName: data.taskName,
        sortOrder: (maxOrder._max.sortOrder ?? 0) + 1,
      },
    })

    return NextResponse.json(item, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues }, { status: 400 })
    }
    console.error("FixedTaskItem CREATE error:", error)
    return NextResponse.json({ error: "作成に失敗しました" }, { status: 500 })
  }
}
