import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireProjectMember } from "@/lib/api-helpers"
import { z } from "zod"

const patchSchema = z.object({
  date: z.string().min(1).optional(),
  content: z.string().min(1).max(20000).optional(),
  archived: z.boolean().optional(),
})

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ projectId: string; sprintId: string; noteId: string }> }
) {
  const { projectId, sprintId, noteId } = await params
  const result = await requireProjectMember(projectId)
  if ("error" in result) return result.error

  const existing = await prisma.dailyScrumNote.findFirst({
    where: { id: noteId, sprintId, sprint: { projectId } },
  })
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 })

  try {
    const body = await request.json()
    const data = patchSchema.parse(body)

    const updateData: Record<string, unknown> = {}
    if (data.content !== undefined) updateData.content = data.content
    if (data.date !== undefined) {
      const dateObj = new Date(data.date)
      if (isNaN(dateObj.getTime())) {
        return NextResponse.json({ error: "日付が不正です" }, { status: 400 })
      }
      updateData.date = dateObj
    }
    if (data.archived !== undefined) {
      updateData.archivedAt = data.archived ? new Date() : null
    }

    const note = await prisma.dailyScrumNote.update({
      where: { id: noteId },
      data: updateData,
    })
    return NextResponse.json(note)
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues }, { status: 400 })
    }
    console.error("DailyScrum PATCH error:", error)
    return NextResponse.json({ error: "更新に失敗しました" }, { status: 500 })
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ projectId: string; sprintId: string; noteId: string }> }
) {
  const { projectId, sprintId, noteId } = await params
  const result = await requireProjectMember(projectId)
  if ("error" in result) return result.error

  const existing = await prisma.dailyScrumNote.findFirst({
    where: { id: noteId, sprintId, sprint: { projectId } },
  })
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 })

  await prisma.dailyScrumNote.delete({ where: { id: noteId } })
  return NextResponse.json({ success: true })
}
