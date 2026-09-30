import { requireProject } from "@/lib/authz"
import { AI_JOB_RATE_LIMIT, consumeRateLimit } from "@/lib/rate-limit"
import { actorFromSession, errorResponse, jsonResponse, toHttpResponse } from "@/services/_shared"
import { createAiJobSchema } from "@/services/ai-jobs/ai-jobs.schemas"
import { listActiveAiJobs, requestAiJob } from "@/services/ai-jobs/ai-jobs.service"

type Params = { params: Promise<{ projectId: string }> }

/** Queued / running report jobs of the project → `{ items, runner }` (the reports panel). */
export async function GET(_request: Request, { params }: Params) {
  const { projectId } = await params
  const gate = await requireProject(projectId, "project.view")
  if ("error" in gate) return gate.error
  try {
    return jsonResponse(await listActiveAiJobs(projectId))
  } catch (error) {
    return toHttpResponse(error, { fallback: "取得に失敗しました", context: "AiJob LIST" })
  }
}

/**
 * `{ kind: "progress_report", lang }` → 202 `{ job, deduped }`. A job of the
 * same kind already queued / running in this project is returned instead of
 * a new one. 503 `{ reason: "ai_jobs_disabled" }` when no job runner is
 * configured — the client then uses the streaming endpoint.
 */
export async function POST(request: Request, { params }: Params) {
  const { projectId } = await params
  const gate = await requireProject(projectId, "ai.use")
  if ("error" in gate) return gate.error
  const retryAfter = consumeRateLimit("ai-jobs", AI_JOB_RATE_LIMIT, gate.actor.userId)
  if (retryAfter) return errorResponse(429, "Too many requests", "RATE_LIMITED", { headers: { "Retry-After": retryAfter } })
  try {
    const input = createAiJobSchema.parse(await request.json())
    return jsonResponse(await requestAiJob(projectId, input, actorFromSession(gate.session)), 202)
  } catch (error) {
    return toHttpResponse(error, { fallback: "レポートの生成を開始できませんでした", context: "AiJob CREATE" })
  }
}
