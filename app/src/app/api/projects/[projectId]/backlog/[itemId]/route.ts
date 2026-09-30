import { requireProject } from "@/lib/authz"
import { actorFromSession, jsonResponse, successResponse, toHttpResponse } from "@/services/_shared"
import { updateBacklogItemSchema } from "@/services/backlog/backlog.schemas"
import { deleteBacklogItem, getBacklogItem, updateBacklogItem } from "@/services/backlog/backlog.service"

type Params = { params: Promise<{ projectId: string; itemId: string }> }

export async function GET(_request: Request, { params }: Params) {
  const { projectId, itemId } = await params
  const gate = await requireProject(projectId, "project.view")
  if ("error" in gate) return gate.error

  try {
    return jsonResponse(await getBacklogItem(projectId, itemId))
  } catch (error) {
    return toHttpResponse(error, { fallback: "取得に失敗しました", context: "Backlog GET" })
  }
}

export async function PATCH(request: Request, { params }: Params) {
  const { projectId, itemId } = await params
  // PO owns PBIs; SM co-authors during sprint planning. Admins always pass.
  const gate = await requireProject(projectId, "backlog.write")
  if ("error" in gate) return gate.error

  try {
    const input = updateBacklogItemSchema.parse(await request.json())
    return jsonResponse(await updateBacklogItem(projectId, itemId, input, actorFromSession(gate.session)))
  } catch (error) {
    return toHttpResponse(error, { fallback: "更新に失敗しました", context: "Backlog PATCH" })
  }
}

export async function DELETE(_request: Request, { params }: Params) {
  const { projectId, itemId } = await params
  const gate = await requireProject(projectId, "backlog.delete")
  if ("error" in gate) return gate.error

  try {
    // Moves the PBI to the project trash (restore / purge: /trash).
    await deleteBacklogItem(projectId, itemId, actorFromSession(gate.session))
    return successResponse()
  } catch (error) {
    return toHttpResponse(error, { fallback: "Failed to delete item", context: "Backlog DELETE" })
  }
}
