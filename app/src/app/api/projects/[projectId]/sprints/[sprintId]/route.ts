import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireProjectMember, requireProjectAccess } from "@/lib/api-helpers"
import { z } from "zod"

const updateSchema = z.object({
  sprintName: z.string().min(1).max(200).optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  sprintGoal: z.string().max(5000).nullable().optional(),
  capacity: z.number().int().min(0).optional(),
  status: z.enum(["planning", "active", "review", "done", "archived"]).optional(),
  reviewComment: z.string().max(10000).nullable().optional(),
  retrospectiveMemo: z.string().max(10000).nullable().optional(),
  retrospectiveKeep: z.string().max(10000).nullable().optional(),
  retrospectiveProblem: z.string().max(10000).nullable().optional(),
  retrospectiveTry: z.string().max(10000).nullable().optional(),
})

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ projectId: string; sprintId: string }> }
) {
  const { projectId, sprintId } = await params
  const result = await requireProjectAccess(projectId, "read")
  if ("error" in result) return result.error

  const sprint = await prisma.sprint.findFirst({
    where: { id: sprintId, projectId },
    include: {
      items: { include: { pbItem: true } },
    },
  })
  if (!sprint) return NextResponse.json({ error: "Not found" }, { status: 404 })
  return NextResponse.json(sprint)
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ projectId: string; sprintId: string }> }
) {
  const { projectId, sprintId } = await params
  const result = await requireProjectMember(projectId, { roles: ["po", "sm"] })
  if ("error" in result) return result.error

  try {
    const body = await request.json()
    const data = updateSchema.parse(body)

    const updateData: Record<string, unknown> = { ...data }
    if (data.startDate) updateData.startDate = new Date(data.startDate)
    if (data.endDate) updateData.endDate = new Date(data.endDate)
    // Auto-archive on "done" — the UX treats done and archived as one step.
    // The KPT dialog is still triggered when transitioning to "done"; by the
    // time the PATCH is received, we promote it directly to "archived".
    if (data.status === "done") {
      updateData.status = "archived"
    }

    const sprint = await prisma.sprint.update({
      where: { id: sprintId, projectId },
      data: updateData,
      include: { items: { include: { pbItem: true } } },
    })

    return NextResponse.json(sprint)
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues }, { status: 400 })
    }
    console.error("Sprint PATCH error:", error)
    return NextResponse.json({ error: "更新に失敗しました" }, { status: 500 })
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ projectId: string; sprintId: string }> }
) {
  const { projectId, sprintId } = await params
  const result = await requireProjectMember(projectId, { roles: ["po", "sm"] })
  if ("error" in result) return result.error

  try {
    await prisma.sprint.delete({ where: { id: sprintId, projectId } })
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Sprint DELETE error:", error)
    return NextResponse.json({ error: "削除に失敗しました" }, { status: 500 })
  }
}
