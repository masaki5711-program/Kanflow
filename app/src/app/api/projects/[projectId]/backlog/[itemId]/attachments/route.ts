import { requireProject } from "@/lib/authz"
import { actorFromSession, jsonResponse, toHttpResponse } from "@/services/_shared"
import { listPbiAttachments, uploadPbiAttachment } from "@/services/backlog/backlog.attachments"

type Params = { params: Promise<{ projectId: string; itemId: string }> }

/** The PBI's 参考資料 attachments (oldest first). */
export async function GET(_request: Request, { params }: Params) {
  const { projectId, itemId } = await params
  const gate = await requireProject(projectId, "project.view")
  if ("error" in gate) return gate.error

  try {
    return jsonResponse(await listPbiAttachments(projectId, itemId))
  } catch (error) {
    return toHttpResponse(error, { fallback: "取得に失敗しました", context: "PBI attachments GET" })
  }
}

/** multipart/form-data with one `file`. Same writers as the PBI itself (PO / SM / admin). */
export async function POST(request: Request, { params }: Params) {
  const { projectId, itemId } = await params
  const gate = await requireProject(projectId, "backlog.write")
  if ("error" in gate) return gate.error

  try {
    const formData = await request.formData()
    const file = formData.get("file") as File | null
    return jsonResponse(await uploadPbiAttachment(projectId, itemId, file, actorFromSession(gate.session)), 201)
  } catch (error) {
    return toHttpResponse(error, { fallback: "アップロードに失敗しました", context: "PBI attachment upload" })
  }
}
