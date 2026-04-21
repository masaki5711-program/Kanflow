import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireProjectMember } from "@/lib/api-helpers"
import { z } from "zod"

const createSchema = z.object({
  request: z.string().min(1).max(5000),
  background: z.string().max(5000).optional(),
  author: z.string().max(200).optional(),
  assignedPo: z.string().max(200).optional(),
})

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params
  const result = await requireProjectMember(projectId)
  if ("error" in result) return result.error

  const items = await prisma.iceboxItem.findMany({
    where: { projectId },
    include: { attachments: true },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
  })

  return NextResponse.json({
    unreviewed: items.filter((i) => i.status === "unreviewed"),
    reviewed: items.filter((i) => i.status === "reviewed"),
    frozen: items.filter((i) => i.status === "frozen"),
  })
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

    const last = await prisma.iceboxItem.findFirst({
      where: { projectId },
      orderBy: { displayId: "desc" },
      select: { displayId: true },
    })
    const nextDisplayId = (last?.displayId ?? 0) + 1

    const item = await prisma.iceboxItem.create({
      data: {
        projectId,
        displayId: nextDisplayId,
        author: data.author ?? result.session.user.name ?? "",
        request: data.request,
        background: data.background,
        assignedPo: data.assignedPo,
        status: "unreviewed",
      },
      include: { attachments: true },
    })

    return NextResponse.json(item, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues }, { status: 400 })
    }
    console.error("Icebox CREATE error:", error)
    return NextResponse.json({ error: "作成に失敗しました" }, { status: 500 })
  }
}
