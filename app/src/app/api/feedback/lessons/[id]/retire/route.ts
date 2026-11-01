import { requireAuth } from "@/lib/api-helpers"
import { jsonResponse, toHttpResponse } from "@/services/_shared"
import { retireLesson } from "@/services/feedback/feedback.lessons.service"
import { retireLessonSchema } from "@/services/feedback/feedback.schemas"
import { idParam, readBody, viewerFromSession } from "../../../_lib"

type Params = { params: Promise<{ id: string }> }

/** POST /api/feedback/lessons/:id/retire — only a user who curates the lesson's scope (docs/authorization.md "Feedback loop"). */
export async function POST(request: Request, { params }: Params) {
  const gate = await requireAuth()
  if (gate.error) return gate.error
  try {
    const body = await readBody(request)
    const { id } = await params
    return jsonResponse({ lesson: await retireLesson(viewerFromSession(gate.session), idParam.parse(id), retireLessonSchema.parse(body)) })
  } catch (error) {
    return toHttpResponse(error, { fallback: "教訓を更新できませんでした", context: "feedback lesson retire POST" })
  }
}
