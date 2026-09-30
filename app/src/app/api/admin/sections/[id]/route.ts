import { NextResponse } from "next/server"
import { requireAdmin } from "@/lib/api-helpers"
import { jsonResponse, toHttpResponse } from "@/services/_shared"
import { updateSectionSchema } from "@/services/sections/sections.schemas"
import { deleteSection, updateSection } from "@/services/sections/sections.service"

type Params = { params: Promise<{ id: string }> }

export async function PATCH(request: Request, { params }: Params) {
  const auth = await requireAdmin()
  if ("error" in auth) return auth.error

  const { id } = await params
  const parsed = updateSectionSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: "invalid_request", code: "VALIDATION" }, { status: 400 })

  try {
    return jsonResponse(await updateSection(id, parsed.data))
  } catch (error) {
    return toHttpResponse(error, { fallback: "update_failed", context: "Section PATCH" })
  }
}

export async function DELETE(_request: Request, { params }: Params) {
  const auth = await requireAdmin()
  if ("error" in auth) return auth.error

  const { id } = await params
  try {
    await deleteSection(id)
    return NextResponse.json({ ok: true })
  } catch (error) {
    return toHttpResponse(error, { fallback: "delete_failed", context: "Section DELETE" })
  }
}
