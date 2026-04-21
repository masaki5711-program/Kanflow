import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireProjectMember } from "@/lib/api-helpers"
import { z } from "zod"

const updateSchema = z.object({
  role: z.enum(["po", "sm", "dev"]),
})

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ projectId: string; memberId: string }> }
) {
  const { projectId, memberId } = await params
  const result = await requireProjectMember(projectId, { roles: ["po", "sm"] })
  if ("error" in result) return result.error

  try {
    const body = await request.json()
    const data = updateSchema.parse(body)

    const member = await prisma.projectMember.update({
      where: { id: memberId, projectId },
      data: { role: data.role },
      include: { user: { select: { id: true, name: true, email: true } } },
    })

    return NextResponse.json(member)
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues }, { status: 400 })
    }
    console.error("Member PATCH error:", error)
    return NextResponse.json({ error: "更新に失敗しました" }, { status: 500 })
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ projectId: string; memberId: string }> }
) {
  const { projectId, memberId } = await params
  const result = await requireProjectMember(projectId, { roles: ["po", "sm"] })
  if ("error" in result) return result.error

  try {
    await prisma.projectMember.delete({ where: { id: memberId, projectId } })
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Member DELETE error:", error)
    return NextResponse.json({ error: "削除に失敗しました" }, { status: 500 })
  }
}
