import { NextResponse } from "next/server"
import bcrypt from "bcryptjs"
import { z } from "zod/v4"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

const schema = z.object({
  currentPassword: z.string().min(1).max(200),
  newPassword: z.string().min(6).max(200),
})

/**
 * Self-service password change. Requires the current password to verify
 * intent (admin reset uses a separate endpoint).
 */
export async function POST(request: Request) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const body = await request.json().catch(() => null)
  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: "新しいパスワードは 6 文字以上必要です" },
      { status: 400 }
    )
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { password: true },
  })
  if (!user) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const ok = await bcrypt.compare(parsed.data.currentPassword, user.password)
  if (!ok) {
    return NextResponse.json(
      { error: "現在のパスワードが間違っています" },
      { status: 401 }
    )
  }

  const hash = await bcrypt.hash(parsed.data.newPassword, 12)
  await prisma.user.update({
    where: { id: session.user.id },
    data: { password: hash },
  })
  return NextResponse.json({ success: true })
}
