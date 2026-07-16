import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireProjectMember } from "@/lib/api-helpers"
import { recalcPlanProgress } from "@/lib/plan-progress"
import { z } from "zod"

const bodySchema = z.object({
  updates: z
    .array(
      z.object({
        id: z.string(),
        parentId: z.string().nullable(),
        sortOrder: z.number().int(),
      })
    )
    .min(1)
    .max(2000),
})

export async function POST(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params
  const result = await requireProjectMember(projectId, { roles: ["po", "sm"] })
  if ("error" in result) return result.error

  try {
    const body = await request.json()
    const { updates } = bodySchema.parse(body)

    // Collect affected parents (old + new) so progress rolls up correctly
    // after the reparenting fan-out.
    const ids = updates.map((u) => u.id)
    const existing = await prisma.planItem.findMany({
      where: { id: { in: ids }, projectId },
      select: { id: true, parentId: true },
    })
    if (existing.length !== ids.length) {
      return NextResponse.json({ error: "対象の項目が見つかりません" }, { status: 400 })
    }

    await prisma.$transaction(
      updates.map((u) =>
        prisma.planItem.update({
          where: { id: u.id },
          data: { parentId: u.parentId, sortOrder: u.sortOrder },
        })
      )
    )

    const affected = new Set<string>()
    for (const e of existing) {
      if (e.parentId) affected.add(e.parentId)
    }
    for (const u of updates) {
      if (u.parentId) affected.add(u.parentId)
    }
    if (affected.size > 0) {
      await recalcPlanProgress(projectId, Array.from(affected))
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues }, { status: 400 })
    }
    console.error("PlanItem reorder error:", error)
    return NextResponse.json({ error: "並び替えに失敗しました" }, { status: 500 })
  }
}
