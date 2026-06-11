import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { z } from "zod"
import { requireProjectAccess } from "@/lib/api-helpers"

const updateSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().optional(),
  status: z.enum(["active", "archived"]).optional(),
  defaultCapacity: z.number().int().min(0).optional(),
  sprintDurationDays: z.number().int().min(1).max(56).optional(),
  pointUnit: z.string().min(1).max(50).optional(),
  pointDescription: z.string().max(200).optional(),
  language: z.enum(["ja", "en", "id"]).optional(),
  projectType: z.enum(["software", "process_improvement", "general"]).optional(),
  progressPct: z.number().int().min(0).max(100).optional(),
  /** Replace the project's section assignments (admin only). */
  sectionIds: z.array(z.string()).optional(),
})

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params
  const access = await requireProjectAccess(projectId, "read")
  if ("error" in access) return access.error

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: {
      members: { include: { user: { select: { id: true, name: true, email: true } } } },
      productGoals: true,
      sections: { include: { section: { select: { id: true, name: true } } } },
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
  return NextResponse.json({
    ...project,
    sections: project.sections.map((s) => s.section),
    _accessVia: access.via,
  })
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  // Admin can edit anything; otherwise require PO or SM membership.
  const isAdmin = session.user.role === "admin"
  let memberRole: string | null = null
  if (!isAdmin) {
    const member = await prisma.projectMember.findFirst({
      where: { projectId, userId: session.user.id, role: { in: ["po", "sm"] } },
      select: { role: true },
    })
    if (!member) {
      return NextResponse.json({ error: "権限がありません" }, { status: 403 })
    }
    memberRole = member.role
  }

  try {
    const body = await request.json()
    const data = updateSchema.parse(body)

    if (data.progressPct !== undefined && !isAdmin && memberRole !== "po") {
      return NextResponse.json({ error: "進捗の編集は PO のみが行えます" }, { status: 403 })
    }

    // Section reassignment is allowed for admin or PO.
    const { sectionIds, ...rest } = data
    if (sectionIds !== undefined && !isAdmin && memberRole !== "po") {
      return NextResponse.json({ error: "セクションの変更は PO または管理者が行えます" }, { status: 403 })
    }

    const project = await prisma.$transaction(async (tx) => {
      const updated = await tx.project.update({ where: { id: projectId }, data: rest })
      if (sectionIds !== undefined) {
        await tx.projectSection.deleteMany({ where: { projectId } })
        if (sectionIds.length > 0) {
          await tx.projectSection.createMany({
            data: sectionIds.map((sectionId) => ({ projectId, sectionId })),
          })
        }
      }
      return updated
    })
    return NextResponse.json(project)
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues }, { status: 400 })
    }
    return NextResponse.json({ error: "更新に失敗しました" }, { status: 500 })
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

  // PO of the project OR platform admin can delete.
  const member = await prisma.projectMember.findFirst({
    where: { projectId, userId: session.user.id, role: "po" },
  })
  const isAdmin = session.user.role === "admin"
  if (!member && !isAdmin) {
    return NextResponse.json({ error: "PO権限または管理者権限が必要です" }, { status: 403 })
  }

  try {
    await prisma.project.delete({ where: { id: projectId } })
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Project DELETE error:", error)
    return NextResponse.json({ error: "Failed to delete project" }, { status: 500 })
  }
}
