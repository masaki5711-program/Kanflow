import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { getRateLimiter, retryAfterSeconds } from "@/lib/rate-limit"
import { successResponse, toHttpResponse } from "@/services/_shared"
import { resetPasswordSchema } from "@/services/users/users.schemas"
import { resetPassword } from "@/services/users/users.service"

/** Admin password resets allowed per admin per 15 minutes. */
const resetLimiter = () =>
  getRateLimiter("password-reset", { limit: 20, windowMs: 15 * 60 * 1000 })

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 })
  if (session.user.role !== "admin") return NextResponse.json({ error: "Forbidden", code: "ADMIN_REQUIRED" }, { status: 403 })

  const limiter = resetLimiter()
  const status = limiter.peek(session.user.id)
  if (status.limited) {
    return NextResponse.json(
      { error: "試行回数が多すぎます。しばらくしてから再度お試しください", code: "RATE_LIMITED" },
      { status: 429, headers: { "Retry-After": retryAfterSeconds(status) } }
    )
  }
  limiter.hit(session.user.id)

  const { id } = await params
  const parsed = resetPasswordSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: "パスワードが不正です", code: "PASSWORD_TOO_SHORT" }, { status: 400 })

  try {
    await resetPassword(id, parsed.data.password)
    return successResponse()
  } catch (error) {
    return toHttpResponse(error, { fallback: "更新に失敗しました", context: "Password reset" })
  }
}
