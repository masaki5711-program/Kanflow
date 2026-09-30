import { NextResponse } from "next/server"
import { requireAdmin } from "@/lib/api-helpers"
import { jsonResponse, toHttpResponse } from "@/services/_shared"
import { createSectionSchema } from "@/services/sections/sections.schemas"
import { createSection, listSections } from "@/services/sections/sections.service"

export async function GET() {
  const auth = await requireAdmin()
  if ("error" in auth) return auth.error

  try {
    return jsonResponse(await listSections())
  } catch (error) {
    return toHttpResponse(error, { fallback: "list_failed", context: "Section LIST" })
  }
}

export async function POST(request: Request) {
  const auth = await requireAdmin()
  if ("error" in auth) return auth.error

  const parsed = createSectionSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: "invalid_request", code: "VALIDATION" }, { status: 400 })

  try {
    return jsonResponse(await createSection(parsed.data), 201)
  } catch (error) {
    return toHttpResponse(error, { fallback: "create_failed", context: "Section CREATE" })
  }
}
