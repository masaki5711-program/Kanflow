import { requireAuth } from "@/lib/api-helpers"
import { jsonResponse, toHttpResponse } from "@/services/_shared"
import { listLessonsForScreen } from "@/services/feedback/feedback.lessons.service"
import { searchLessonsSchema } from "@/services/feedback/feedback.schemas"
import { viewerFromSession } from "../_lib"

/**
 * GET /api/feedback/lessons?q=&state=&tech=&projectId=&limit= — the Lessons screen: confirmed / systemized lessons
 * the user may see, plus every lesson they curate (drafts, retired, confidential). `curatable[id]` says whether the
 * action buttons are offered.
 */
export async function GET(request: Request) {
  const gate = await requireAuth()
  if (gate.error) return gate.error
  try {
    const input = searchLessonsSchema.parse(Object.fromEntries(new URL(request.url).searchParams))
    return jsonResponse(await listLessonsForScreen(viewerFromSession(gate.session), input))
  } catch (error) {
    return toHttpResponse(error, { fallback: "教訓を取得できませんでした", context: "feedback lessons GET" })
  }
}
