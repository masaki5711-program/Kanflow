import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAuth } from "@/lib/api-helpers"
import { z } from "zod"

const createSchema = z.object({
  taskName: z.string().min(1).max(200),
})

export async function GET() {
  const gate = await requireAuth()
  if ("error" in gate) return gate.error

  const tasks = await prisma.userFixedTask.findMany({
    where: { userId: gate.session.user.id },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    include: {
      items: {
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      },
    },
  })

  return NextResponse.json(tasks)
}

export async function POST(request: Request) {
  const gate = await requireAuth()
  if ("error" in gate) return gate.error

  try {
    const body = await request.json()
    const data = createSchema.parse(body)

    const maxOrder = await prisma.userFixedTask.aggregate({
      where: { userId: gate.session.user.id },
      _max: { sortOrder: true },
    })

    const task = await prisma.userFixedTask.create({
      data: {
        userId: gate.session.user.id,
        taskName: data.taskName,
        sortOrder: (maxOrder._max.sortOrder ?? 0) + 1,
      },
      include: { items: true },
    })

    return NextResponse.json(task, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues }, { status: 400 })
    }
    console.error("FixedTask CREATE error:", error)
    return NextResponse.json({ error: "作成に失敗しました" }, { status: 500 })
  }
}
