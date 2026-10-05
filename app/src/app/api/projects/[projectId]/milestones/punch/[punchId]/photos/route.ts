import { requireProject } from "@/lib/authz"
import { actorFromSession, jsonResponse, toHttpResponse } from "@/services/_shared"
import { uploadPunchPhoto } from "@/services/milestones/milestones.punch"

type Params = { params: Promise<{ projectId: string; punchId: string }> }

/** multipart/form-data with one `file`: a photo (image) of the 残課題 (milestone.track). */
export async function POST(request: Request, { params }: Params) {
  const { projectId, punchId } = await params
  const gate = await requireProject(projectId, "milestone.track")
  if ("error" in gate) return gate.error

  try {
    const formData = await request.formData()
    const file = formData.get("file")
    return jsonResponse(await uploadPunchPhoto(projectId, punchId, file instanceof File ? file : null, actorFromSession(gate.session)), 201)
  } catch (error) {
    return toHttpResponse(error, { fallback: "アップロードに失敗しました", context: "Milestone punch photo upload" })
  }
}
