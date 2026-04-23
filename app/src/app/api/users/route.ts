import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import bcrypt from "bcryptjs"
import { z } from "zod/v4"

async function requireAdmin() {
  const session = await auth()
  if (!session?.user?.id) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) }
  if (session.user.role !== "admin") return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) }
  return { session }
}

export async function GET() {
  const gate = await requireAdmin()
  if (gate.error) return gate.error

  const users = await prisma.user.findMany({
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      isActive: true,
      createdAt: true,
      employeeNumber: true,
      department: true,
      _count: { select: { memberships: true } },
    },
    orderBy: { createdAt: "desc" },
  })
  return NextResponse.json(users)
}

const createSchema = z.object({
  name: z.string().min(1).max(100),
  email: z.string().email().max(200),
  password: z.string().min(6).max(200),
  role: z.enum(["admin", "member"]),
  employeeNumber: z.string().max(50).optional().nullable(),
  department: z.string().max(100).optional().nullable(),
})

function normalizeOptional(value: string | null | undefined): string | null {
  if (value === undefined || value === null) return null
  const trimmed = value.trim()
  return trimmed === "" ? null : trimmed
}

export async function POST(request: Request) {
  const gate = await requireAdmin()
  if (gate.error) return gate.error

  const body = await request.json().catch(() => null)
  const parsed = createSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: "入力値が不正です" }, { status: 400 })
  }

  const employeeNumber = normalizeOptional(parsed.data.employeeNumber)
  const department = normalizeOptional(parsed.data.department)

  const existingEmail = await prisma.user.findUnique({ where: { email: parsed.data.email } })
  if (existingEmail) {
    return NextResponse.json({ error: "このメールアドレスは既に使用されています" }, { status: 409 })
  }

  if (employeeNumber) {
    const existingEmp = await prisma.user.findUnique({ where: { employeeNumber } })
    if (existingEmp) {
      return NextResponse.json({ error: "この従業員番号は既に使用されています" }, { status: 409 })
    }
  }

  const hash = await bcrypt.hash(parsed.data.password, 12)
  const user = await prisma.user.create({
    data: {
      name: parsed.data.name,
      email: parsed.data.email,
      password: hash,
      role: parsed.data.role,
      employeeNumber,
      department,
    },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      isActive: true,
      createdAt: true,
      employeeNumber: true,
      department: true,
    },
  })
  return NextResponse.json(user, { status: 201 })
}
