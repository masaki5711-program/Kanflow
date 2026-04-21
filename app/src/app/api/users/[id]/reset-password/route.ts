import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import bcrypt from "bcryptjs"
import { z } from "zod/v4"

const schema = z.object({
  password: z.string().min(6).max(200),
})

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (session.user.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const { id } = await params
  const body = await request.json().catch(() => null)
  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: "パスワードが不正です" }, { status: 400 })
  }

  const hash = await bcrypt.hash(parsed.data.password, 12)
  await prisma.user.update({
    where: { id },
    data: { password: hash },
  })
  return NextResponse.json({ success: true })
}
