import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireProjectAccess, requireProjectMember } from "@/lib/api-helpers"
import { recalcPlanProgress, statusToProgress } from "@/lib/plan-progress"
import { z } from "zod"

const createSchema = z.object({
  name: z.string().min(1).max(255),
  parentId: z.string().nullable().optional(),
  plannedStart: z.string(),
  plannedEnd: z.string(),
  isMilestone: z.boolean().optional(),
  color: z.string().max(32).nullable().optional(),
  status: z.enum(["not_started", "in_progress", "done", "on_hold", "delayed"]).optional(),
  description: z.string().max(10000).nullable().optional(),
})

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params
  const access = await requireProjectAccess(projectId, "read")
  if ("error" in access) return access.error

  const items = await prisma.planItem.findMany({
    where: { projectId },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
  })
  return NextResponse.json(items)
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
    const data = createSchema.parse(body)

    const plannedStart = new Date(data.plannedStart)
    const plannedEnd = new Date(data.plannedEnd)
    if (isNaN(plannedStart.getTime()) || isNaN(plannedEnd.getTime())) {
      return NextResponse.json({ error: "日付が不正です" }, { status: 400 })
    }

    if (data.parentId) {
      const parent = await prisma.planItem.findFirst({
        where: { id: data.parentId, projectId },
        select: { id: true },
      })
      if (!parent) return NextResponse.json({ error: "親項目が見つかりません" }, { status: 400 })
    }

    const maxOrder = await prisma.planItem.aggregate({
      where: { projectId, parentId: data.parentId ?? null },
      _max: { sortOrder: true },
    })

    const status = data.status ?? "not_started"
    const item = await prisma.planItem.create({
      data: {
        projectId,
        parentId: data.parentId ?? null,
        name: data.name,
        description: data.description ?? null,
        plannedStart,
        plannedEnd,
        isMilestone: data.isMilestone ?? false,
        color: data.color ?? null,
        status,
        progressPct: statusToProgress(status),
        sortOrder: (maxOrder._max.sortOrder ?? 0) + 1,
      },
    })

    if (item.parentId) {
      await recalcPlanProgress(projectId, [item.parentId])
    }

    return NextResponse.json(item, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues }, { status: 400 })
    }
    console.error("PlanItem CREATE error:", error)
    return NextResponse.json({ error: "作成に失敗しました" }, { status: 500 })
  }
}
