import { serveStoredFile } from "@/lib/api-helpers"
import { requireProject } from "@/lib/authz"
import { actorFromSession, successResponse, toHttpResponse } from "@/services/_shared"
import { deleteDocumentFile, getDocumentFile } from "@/services/milestones/milestones.documents"

type Params = { params: Promise<{ projectId: string; documentId: string; fileId: string }> }

/** Serves the file (inline when safe); `?download` forces a download. */
export async function GET(request: Request, { params }: Params) {
  const { projectId, documentId, fileId } = await params
  const gate = await requireProject(projectId, "project.view")
  if ("error" in gate) return gate.error

  try {
    const file = await getDocumentFile(projectId, documentId, fileId)
    const forceDownload = new URL(request.url).searchParams.get("download") !== null
    return await serveStoredFile(projectId, file.fileName, file.mimeType, file.originalName, request, forceDownload)
  } catch (error) {
    return toHttpResponse(error, { fallback: "取得に失敗しました", context: "Milestone document file GET" })
  }
}

export async function DELETE(_request: Request, { params }: Params) {
  const { projectId, documentId, fileId } = await params
  const gate = await requireProject(projectId, "milestone.track")
  if ("error" in gate) return gate.error

  try {
    await deleteDocumentFile(projectId, documentId, fileId, actorFromSession(gate.session))
    return successResponse()
  } catch (error) {
    return toHttpResponse(error, { fallback: "削除に失敗しました", context: "Milestone document file DELETE" })
  }
}
