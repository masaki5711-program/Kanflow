import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireProjectMember } from "@/lib/api-helpers"
import { z } from "zod"

const importSchema = z.object({
  pbItemIds: z.array(z.string()).min(1),
  planVersion: z.string().max(100).optional(),
})

export async function POST(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params
  const result = await requireProjectMember(projectId, { roles: ["po"] })
  if ("error" in result) return result.error

  try {
    const body = await request.json()
    const data = importSchema.parse(body)

    const pbItems = await prisma.productBacklogItem.findMany({
      where: { id: { in: data.pbItemIds }, projectId },
    })

    if (pbItems.length === 0) {
      return NextResponse.json({ error: "該当するPBIがありません" }, { status: 404 })
    }

    const created = await prisma.$transaction(
      pbItems.map((pb) =>
        prisma.releaseBacklogItem.create({
          data: {
            projectId,
            planVersion: data.planVersion,
            pbItemId: pb.id,
            initiative: pb.initiative,
            epic: pb.epic,
            userStory: pb.userStory,
            assignedPo: pb.assignedPo,
            poNote: pb.poNote,
            status: "staged",
          },
        })
      )
    )

    return NextResponse.json({ created: created.length }, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues }, { status: 400 })
    }
    console.error("Release import error:", error)
    return NextResponse.json({ error: "取り込みに失敗しました" }, { status: 500 })
  }
}
