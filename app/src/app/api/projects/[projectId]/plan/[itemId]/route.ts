import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireProjectMember } from "@/lib/api-helpers"
import { recalcPlanProgress, statusToProgress } from "@/lib/plan-progress"
import { z } from "zod"

const updateSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  parentId: z.string().nullable().optional(),
  plannedStart: z.string().optional(),
  plannedEnd: z.string().optional(),
  actualStart: z.string().nullable().optional(),
  actualEnd: z.string().nullable().optional(),
  isMilestone: z.boolean().optional(),
  color: z.string().max(32).nullable().optional(),
  status: z.enum(["not_started", "in_progress", "done", "on_hold", "delayed"]).optional(),
  sortOrder: z.number().int().optional(),
  description: z.string().max(10000).nullable().optional(),
  notes: z.string().max(10000).nullable().optional(),
})

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ projectId: string; itemId: string }> }
) {
  const { projectId, itemId } = await params
  const result = await requireProjectMember(projectId, { roles: ["po", "sm"] })
  if ("error" in result) return result.error

  try {
    const body = await request.json()
    const data = updateSchema.parse(body)

    const existing = await prisma.planItem.findFirst({
      where: { id: itemId, projectId },
    })
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 })

    // Guard against cycles when reparenting.
    if (data.parentId !== undefined && data.parentId !== null) {
      if (data.parentId === itemId) {
        return NextResponse.json({ error: "自分自身を親にできません" }, { status: 400 })
      }
      // Walk up from the proposed parent to make sure we don't loop back to itemId.
      let cursor: string | null = data.parentId
      while (cursor) {
        if (cursor === itemId) {
          return NextResponse.json({ error: "循環参照になります" }, { status: 400 })
        }
        const parent: { parentId: string | null } | null = await prisma.planItem.findFirst({
          where: { id: cursor, projectId },
          select: { parentId: true },
        })
        cursor = parent?.parentId ?? null
      }
    }

    const updateData: Record<string, unknown> = {}
    if (data.name !== undefined) updateData.name = data.name
    if (data.description !== undefined) updateData.description = data.description
    if (data.notes !== undefined) updateData.notes = data.notes
    if (data.parentId !== undefined) updateData.parentId = data.parentId
    if (data.plannedStart) updateData.plannedStart = new Date(data.plannedStart)
    if (data.plannedEnd) updateData.plannedEnd = new Date(data.plannedEnd)
    if (data.actualStart !== undefined) {
      updateData.actualStart = data.actualStart ? new Date(data.actualStart) : null
    }
    if (data.actualEnd !== undefined) {
      updateData.actualEnd = data.actualEnd ? new Date(data.actualEnd) : null
    }
    if (data.isMilestone !== undefined) updateData.isMilestone = data.isMilestone
    if (data.color !== undefined) updateData.color = data.color
    if (data.status !== undefined) {
      updateData.status = data.status
      // Re-derive progress only if this turns out to be a leaf (no children).
      // We can't know synchronously without a count, so always recompute via
      // recalcPlanProgress below.
    }
    if (data.sortOrder !== undefined) updateData.sortOrder = data.sortOrder

    const updated = await prisma.planItem.update({
      where: { id: itemId },
      data: updateData,
    })

    // If status changed and the item is a leaf, eagerly set its progress so
    // recalc has fresh input; otherwise recalc will overwrite this anyway.
    if (data.status !== undefined) {
      const childrenCount = await prisma.planItem.count({ where: { parentId: itemId } })
      if (childrenCount === 0) {
        await prisma.planItem.update({
          where: { id: itemId },
          data: { progressPct: statusToProgress(data.status) },
        })
      }
    }

    // Walk both old and new parents up so both trees rebalance.
    const ancestorStart: string[] = [itemId]
    if (existing.parentId) ancestorStart.push(existing.parentId)
    if (data.parentId !== undefined && data.parentId && data.parentId !== existing.parentId) {
      ancestorStart.push(data.parentId)
    }
    await recalcPlanProgress(projectId, ancestorStart)

    return NextResponse.json(updated)
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues }, { status: 400 })
    }
    console.error("PlanItem PATCH error:", error)
    return NextResponse.json({ error: "更新に失敗しました" }, { status: 500 })
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ projectId: string; itemId: string }> }
) {
  const { projectId, itemId } = await params
  const result = await requireProjectMember(projectId, { roles: ["po", "sm"] })
  if ("error" in result) return result.error

  const existing = await prisma.planItem.findFirst({
    where: { id: itemId, projectId },
    select: { id: true, parentId: true },
  })
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 })

  await prisma.planItem.delete({ where: { id: itemId } })

  if (existing.parentId) {
    await recalcPlanProgress(projectId, [existing.parentId])
  }

  return NextResponse.json({ success: true })
}
