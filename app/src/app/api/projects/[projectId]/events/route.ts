import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireProjectMember, requireProjectAccess } from "@/lib/api-helpers"
import { z } from "zod"

const createSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(5000).optional(),
  date: z.string(),
  endDate: z.string().optional(),
  color: z.string().max(20).optional(),
  allDay: z.boolean().optional(),
  sprintId: z.string().optional(),
})

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params
  const result = await requireProjectAccess(projectId, "read")
  if ("error" in result) return result.error

  const events = await prisma.calendarEvent.findMany({
    where: { projectId },
    orderBy: { date: "asc" },
  })

  return NextResponse.json(events)
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params
  const result = await requireProjectMember(projectId)
  if ("error" in result) return result.error

  try {
    const body = await request.json()
    const data = createSchema.parse(body)

    const date = new Date(data.date)
    if (isNaN(date.getTime())) {
      return NextResponse.json({ error: "日付が不正です" }, { status: 400 })
    }

    const event = await prisma.calendarEvent.create({
      data: {
        projectId,
        title: data.title,
        description: data.description,
        date,
        endDate: data.endDate ? new Date(data.endDate) : null,
        color: data.color ?? "blue",
        allDay: data.allDay ?? true,
        sprintId: data.sprintId || null,
        createdBy: result.session.user.name ?? null,
      },
    })

    return NextResponse.json(event, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues }, { status: 400 })
    }
    console.error("Event CREATE error:", error)
    return NextResponse.json({ error: "作成に失敗しました" }, { status: 500 })
  }
}
