import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAuth } from "@/lib/api-helpers"
import { z } from "zod"

const createSchema = z.object({
  projectId: z.string().min(1),
})

async function ensureOwned(userId: string, categoryId: string) {
  return prisma.userProjectCategory.findFirst({
    where: { id: categoryId, userId },
  })
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ categoryId: string }> }
) {
  const gate = await requireAuth()
  if ("error" in gate) return gate.error
  const { categoryId } = await params

  try {
    const body = await request.json()
    const data = createSchema.parse(body)

    const category = await ensureOwned(gate.session.user.id, categoryId)
    if (!category) return NextResponse.json({ error: "Not found" }, { status: 404 })

    // Verify project membership
    const member = await prisma.projectMember.findFirst({
      where: { projectId: data.projectId, userId: gate.session.user.id },
    })
    if (!member) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

    const assignment = await prisma.userProjectCategoryAssignment.upsert({
      where: {
        categoryId_projectId: { categoryId, projectId: data.projectId },
      },
      create: { categoryId, projectId: data.projectId },
      update: {},
    })

    return NextResponse.json(assignment, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues }, { status: 400 })
    }
    console.error("Assignment CREATE error:", error)
    return NextResponse.json({ error: "割当に失敗しました" }, { status: 500 })
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ categoryId: string }> }
) {
  const gate = await requireAuth()
  if ("error" in gate) return gate.error
  const { categoryId } = await params

  const { searchParams } = new URL(request.url)
  const projectId = searchParams.get("projectId")
  if (!projectId) return NextResponse.json({ error: "projectId required" }, { status: 400 })

  const category = await ensureOwned(gate.session.user.id, categoryId)
  if (!category) return NextResponse.json({ error: "Not found" }, { status: 404 })

  await prisma.userProjectCategoryAssignment.deleteMany({
    where: { categoryId, projectId },
  })

  return NextResponse.json({ success: true })
}
