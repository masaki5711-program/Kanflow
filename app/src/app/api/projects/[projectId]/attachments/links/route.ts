import { requireProject } from "@/lib/authz"
import { actorFromSession, jsonResponse, toHttpResponse } from "@/services/_shared"
import { createLinkSchema } from "@/services/attachments/attachments.schemas"
import { createLink } from "@/services/attachments/attachments.service"

type Params = { params: Promise<{ projectId: string }> }

/** Body { url, name?, folderId? } → the new link entry (201). Only http(s) URLs. */
export async function POST(request: Request, { params }: Params) {
  const { projectId } = await params
  const gate = await requireProject(projectId, "attachment.write")
  if ("error" in gate) return gate.error

  try {
    const input = createLinkSchema.parse(await request.json())
    return jsonResponse(await createLink(projectId, input, actorFromSession(gate.session)), 201)
  } catch (error) {
    return toHttpResponse(error, { fallback: "リンクの追加に失敗しました", context: "Attachment link CREATE" })
  }
}
