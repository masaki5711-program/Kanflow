import { requireProject } from "@/lib/authz"
import { actorFromSession, jsonResponse, successResponse, toHttpResponse } from "@/services/_shared"
import { recordCheckSchema } from "@/services/improvements/improvements.schemas"
import { deleteCheck, recordCheck } from "@/services/improvements/improvements.checks"

type Params = { params: Promise<{ projectId: string; id: string; checkId: string }> }

/** Record the result (維持できている / 元に戻った) or clear it: any member (improvement.track). */
export async function PATCH(request: Request, { params }: Params) {
  const { projectId, id, checkId } = await params
  const gate = await requireProject(projectId, "improvement.track")
  if ("error" in gate) return gate.error

  try {
    const input = recordCheckSchema.parse(await request.json())
    return jsonResponse(await recordCheck(projectId, id, checkId, input, actorFromSession(gate.session)))
  } catch (error) {
    return toHttpResponse(error, { fallback: "記録に失敗しました", context: "Improvement check PATCH" })
  }
}

export async function DELETE(_request: Request, { params }: Params) {
  const { projectId, id, checkId } = await params
  const gate = await requireProject(projectId, "release.manage")
  if ("error" in gate) return gate.error

  try {
    await deleteCheck(projectId, id, checkId, actorFromSession(gate.session))
    return successResponse()
  } catch (error) {
    return toHttpResponse(error, { fallback: "削除に失敗しました", context: "Improvement check DELETE" })
  }
}
