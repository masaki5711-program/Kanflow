import { can, forbiddenResponse, requireProject } from "@/lib/authz"
import { actorFromSession, jsonResponse, successResponse, toHttpResponse } from "@/services/_shared"
import { DOCUMENT_STRUCTURE_FIELDS, touchesAny, updateDocumentSchema } from "@/services/milestones/milestones.schemas"
import { deleteDocument, updateDocument } from "@/services/milestones/milestones.documents"

type Params = { params: Promise<{ projectId: string; documentId: string }> }

/** 揃った / 未提出 and note: any member (milestone.track); renaming / reordering also needs plan.write (403). */
export async function PATCH(request: Request, { params }: Params) {
  const { projectId, documentId } = await params
  const gate = await requireProject(projectId, "milestone.track")
  if ("error" in gate) return gate.error

  try {
    const input = updateDocumentSchema.parse(await request.json())
    if (touchesAny(input, DOCUMENT_STRUCTURE_FIELDS) && !can(gate.actor, "plan.write")) return forbiddenResponse()
    return jsonResponse(await updateDocument(projectId, documentId, input, actorFromSession(gate.session)))
  } catch (error) {
    return toHttpResponse(error, { fallback: "更新に失敗しました", context: "Milestone document PATCH" })
  }
}

export async function DELETE(_request: Request, { params }: Params) {
  const { projectId, documentId } = await params
  const gate = await requireProject(projectId, "plan.write")
  if ("error" in gate) return gate.error

  try {
    await deleteDocument(projectId, documentId, actorFromSession(gate.session))
    return successResponse()
  } catch (error) {
    return toHttpResponse(error, { fallback: "削除に失敗しました", context: "Milestone document DELETE" })
  }
}
