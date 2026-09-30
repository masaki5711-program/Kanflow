import { requireProject } from "@/lib/authz"
import { actorFromSession, jsonResponse, toHttpResponse } from "@/services/_shared"
import { uploadAttachment } from "@/services/attachments/attachments.service"

export async function POST(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params
  const gate = await requireProject(projectId, "attachment.write")
  if ("error" in gate) return gate.error

  try {
    const formData = await request.formData()
    const file = formData.get("file") as File | null
    const folderIdRaw = formData.get("folderId")
    const folderId = typeof folderIdRaw === "string" && folderIdRaw ? folderIdRaw : null
    const dto = await uploadAttachment(projectId, file, folderId, actorFromSession(gate.session))
    return jsonResponse(dto, 201)
  } catch (error) {
    return toHttpResponse(error, { fallback: "アップロードに失敗しました", context: "Project attachment upload" })
  }
}
