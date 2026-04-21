import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireProjectMember } from "@/lib/api-helpers"
import { z } from "zod"

const reorderSchema = z.object({
  orderedIds: z.array(z.string()).min(1),
})

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params
  const result = await requireProjectMember(projectId, { roles: ["po"] })
  if ("error" in result) return result.error

  try {
    const body = await request.json()
    const { orderedIds } = reorderSchema.parse(body)

    await prisma.$transaction(
      orderedIds.map((id, index) =>
        prisma.productBacklogItem.updateMany({
          where: { id, projectId },
          data: { sortOrder: index },
        })
      )
    )

    return NextResponse.json({ success: true })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues }, { status: 400 })
    }
    console.error("Backlog reorder error:", error)
    return NextResponse.json({ error: "並び替えに失敗しました" }, { status: 500 })
  }
}
