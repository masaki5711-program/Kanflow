import { NextResponse } from "next/server"
import { requireAdmin } from "@/lib/api-helpers"
import { jsonResponse, toHttpResponse } from "@/services/_shared"
import { updateAdminCategorySchema } from "@/services/categories/categories.schemas"
import { deleteAdminCategory, updateAdminCategory } from "@/services/categories/categories.service"

type Params = { params: Promise<{ id: string }> }

export async function PATCH(request: Request, { params }: Params) {
  const auth = await requireAdmin()
  if ("error" in auth) return auth.error

  const { id } = await params
  const parsed = updateAdminCategorySchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: "invalid_request", code: "VALIDATION" }, { status: 400 })

  try {
    return jsonResponse(await updateAdminCategory(id, parsed.data))
  } catch (error) {
    return toHttpResponse(error, { fallback: "update_failed", context: "Admin category PATCH" })
  }
}

export async function DELETE(_request: Request, { params }: Params) {
  const auth = await requireAdmin()
  if ("error" in auth) return auth.error

  const { id } = await params
  try {
    await deleteAdminCategory(id)
    return NextResponse.json({ ok: true })
  } catch (error) {
    return toHttpResponse(error, { fallback: "delete_failed", context: "Admin category DELETE" })
  }
}
