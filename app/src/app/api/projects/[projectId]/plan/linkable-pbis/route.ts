import { requireProject } from "@/lib/authz"
import { jsonResponse, toHttpResponse } from "@/services/_shared"
import { listLinkablePbis } from "@/services/plan/plan.links"

type Params = { params: Promise<{ projectId: string }> }

/** `?q=` (text or "#12") → { pbis: [{ id, displayId, title, status, points, planItem }] } (≤ 200, live PBIs). */
export async function GET(request: Request, { params }: Params) {
  const { projectId } = await params
  const gate = await requireProject(projectId, "project.view")
  if ("error" in gate) return gate.error

  try {
    const q = new URL(request.url).searchParams.get("q") ?? undefined
    return jsonResponse(await listLinkablePbis(projectId, q))
  } catch (error) {
    return toHttpResponse(error, { fallback: "取得に失敗しました", context: "Plan linkable PBIs" })
  }
}
