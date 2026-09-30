import { requireProject } from "@/lib/authz"
import { actorFromSession, jsonResponse, toHttpResponse } from "@/services/_shared"
import { createBacklogItemSchema, listBacklogQuerySchema } from "@/services/backlog/backlog.schemas"
import { createBacklogItem, listBacklog } from "@/services/backlog/backlog.service"

type Params = { params: Promise<{ projectId: string }> }

/**
 * `?status=ready|not_ready|completed` narrows the list (sprint planning only
 * needs READY); `?planItemId=` keeps the PBIs linked to that plan item.
 */
export async function GET(request: Request, { params }: Params) {
  const { projectId } = await params
  const gate = await requireProject(projectId, "project.view")
  if ("error" in gate) return gate.error

  try {
    const search = new URL(request.url).searchParams
    const status = search.get("status")
    const planItemId = search.get("planItemId")
    if (status === null && planItemId === null) return jsonResponse(await listBacklog(projectId))
    const query = listBacklogQuerySchema.parse({ status: status ?? undefined, planItemId: planItemId ?? undefined })
    return jsonResponse(await listBacklog(projectId, query))
  } catch (error) {
    return toHttpResponse(error, { fallback: "取得に失敗しました", context: "Backlog LIST" })
  }
}

export async function POST(request: Request, { params }: Params) {
  const { projectId } = await params
  // PO can author from scratch; SM can also create PBIs when adding from a
  // sprint (sprint planning often surfaces missing PBIs mid-flight).
  const gate = await requireProject(projectId, "backlog.write")
  if ("error" in gate) return gate.error

  try {
    const input = createBacklogItemSchema.parse(await request.json())
    return jsonResponse(await createBacklogItem(projectId, input, actorFromSession(gate.session)), 201)
  } catch (error) {
    return toHttpResponse(error, { fallback: "作成に失敗しました", context: "Backlog CREATE" })
  }
}
