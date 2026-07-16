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

    // Prevent demoting the last PO — the project must always have at least one.
    if (data.role !== "po") {
      const target = await prisma.projectMember.findFirst({
        where: { id: memberId, projectId },
        select: { role: true },
      })
      if (target?.role === "po") {
        const poCount = await prisma.projectMember.count({
          where: { projectId, role: "po" },
        })
        if (poCount <= 1) {
          return NextResponse.json(
            { error: "最後のPOを降格することはできません。先に別のメンバーをPOに昇格してください。" },
            { status: 400 }
          )
        }
      }
    }

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

  // Prevent removing the last PO.
  const target = await prisma.projectMember.findFirst({
    where: { id: memberId, projectId },
    select: { role: true },
  })
  if (target?.role === "po") {
    const poCount = await prisma.projectMember.count({
      where: { projectId, role: "po" },
    })
    if (poCount <= 1) {
      return NextResponse.json(
        { error: "最後のPOを削除することはできません。先に別のメンバーをPOに昇格してください。" },
        { status: 400 }
      )
    }
  }

  try {
    await prisma.projectMember.delete({ where: { id: memberId, projectId } })
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Member DELETE error:", error)
    return NextResponse.json({ error: "削除に失敗しました" }, { status: 500 })
  }
}
