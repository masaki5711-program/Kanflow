import { requireAuth } from "@/lib/api-helpers"
import { jsonResponse, toHttpResponse } from "@/services/_shared"
import { getFeedbackMetrics } from "@/services/feedback/feedback.metrics.service"
import { viewerFromSession } from "../_lib"

/** GET /api/feedback/metrics — recurrence rate, time to resolve, systemized share, top failures (curators; `{ metrics: null }` for others). */
export async function GET() {
  const gate = await requireAuth()
  if (gate.error) return gate.error
  try {
    return jsonResponse({ metrics: await getFeedbackMetrics(viewerFromSession(gate.session)) })
  } catch (error) {
    return toHttpResponse(error, { fallback: "集計を取得できませんでした", context: "feedback metrics GET" })
  }
}
