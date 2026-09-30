import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { getRateLimiter, retryAfterSeconds } from "@/lib/rate-limit"
import { successResponse, toHttpResponse } from "@/services/_shared"
import { changePassword } from "@/services/users/account.service"
import { changePasswordSchema } from "@/services/users/users.schemas"

/** Failed current-password attempts allowed per user per 15 minutes. */
const passwordChangeLimiter = () =>
  getRateLimiter("password-change", { limit: 5, windowMs: 15 * 60 * 1000 })

/**
 * Self-service password change. Requires the current password to verify
 * intent (admin reset uses a separate endpoint).
 */
export async function POST(request: Request) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 })

  const limiter = passwordChangeLimiter()
  const status = limiter.peek(session.user.id)
  if (status.limited) {
    return NextResponse.json(
      { error: "試行回数が多すぎます。しばらくしてから再度お試しください", code: "RATE_LIMITED" },
      { status: 429, headers: { "Retry-After": retryAfterSeconds(status) } }
    )
  }

  const parsed = changePasswordSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: "新しいパスワードは 6 文字以上必要です", code: "PASSWORD_TOO_SHORT" }, { status: 400 })
  }

  try {
    const result = await changePassword(session.user.id, parsed.data.currentPassword, parsed.data.newPassword)
    if (result === "wrong_password") {
      limiter.hit(session.user.id)
      return NextResponse.json({ error: "現在のパスワードが間違っています", code: "WRONG_PASSWORD" }, { status: 401 })
    }
    limiter.reset(session.user.id)
    return successResponse()
  } catch (error) {
    return toHttpResponse(error, { fallback: "更新に失敗しました", context: "Password change" })
  }
}
