import { requireAuth } from "@/lib/api-helpers"
import { jsonResponse, toHttpResponse } from "@/services/_shared"
import { listArchivedProjects } from "@/services/projects/project-list"

/**
 * Archived projects of the caller's scope (home page, loaded when the
 * archived section is expanded) → `{ items }`.
 */
export async function GET() {
  const gate = await requireAuth()
  if ("error" in gate) return gate.error

  try {
    const user = gate.session.user
    return jsonResponse({ items: await listArchivedProjects({ id: user.id, role: user.role }) })
  } catch (error) {
    return toHttpResponse(error, { fallback: "取得に失敗しました", context: "Archived projects" })
  }
}
