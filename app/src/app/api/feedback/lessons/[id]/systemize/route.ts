import { requireAuth } from "@/lib/api-helpers"
import { jsonResponse, toHttpResponse } from "@/services/_shared"
import { systemizeLesson } from "@/services/feedback/feedback.lessons.service"
import { systemizeLessonSchema } from "@/services/feedback/feedback.schemas"
import { idParam, readBody, viewerFromSession } from "../../../_lib"

type Params = { params: Promise<{ id: string }> }

/** POST /api/feedback/lessons/:id/systemize — only a user who curates the lesson's scope (docs/authorization.md "Feedback loop"). */
export async function POST(request: Request, { params }: Params) {
  const gate = await requireAuth()
  if (gate.error) return gate.error
  try {
    const body = await readBody(request)
    const { id } = await params
    return jsonResponse({ lesson: await systemizeLesson(viewerFromSession(gate.session), idParam.parse(id), systemizeLessonSchema.parse(body)) })
  } catch (error) {
    return toHttpResponse(error, { fallback: "教訓を更新できませんでした", context: "feedback lesson systemize POST" })
  }
}
