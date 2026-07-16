import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireProjectMember } from "@/lib/api-helpers"
import { z } from "zod"

const createSchema = z.object({
  date: z.string().min(1), // YYYY-MM-DD or ISO
  content: z.string().min(1).max(20000),
})

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ projectId: string; sprintId: string }> }
) {
  const { projectId, sprintId } = await params
  const result = await requireProjectMember(projectId)
  if ("error" in result) return result.error

  const sprint = await prisma.sprint.findFirst({
    where: { id: sprintId, projectId },
    select: { id: true },
  })
  if (!sprint) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const notes = await prisma.dailyScrumNote.findMany({
    where: { sprintId },
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
  })
  return NextResponse.json(notes)
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ projectId: string; sprintId: string }> }
) {
  const { projectId, sprintId } = await params
  const result = await requireProjectMember(projectId)
  if ("error" in result) return result.error

  try {
    const body = await request.json()
    const data = createSchema.parse(body)

    const sprint = await prisma.sprint.findFirst({
      where: { id: sprintId, projectId },
      select: { id: true },
    })
    if (!sprint) return NextResponse.json({ error: "Sprint not found" }, { status: 404 })

    const dateObj = new Date(data.date)
    if (isNaN(dateObj.getTime())) {
      return NextResponse.json({ error: "日付が不正です" }, { status: 400 })
    }

    const note = await prisma.dailyScrumNote.create({
      data: {
        sprintId,
        date: dateObj,
        content: data.content,
        author: result.session.user.name ?? null,
      },
    })
    return NextResponse.json(note, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues }, { status: 400 })
    }
    console.error("DailyScrum CREATE error:", error)
    return NextResponse.json({ error: "作成に失敗しました" }, { status: 500 })
  }
}
