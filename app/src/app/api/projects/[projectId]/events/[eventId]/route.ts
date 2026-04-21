import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireProjectMember } from "@/lib/api-helpers"
import { z } from "zod"

const updateSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().max(5000).nullable().optional(),
  date: z.string().optional(),
  endDate: z.string().nullable().optional(),
  color: z.string().max(20).optional(),
  allDay: z.boolean().optional(),
  sprintId: z.string().nullable().optional(),
})

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ projectId: string; eventId: string }> }
) {
  const { projectId, eventId } = await params
  const result = await requireProjectMember(projectId)
  if ("error" in result) return result.error

  try {
    const body = await request.json()
    const data = updateSchema.parse(body)

    const updateData: Record<string, unknown> = { ...data }
    if (data.date) updateData.date = new Date(data.date)
    if (data.endDate !== undefined) {
      updateData.endDate = data.endDate ? new Date(data.endDate) : null
    }
    if (data.sprintId !== undefined) {
      updateData.sprintId = data.sprintId || null
    }

    const event = await prisma.calendarEvent.update({
      where: { id: eventId, projectId },
      data: updateData,
    })

    return NextResponse.json(event)
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues }, { status: 400 })
    }
    console.error("Event PATCH error:", error)
    return NextResponse.json({ error: "更新に失敗しました" }, { status: 500 })
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ projectId: string; eventId: string }> }
) {
  const { projectId, eventId } = await params
  const result = await requireProjectMember(projectId)
  if ("error" in result) return result.error

  try {
    await prisma.calendarEvent.delete({ where: { id: eventId, projectId } })
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Event DELETE error:", error)
    return NextResponse.json({ error: "削除に失敗しました" }, { status: 500 })
  }
}
