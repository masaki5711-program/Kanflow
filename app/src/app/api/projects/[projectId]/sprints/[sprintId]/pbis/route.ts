import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireProjectMember } from "@/lib/api-helpers"
import { recalcSprintActualScore } from "@/lib/sprint-score"
import { z } from "zod"

const addSchema = z.object({
  pbIds: z.array(z.string().min(1)).min(1).max(50),
})

/**
 * Attach product-backlog items to an existing sprint by inserting one empty
 * placeholder SprintBacklogItem per pbId (taskName null). The client's task
 * add flow then creates real tasks under each PB.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ projectId: string; sprintId: string }> }
) {
  const { projectId, sprintId } = await params
  const result = await requireProjectMember(projectId, { roles: ["po", "sm"] })
  if ("error" in result) return result.error

  try {
    const body = await request.json()
    const data = addSchema.parse(body)

    const sprint = await prisma.sprint.findFirst({
      where: { id: sprintId, projectId },
      select: { id: true, items: { select: { pbItemId: true } } },
    })
    if (!sprint) return NextResponse.json({ error: "Sprint not found" }, { status: 404 })

    const validPbs = await prisma.productBacklogItem.findMany({
      where: { id: { in: data.pbIds }, projectId },
      select: { id: true },
    })
    const existing = new Set(sprint.items.map((i) => i.pbItemId))
    const toAdd = validPbs.map((p) => p.id).filter((id) => !existing.has(id))

    if (toAdd.length === 0) {
      return NextResponse.json({ added: 0, skipped: data.pbIds.length }, { status: 200 })
    }

    await prisma.sprintBacklogItem.createMany({
      data: toAdd.map((pbItemId) => ({
        sprintId,
        pbItemId,
        status: "todo",
      })),
    })

    await recalcSprintActualScore(sprintId)

    const created = await prisma.sprintBacklogItem.findMany({
      where: { sprintId, pbItemId: { in: toAdd }, taskName: null },
      include: { pbItem: true },
    })

    return NextResponse.json({
      added: toAdd.length,
      skipped: data.pbIds.length - toAdd.length,
      items: created,
    }, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues }, { status: 400 })
    }
    console.error("Sprint PBI add error:", error)
    return NextResponse.json({ error: "追加に失敗しました" }, { status: 500 })
  }
}

const removeSchema = z.object({
  pbItemId: z.string().min(1),
})

/**
 * Detach a PBI from the sprint: removes the placeholder plus any real tasks.
 * Dangerous — requires PO/SM and will delete tasks as well.
 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ projectId: string; sprintId: string }> }
) {
  const { projectId, sprintId } = await params
  const result = await requireProjectMember(projectId, { roles: ["po", "sm"] })
  if ("error" in result) return result.error

  try {
    const body = await request.json()
    const data = removeSchema.parse(body)

    const sprint = await prisma.sprint.findFirst({
      where: { id: sprintId, projectId },
      select: { id: true },
    })
    if (!sprint) return NextResponse.json({ error: "Sprint not found" }, { status: 404 })

    const res = await prisma.sprintBacklogItem.deleteMany({
      where: { sprintId, pbItemId: data.pbItemId },
    })

    await recalcSprintActualScore(sprintId)

    return NextResponse.json({ removed: res.count })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues }, { status: 400 })
    }
    console.error("Sprint PBI remove error:", error)
    return NextResponse.json({ error: "削除に失敗しました" }, { status: 500 })
  }
}
