import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { jsonResponse, toHttpResponse } from "@/services/_shared"
import { updateUserSchema } from "@/services/users/users.schemas"
import { updateUser } from "@/services/users/users.service"

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 })
  if (session.user.role !== "admin") return NextResponse.json({ error: "Forbidden", code: "ADMIN_REQUIRED" }, { status: 403 })

  const { id } = await params
  const parsed = updateUserSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: "入力値が不正です", code: "VALIDATION" }, { status: 400 })

  try {
    return jsonResponse(await updateUser(session.user.id, id, parsed.data))
  } catch (error) {
    return toHttpResponse(error, { fallback: "更新に失敗しました", context: "User PATCH" })
  }
}
