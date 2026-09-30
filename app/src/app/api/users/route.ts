import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { jsonResponse, toHttpResponse } from "@/services/_shared"
import { createUserSchema } from "@/services/users/users.schemas"
import { createUser, listUsers } from "@/services/users/users.service"

async function requireAdmin() {
  const session = await auth()
  if (!session?.user?.id) return { error: NextResponse.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 }) }
  if (session.user.role !== "admin") return { error: NextResponse.json({ error: "Forbidden", code: "ADMIN_REQUIRED" }, { status: 403 }) }
  return { session }
}

export async function GET() {
  const gate = await requireAdmin()
  if (gate.error) return gate.error

  try {
    return jsonResponse(await listUsers())
  } catch (error) {
    return toHttpResponse(error, { fallback: "取得に失敗しました", context: "User LIST" })
  }
}

export async function POST(request: Request) {
  const gate = await requireAdmin()
  if (gate.error) return gate.error

  const parsed = createUserSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: "入力値が不正です", code: "VALIDATION" }, { status: 400 })

  try {
    return jsonResponse(await createUser(parsed.data), 201)
  } catch (error) {
    return toHttpResponse(error, { fallback: "作成に失敗しました", context: "User CREATE" })
  }
}
