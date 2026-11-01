import { requireProject } from "@/lib/authz"
import { actorFromSession, jsonResponse, toHttpResponse } from "@/services/_shared"
import { updateAcceptanceCriterionSchema } from "@/services/acceptance-criteria/acceptance-criteria.schemas"
import { deleteAcceptanceCriterion, updateAcceptanceCriterion } from "@/services/acceptance-criteria/acceptance-criteria.service"

type Params = { params: Promise<{ projectId: string; itemId: string; acRef: string }> }

/** Edit a criterion (`acRef` = AC-2 / 2; backlog.write). The number never changes. */
export async function PATCH(request: Request, { params }: Params) {
  const { projectId, itemId, acRef } = await params
  const gate = await requireProject(projectId, "backlog.write")
  if ("error" in gate) return gate.error
  try {
    const input = updateAcceptanceCriterionSchema.parse(await request.json())
    return jsonResponse({ data: await updateAcceptanceCriterion(projectId, itemId, acRef, input, actorFromSession(gate.session)) })
  } catch (error) {
    return toHttpResponse(error, { fallback: "更新に失敗しました", context: "Acceptance criteria PATCH" })
  }
}

/** Soft delete (backlog.write); the number is never reused. */
export async function DELETE(_request: Request, { params }: Params) {
  const { projectId, itemId, acRef } = await params
  const gate = await requireProject(projectId, "backlog.write")
  if ("error" in gate) return gate.error
  try {
    return jsonResponse({ data: await deleteAcceptanceCriterion(projectId, itemId, acRef, actorFromSession(gate.session)) })
  } catch (error) {
    return toHttpResponse(error, { fallback: "削除に失敗しました", context: "Acceptance criteria DELETE" })
  }
}
