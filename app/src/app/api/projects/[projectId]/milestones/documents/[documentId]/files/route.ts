import { requireProject } from "@/lib/authz"
import { actorFromSession, jsonResponse, toHttpResponse } from "@/services/_shared"
import { uploadDocumentFile } from "@/services/milestones/milestones.documents"

type Params = { params: Promise<{ projectId: string; documentId: string }> }

/** multipart/form-data with one `file`: a file of the 引き渡し資料 (milestone.track). */
export async function POST(request: Request, { params }: Params) {
  const { projectId, documentId } = await params
  const gate = await requireProject(projectId, "milestone.track")
  if ("error" in gate) return gate.error

  try {
    const formData = await request.formData()
    const file = formData.get("file")
    return jsonResponse(await uploadDocumentFile(projectId, documentId, file instanceof File ? file : null, actorFromSession(gate.session)), 201)
  } catch (error) {
    return toHttpResponse(error, { fallback: "アップロードに失敗しました", context: "Milestone document file upload" })
  }
}
