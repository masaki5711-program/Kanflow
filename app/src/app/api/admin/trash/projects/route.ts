import { requireAdmin } from "@/lib/api-helpers"
import { jsonResponse, toHttpResponse } from "@/services/_shared"
import { listTrashedProjects } from "@/services/trash/trash.service"

/** Every trashed project, newest deletion first (system admin). */
export async function GET() {
  const auth = await requireAdmin()
  if ("error" in auth) return auth.error

  try {
    return jsonResponse(await listTrashedProjects())
  } catch (error) {
    return toHttpResponse(error, { fallback: "list_failed", context: "Admin trash LIST" })
  }
}
