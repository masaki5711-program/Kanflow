import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { jsonResponse, toHttpResponse } from "@/services/_shared"
import { getLanguage, setLanguage } from "@/services/users/account.service"
import { languageSchema } from "@/services/users/users.schemas"

export async function PATCH(request: Request) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 })

  const parsed = languageSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: "Invalid language", code: "VALIDATION" }, { status: 400 })

  try {
    return jsonResponse(await setLanguage(session.user.id, parsed.data.language))
  } catch (error) {
    return toHttpResponse(error, { fallback: "更新に失敗しました", context: "Language PATCH" })
  }
}

export async function GET() {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 })

  try {
    return jsonResponse(await getLanguage(session.user.id))
  } catch (error) {
    return toHttpResponse(error, { fallback: "取得に失敗しました", context: "Language GET" })
  }
}
