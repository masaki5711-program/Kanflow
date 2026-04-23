import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { z } from "zod/v4"

const patchSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  email: z.string().email().max(200).optional(),
  role: z.enum(["admin", "member"]).optional(),
  isActive: z.boolean().optional(),
  employeeNumber: z.string().max(50).nullable().optional(),
  department: z.string().max(100).nullable().optional(),
})

function normalizeOptional(value: string | null | undefined): string | null | undefined {
  if (value === undefined) return undefined
  if (value === null) return null
  const trimmed = value.trim()
  return trimmed === "" ? null : trimmed
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (session.user.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const { id } = await params
  const body = await request.json().catch(() => null)
  const parsed = patchSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: "入力値が不正です" }, { status: 400 })
  }

  if (parsed.data.isActive === false && id === session.user.id) {
    return NextResponse.json({ error: "自分自身を無効化することはできません" }, { status: 400 })
  }
  if (parsed.data.role && parsed.data.role !== "admin" && id === session.user.id) {
    return NextResponse.json({ error: "自分自身の管理者権限を外すことはできません" }, { status: 400 })
  }

  if (parsed.data.email) {
    const existing = await prisma.user.findFirst({
      where: { email: parsed.data.email, NOT: { id } },
    })
    if (existing) {
      return NextResponse.json({ error: "このメールアドレスは既に使用されています" }, { status: 409 })
    }
  }

  const employeeNumber = normalizeOptional(parsed.data.employeeNumber)
  if (typeof employeeNumber === "string") {
    const existing = await prisma.user.findFirst({
      where: { employeeNumber, NOT: { id } },
    })
    if (existing) {
      return NextResponse.json({ error: "この従業員番号は既に使用されています" }, { status: 409 })
    }
  }

  const department = normalizeOptional(parsed.data.department)

  const { employeeNumber: _en, department: _dept, ...rest } = parsed.data
  const updateData: Record<string, unknown> = { ...rest }
  if (employeeNumber !== undefined) updateData.employeeNumber = employeeNumber
  if (department !== undefined) updateData.department = department

  const user = await prisma.user.update({
    where: { id },
    data: updateData,
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      isActive: true,
      employeeNumber: true,
      department: true,
    },
  })
  return NextResponse.json(user)
}
