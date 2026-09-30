import { requireProject } from "@/lib/authz"
import { jsonResponse, toHttpResponse } from "@/services/_shared"
import { createFolderSchema } from "@/services/attachments/attachments.schemas"
import { createFolder } from "@/services/attachments/attachments.service"

export async function POST(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params
  const gate = await requireProject(projectId, "attachment.write")
  if ("error" in gate) return gate.error

  try {
    const input = createFolderSchema.parse(await request.json())
    return jsonResponse(await createFolder(projectId, input), 201)
  } catch (error) {
    return toHttpResponse(error, { fallback: "作成に失敗しました", context: "Folder CREATE" })
  }
}
