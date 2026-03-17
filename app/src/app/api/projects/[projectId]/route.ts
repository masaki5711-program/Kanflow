import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { z } from "zod"

const updateSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().optional(),
  status: z.enum(["active", "archived"]).optional(),
  defaultCapacity: z.number().int().min(0).optional(),
  sprintDurationWeeks: z.number().int().min(1).max(8).optional(),
  pointUnit: z.string().min(1).max(50).optional(),
  pointDescription: z.string().max(200).optional(),
  language: z.enum(["ja", "en", "id"]).optional(),
  projectType: z.enum(["software", "process_improvement", "general"]).optional(),
})

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { projectId } = await params

  const project = await prisma.project.findFirst({
    where: {
      id: projectId,
      members: { some: { userId: session.user.id } },
    },
    include: {
      members: { include: { user: { select: { id: true, name: true, email: true } } } },
      productGoals: true,
      _count: {
        select: {
          iceboxItems: true,
          backlogItems: true,
          sprints: true,
          releaseItems: true,
        },
      },
    },
  })

  if (!project) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }

  return NextResponse.json(project)
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { projectId } = await params

  const member = await prisma.projectMember.findFirst({
    where: { projectId, userId: session.user.id, role: { in: ["po", "sm"] } },
  })
  if (!member) {
    return NextResponse.json({ error: "権限がありません" }, { status: 403 })
  }

  try {
    const body = await request.json()
    const data = updateSchema.parse(body)

    const project = await prisma.project.update({
      where: { id: projectId },
      data,
    })

    return NextResponse.json(project)
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues }, { status: 400 })
    }
    return NextResponse.json(
      { error: "更新に失敗しました" },
      { status: 500 }
    )
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { projectId } = await params

  // Only PO can delete a project
  const member = await prisma.projectMember.findFirst({
    where: { projectId, userId: session.user.id, role: "po" },
  })
  if (!member) {
    return NextResponse.json({ error: "PO権限が必要です" }, { status: 403 })
  }

  try {
    await prisma.project.delete({ where: { id: projectId } })
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Project DELETE error:", error)
    return NextResponse.json({ error: "Failed to delete project" }, { status: 500 })
  }
}
