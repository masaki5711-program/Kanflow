import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireProjectMember } from "@/lib/api-helpers"
import { z } from "zod"

const addSchema = z.object({
  email: z.string().email().optional(),
  userId: z.string().min(1).optional(),
  userIds: z.array(z.string().min(1)).min(1).max(50).optional(),
  role: z.enum(["po", "sm", "dev"]),
}).refine((v) => !!v.email || !!v.userId || (!!v.userIds && v.userIds.length > 0), {
  message: "email / userId / userIds のいずれかが必要です",
})

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params
  const result = await requireProjectMember(projectId)
  if ("error" in result) return result.error

  const members = await prisma.projectMember.findMany({
    where: { projectId },
    include: {
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          employeeNumber: true,
          department: true,
        },
      },
    },
    orderBy: { joinedAt: "asc" },
  })

  return NextResponse.json(members)
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
    const data = addSchema.parse(body)

    // Bulk add path
    if (data.userIds && data.userIds.length > 0) {
      const users = await prisma.user.findMany({
        where: { id: { in: data.userIds }, isActive: true },
        select: { id: true },
      })
      const validIds = new Set(users.map((u) => u.id))

      const existing = await prisma.projectMember.findMany({
        where: { projectId, userId: { in: Array.from(validIds) } },
        select: { userId: true },
      })
      const existingIds = new Set(existing.map((m) => m.userId))

      const toInsert = Array.from(validIds).filter((id) => !existingIds.has(id))
      if (toInsert.length === 0) {
        return NextResponse.json({ added: 0, skipped: data.userIds.length }, { status: 200 })
      }

      await prisma.projectMember.createMany({
        data: toInsert.map((userId) => ({ projectId, userId, role: data.role })),
      })

      const created = await prisma.projectMember.findMany({
        where: { projectId, userId: { in: toInsert } },
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              employeeNumber: true,
              department: true,
            },
          },
        },
      })

      return NextResponse.json({
        added: created.length,
        skipped: data.userIds.length - created.length,
        members: created,
      }, { status: 201 })
    }

    // Single add path — find user by id or email
    const user = data.userId
      ? await prisma.user.findUnique({ where: { id: data.userId } })
      : await prisma.user.findUnique({ where: { email: data.email! } })

    if (!user) {
      return NextResponse.json({ error: "ユーザーが見つかりません" }, { status: 404 })
    }
    if (!user.isActive) {
      return NextResponse.json({ error: "無効化されたユーザーです" }, { status: 400 })
    }

    const existing = await prisma.projectMember.findFirst({
      where: { projectId, userId: user.id },
    })
    if (existing) {
      return NextResponse.json({ error: "既にメンバーです" }, { status: 409 })
    }

    const member = await prisma.projectMember.create({
      data: { projectId, userId: user.id, role: data.role },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            employeeNumber: true,
            department: true,
          },
        },
      },
    })

    return NextResponse.json(member, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues }, { status: 400 })
    }
    console.error("Member CREATE error:", error)
    return NextResponse.json({ error: "追加に失敗しました" }, { status: 500 })
  }
}
