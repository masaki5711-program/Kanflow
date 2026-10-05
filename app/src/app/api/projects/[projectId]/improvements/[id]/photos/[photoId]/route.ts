import { serveStoredFile } from "@/lib/api-helpers"
import { requireProject } from "@/lib/authz"
import { actorFromSession, successResponse, toHttpResponse } from "@/services/_shared"
import { deletePhoto, getPhoto } from "@/services/improvements/improvements.photos"

type Params = { params: Promise<{ projectId: string; id: string; photoId: string }> }

/** Serves the image inline; `?download` forces a download. */
export async function GET(request: Request, { params }: Params) {
  const { projectId, id, photoId } = await params
  const gate = await requireProject(projectId, "project.view")
  if ("error" in gate) return gate.error

  try {
    const photo = await getPhoto(projectId, id, photoId)
    const forceDownload = new URL(request.url).searchParams.get("download") !== null
    return await serveStoredFile(projectId, photo.fileName, photo.mimeType, photo.originalName, request, forceDownload)
  } catch (error) {
    return toHttpResponse(error, { fallback: "取得に失敗しました", context: "Improvement photo GET" })
  }
}

export async function DELETE(_request: Request, { params }: Params) {
  const { projectId, id, photoId } = await params
  const gate = await requireProject(projectId, "improvement.track")
  if ("error" in gate) return gate.error

  try {
    await deletePhoto(projectId, id, photoId, actorFromSession(gate.session))
    return successResponse()
  } catch (error) {
    return toHttpResponse(error, { fallback: "削除に失敗しました", context: "Improvement photo DELETE" })
  }
}
