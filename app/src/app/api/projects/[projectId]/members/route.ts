import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireProjectMember } from "@/lib/api-helpers"
import { z } from "zod"

const addSchema = z.object({
  email: z.string().email(),
  role: z.enum(["po", "sm", "dev"]),
})

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params
  const result = await requireProjectMember(projectId)
  if ("error" in result) return result.error

  const members = await prisma.projectMember.findMany({
    where: { projectId },
    include: {
      user: { select: { id: true, name: true, email: true } },
    },
    orderBy: { joinedAt: "asc" },
  })

  return NextResponse.json(members)
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params
  const result = await requireProjectMember(projectId, { roles: ["po", "sm"] })
  if ("error" in result) return result.error

  try {
    const body = await request.json()
    const data = addSchema.parse(body)

    const user = await prisma.user.findUnique({ where: { email: data.email } })
    if (!user) {
      return NextResponse.json({ error: "ユーザーが見つかりません" }, { status: 404 })
    }
    if (!user.isActive) {
      return NextResponse.json({ error: "無効化されたユーザーです" }, { status: 400 })
    }

    const existing = await prisma.projectMember.findFirst({
      where: { projectId, userId: user.id },
    })
    if (existing) {
      return NextResponse.json({ error: "既にメンバーです" }, { status: 409 })
    }

    const member = await prisma.projectMember.create({
      data: { projectId, userId: user.id, role: data.role },
      include: { user: { select: { id: true, name: true, email: true } } },
    })

    return NextResponse.json(member, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues }, { status: 400 })
    }
    console.error("Member CREATE error:", error)
    return NextResponse.json({ error: "追加に失敗しました" }, { status: 500 })
  }
}
