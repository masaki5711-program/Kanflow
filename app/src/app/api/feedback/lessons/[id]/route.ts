import { requireAuth } from "@/lib/api-helpers"
import { jsonResponse, toHttpResponse } from "@/services/_shared"
import { getLessonDetail } from "@/services/feedback/feedback.lessons.service"
import { idParam, viewerFromSession } from "../../_lib"

type Params = { params: Promise<{ id: string }> }

/** GET /api/feedback/lessons/:id — one lesson; curators also get the failure history of its signature. */
export async function GET(_request: Request, { params }: Params) {
  const gate = await requireAuth()
  if (gate.error) return gate.error
  try {
    const { id } = await params
    return jsonResponse(await getLessonDetail(viewerFromSession(gate.session), idParam.parse(id)))
  } catch (error) {
    return toHttpResponse(error, { fallback: "教訓を取得できませんでした", context: "feedback lesson GET" })
  }
}
