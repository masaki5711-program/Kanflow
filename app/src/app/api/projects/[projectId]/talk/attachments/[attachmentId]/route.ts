import { serveStoredFile } from "@/lib/api-helpers"
import { requireProject } from "@/lib/authz"
import { toHttpResponse } from "@/services/_shared"
import { getAttachment } from "@/services/team-chat/team-chat.service"

type Params = { params: Promise<{ projectId: string; attachmentId: string }> }

/** A file attached to a chat message (`?download=1` forces a download). */
export async function GET(request: Request, { params }: Params) {
  const { projectId, attachmentId } = await params
  const gate = await requireProject(projectId, "project.view")
  if ("error" in gate) return gate.error

  try {
    const a = await getAttachment(projectId, attachmentId)
    const forceDownload = new URL(request.url).searchParams.get("download") !== null
    return await serveStoredFile(projectId, a.fileName, a.mimeType, a.originalName, request, forceDownload)
  } catch (error) {
    return toHttpResponse(error, { fallback: "取得に失敗しました", context: "Team chat attachment GET" })
  }
}
