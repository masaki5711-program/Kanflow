import { NextResponse } from "next/server"
import { requireAdmin } from "@/lib/api-helpers"
import { jsonResponse, toHttpResponse } from "@/services/_shared"
import { createAdminCategorySchema, parseSectionFilter } from "@/services/categories/categories.schemas"
import { createAdminCategory, listAdminCategories } from "@/services/categories/categories.service"

/** `?sectionId=` → global only; absent → all; `?sectionId=<id>` → that section. */
export async function GET(request: Request) {
  const auth = await requireAdmin()
  if ("error" in auth) return auth.error

  try {
    const filter = parseSectionFilter(new URL(request.url).searchParams.get("sectionId"))
    return jsonResponse(await listAdminCategories(filter))
  } catch (error) {
    return toHttpResponse(error, { fallback: "list_failed", context: "Admin category LIST" })
  }
}

export async function POST(request: Request) {
  const auth = await requireAdmin()
  if ("error" in auth) return auth.error

  const parsed = createAdminCategorySchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: "invalid_request", code: "VALIDATION" }, { status: 400 })

  try {
    return jsonResponse(await createAdminCategory(parsed.data), 201)
  } catch (error) {
    return toHttpResponse(error, { fallback: "create_failed", context: "Admin category CREATE" })
  }
}
