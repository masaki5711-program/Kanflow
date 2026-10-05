import { requireProject } from "@/lib/authz"
import { PHOTO_PHASES, type PhotoPhase } from "@/lib/improvement/constants"
import { actorFromSession, jsonResponse, toHttpResponse, ValidationError } from "@/services/_shared"
import { listPhotos, uploadPhoto } from "@/services/improvements/improvements.photos"

type Params = { params: Promise<{ projectId: string; id: string }> }

export async function GET(_request: Request, { params }: Params) {
  const { projectId, id } = await params
  const gate = await requireProject(projectId, "project.view")
  if ("error" in gate) return gate.error

  try {
    return jsonResponse(await listPhotos(projectId, id))
  } catch (error) {
    return toHttpResponse(error, { fallback: "取得に失敗しました", context: "Improvement photos GET" })
  }
}

function parsePhase(raw: FormDataEntryValue | null): PhotoPhase {
  if (typeof raw === "string" && (PHOTO_PHASES as readonly string[]).includes(raw)) return raw as PhotoPhase
  throw new ValidationError("phase は before / after のどちらかです")
}

/** multipart/form-data with `phase` (before | after) and one image `file`: any member (improvement.track). */
export async function POST(request: Request, { params }: Params) {
  const { projectId, id } = await params
  const gate = await requireProject(projectId, "improvement.track")
  if ("error" in gate) return gate.error

  try {
    const formData = await request.formData()
    const phase = parsePhase(formData.get("phase"))
    const file = formData.get("file") as File | null
    return jsonResponse(await uploadPhoto(projectId, id, phase, file, actorFromSession(gate.session)), 201)
  } catch (error) {
    return toHttpResponse(error, { fallback: "アップロードに失敗しました", context: "Improvement photo upload" })
  }
}
