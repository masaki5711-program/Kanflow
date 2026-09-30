import { requireAuth } from "@/lib/api-helpers"
import { jsonResponse, toHttpResponse } from "@/services/_shared"
import { listSectionOptions } from "@/services/sections/sections.service"

export async function GET() {
  const auth = await requireAuth()
  if ("error" in auth) return auth.error

  try {
    return jsonResponse(await listSectionOptions())
  } catch (error) {
    return toHttpResponse(error, { fallback: "取得に失敗しました", context: "Section options" })
  }
}
