import { serveStoredFile } from "@/lib/api-helpers"
import { requireProject } from "@/lib/authz"
import { actorFromSession, successResponse, toHttpResponse } from "@/services/_shared"
import { deletePunchPhoto, getPunchPhoto } from "@/services/milestones/milestones.punch"

type Params = { params: Promise<{ projectId: string; punchId: string; photoId: string }> }

/** Serves the file (inline when safe); `?download` forces a download. */
export async function GET(request: Request, { params }: Params) {
  const { projectId, punchId, photoId } = await params
  const gate = await requireProject(projectId, "project.view")
  if ("error" in gate) return gate.error

  try {
    const file = await getPunchPhoto(projectId, punchId, photoId)
    const forceDownload = new URL(request.url).searchParams.get("download") !== null
    return await serveStoredFile(projectId, file.fileName, file.mimeType, file.originalName, request, forceDownload)
  } catch (error) {
    return toHttpResponse(error, { fallback: "取得に失敗しました", context: "Milestone punch photo GET" })
  }
}

export async function DELETE(_request: Request, { params }: Params) {
  const { projectId, punchId, photoId } = await params
  const gate = await requireProject(projectId, "milestone.track")
  if ("error" in gate) return gate.error

  try {
    await deletePunchPhoto(projectId, punchId, photoId, actorFromSession(gate.session))
    return successResponse()
  } catch (error) {
    return toHttpResponse(error, { fallback: "削除に失敗しました", context: "Milestone punch photo DELETE" })
  }
}
