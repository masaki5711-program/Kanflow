import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAuth } from "@/lib/api-helpers"
import { z } from "zod"

const updateSchema = z.object({
  name: z.string().min(1).max(50).optional(),
  color: z.string().min(1).max(20).optional(),
  sortOrder: z.number().int().optional(),
})

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ categoryId: string }> }
) {
  const gate = await requireAuth()
  if ("error" in gate) return gate.error
  const { categoryId } = await params

  try {
    const body = await request.json()
    const data = updateSchema.parse(body)

    const existing = await prisma.userProjectCategory.findFirst({
      where: { id: categoryId, userId: gate.session.user.id },
    })
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 })

    if (data.name && data.name !== existing.name) {
      const dup = await prisma.userProjectCategory.findUnique({
        where: { userId_name: { userId: gate.session.user.id, name: data.name } },
      })
      if (dup) {
        return NextResponse.json({ error: "同じ名前のカテゴリが既にあります" }, { status: 409 })
      }
    }

    const category = await prisma.userProjectCategory.update({
      where: { id: categoryId },
      data,
      include: { assignments: { select: { projectId: true } } },
    })

    return NextResponse.json(category)
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues }, { status: 400 })
    }
    console.error("Category PATCH error:", error)
    return NextResponse.json({ error: "更新に失敗しました" }, { status: 500 })
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ categoryId: string }> }
) {
  const gate = await requireAuth()
  if ("error" in gate) return gate.error
  const { categoryId } = await params

  const existing = await prisma.userProjectCategory.findFirst({
    where: { id: categoryId, userId: gate.session.user.id },
  })
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 })

  await prisma.userProjectCategory.delete({ where: { id: categoryId } })
  return NextResponse.json({ success: true })
}
