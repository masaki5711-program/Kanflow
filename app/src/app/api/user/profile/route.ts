import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { jsonResponse, toHttpResponse } from "@/services/_shared"
import { getProfile, updateProfile } from "@/services/users/account.service"
import { updateProfileSchema } from "@/services/users/users.schemas"

/** Return the current user's editable profile (excluding sensitive fields). */
export async function GET() {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 })

  try {
    return jsonResponse(await getProfile(session.user.id))
  } catch (error) {
    return toHttpResponse(error, { fallback: "取得に失敗しました", context: "Profile GET" })
  }
}

/**
 * Self-service profile update: display name, employee number and department.
 * Email and role are intentionally excluded (admin action).
 */
export async function PATCH(request: Request) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 })

  const parsed = updateProfileSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: "入力値が不正です", code: "VALIDATION" }, { status: 400 })

  try {
    return jsonResponse(await updateProfile(session.user.id, parsed.data))
  } catch (error) {
    return toHttpResponse(error, { fallback: "更新に失敗しました", context: "Profile PATCH" })
  }
}
