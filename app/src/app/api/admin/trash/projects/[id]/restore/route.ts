import { requireAdmin } from "@/lib/api-helpers"
import { actorFromSession, successResponse, toHttpResponse } from "@/services/_shared"
import { restoreProject } from "@/services/projects/projects.service"

type Params = { params: Promise<{ id: string }> }

/** Take a trashed project out of the trash (system admin). */
export async function POST(_request: Request, { params }: Params) {
  const auth = await requireAdmin()
  if ("error" in auth) return auth.error

  const { id } = await params
  try {
    await restoreProject(id, actorFromSession(auth.session))
    return successResponse()
  } catch (error) {
    return toHttpResponse(error, { fallback: "restore_failed", context: "Admin trash RESTORE" })
  }
}
