import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAuth } from "@/lib/api-helpers"
import { z } from "zod"

const createSchema = z.object({
  name: z.string().min(1).max(50),
  color: z.string().min(1).max(20),
})

export async function GET() {
  const gate = await requireAuth()
  if ("error" in gate) return gate.error

  const categories = await prisma.userProjectCategory.findMany({
    where: { userId: gate.session.user.id },
    include: { assignments: { select: { projectId: true } } },
    orderBy: { sortOrder: "asc" },
  })

  return NextResponse.json(categories)
}

export async function POST(request: Request) {
  const gate = await requireAuth()
  if ("error" in gate) return gate.error

  try {
    const body = await request.json()
    const data = createSchema.parse(body)

    const existing = await prisma.userProjectCategory.findUnique({
      where: { userId_name: { userId: gate.session.user.id, name: data.name } },
    })
    if (existing) {
      return NextResponse.json({ error: "同じ名前のカテゴリが既にあります" }, { status: 409 })
    }

    const maxOrder = await prisma.userProjectCategory.aggregate({
      where: { userId: gate.session.user.id },
      _max: { sortOrder: true },
    })

    const category = await prisma.userProjectCategory.create({
      data: {
        userId: gate.session.user.id,
        name: data.name,
        color: data.color,
        sortOrder: (maxOrder._max.sortOrder ?? 0) + 1,
      },
      include: { assignments: { select: { projectId: true } } },
    })

    return NextResponse.json(category, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues }, { status: 400 })
    }
    console.error("Category CREATE error:", error)
    return NextResponse.json({ error: "作成に失敗しました" }, { status: 500 })
  }
}
