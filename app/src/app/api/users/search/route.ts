import { requireAuth } from "@/lib/api-helpers"
import { jsonResponse, toHttpResponse } from "@/services/_shared"
import { searchUsers } from "@/services/users/account.service"

export async function GET(request: Request) {
  const gate = await requireAuth()
  if ("error" in gate) return gate.error

  const { searchParams } = new URL(request.url)
  const q = (searchParams.get("q") ?? "").trim()
  const excludeProjectId = searchParams.get("excludeProjectId") ?? undefined

  try {
    return jsonResponse(await searchUsers(q, excludeProjectId))
  } catch (error) {
    return toHttpResponse(error, { fallback: "検索に失敗しました", context: "User search" })
  }
}
