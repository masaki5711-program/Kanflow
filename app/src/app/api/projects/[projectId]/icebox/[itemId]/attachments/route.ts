import { requireProject } from "@/lib/authz"
import { actorFromSession, jsonResponse, toHttpResponse } from "@/services/_shared"
import { uploadIceboxAttachment } from "@/services/icebox/icebox.service"

export async function POST(
  request: Request,
  { params }: { params: Promise<{ projectId: string; itemId: string }> }
) {
  const { projectId, itemId } = await params
  const gate = await requireProject(projectId, "icebox.write")
  if ("error" in gate) return gate.error

  try {
    const formData = await request.formData()
    const file = formData.get("file") as File | null
    return jsonResponse(await uploadIceboxAttachment(projectId, itemId, file, actorFromSession(gate.session)), 201)
  } catch (error) {
    return toHttpResponse(error, { fallback: "アップロードに失敗しました", context: "Icebox attachment upload" })
  }
}
