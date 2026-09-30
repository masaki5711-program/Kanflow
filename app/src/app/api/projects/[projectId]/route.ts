import { requireProject } from "@/lib/authz"
import { actorFromSession, jsonResponse, successResponse, toHttpResponse } from "@/services/_shared"
import { projectUpdateDenial } from "@/services/projects/projects.policy"
import { updateProjectSchema } from "@/services/projects/projects.schemas"
import { deleteProject, getProject, updateProject } from "@/services/projects/projects.service"

type Params = { params: Promise<{ projectId: string }> }

export async function GET(_request: Request, { params }: Params) {
  const { projectId } = await params
  const gate = await requireProject(projectId, "project.view")
  if ("error" in gate) return gate.error

  try {
    return jsonResponse(await getProject(projectId, gate.via))
  } catch (error) {
    return toHttpResponse(error, { fallback: "取得に失敗しました", context: "Project GET" })
  }
}

export async function PATCH(request: Request, { params }: Params) {
  const { projectId } = await params
  // Baseline: any explicit member (card color). Stricter per-field checks below.
  const gate = await requireProject(projectId, "project.updateAppearance")
  if ("error" in gate) return gate.error

  try {
    const input = updateProjectSchema.parse(await request.json())
    const denial = projectUpdateDenial(gate.actor, input)
    if (denial) throw denial
    return jsonResponse(await updateProject(projectId, input, actorFromSession(gate.session)))
  } catch (error) {
    return toHttpResponse(error, { fallback: "更新に失敗しました", context: "Project PATCH" })
  }
}

export async function DELETE(_request: Request, { params }: Params) {
  const { projectId } = await params
  // PO of the project OR platform admin can delete. The project goes to the
  // trash; a system admin restores / purges it via /api/admin/trash/projects.
  const gate = await requireProject(projectId, "project.delete")
  if ("error" in gate) return gate.error

  try {
    await deleteProject(projectId, actorFromSession(gate.session))
    return successResponse()
  } catch (error) {
    return toHttpResponse(error, { fallback: "Failed to delete project", context: "Project DELETE" })
  }
}
