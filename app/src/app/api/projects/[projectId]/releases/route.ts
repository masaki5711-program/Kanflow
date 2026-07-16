import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireProjectAccess } from "@/lib/api-helpers"

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params
  const result = await requireProjectAccess(projectId, "read")
  if ("error" in result) return result.error

  const items = await prisma.releaseBacklogItem.findMany({
    where: { projectId },
    include: {
      pbItem: {
        select: {
          id: true,
          displayId: true,
          userStory: true,
          epic: true,
          initiative: true,
          workloadScore: true,
        },
      },
    },
    orderBy: [{ planVersion: "asc" }, { createdAt: "asc" }],
  })

  return NextResponse.json(items)
}
