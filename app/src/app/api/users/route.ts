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
})

export async function POST(request: Request) {
  const gate = await requireAdmin()
  if (gate.error) return gate.error

  const body = await request.json().catch(() => null)
  const parsed = createSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: "入力値が不正です" }, { status: 400 })
  }

  const existing = await prisma.user.findUnique({ where: { email: parsed.data.email } })
  if (existing) {
    return NextResponse.json({ error: "このメールアドレスは既に使用されています" }, { status: 409 })
  }

  const hash = await bcrypt.hash(parsed.data.password, 12)
  const user = await prisma.user.create({
    data: {
      name: parsed.data.name,
      email: parsed.data.email,
      password: hash,
      role: parsed.data.role,
    },
    select: { id: true, name: true, email: true, role: true, isActive: true, createdAt: true },
  })
  return NextResponse.json(user, { status: 201 })
}
