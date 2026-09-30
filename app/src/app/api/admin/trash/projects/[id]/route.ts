import { requireAdmin } from "@/lib/api-helpers"
import { successResponse, toHttpResponse } from "@/services/_shared"
import { purgeProject } from "@/services/projects/projects.service"

type Params = { params: Promise<{ id: string }> }

/** Permanently delete a trashed project now: rows, translations and uploaded files (system admin). */
export async function DELETE(_request: Request, { params }: Params) {
  const auth = await requireAdmin()
  if ("error" in auth) return auth.error

  const { id } = await params
  try {
    await purgeProject(id)
    return successResponse()
  } catch (error) {
    return toHttpResponse(error, { fallback: "delete_failed", context: "Admin trash PURGE" })
  }
}
