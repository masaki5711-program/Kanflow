import { can, requireProject } from "@/lib/authz"
import { actorFromSession, jsonResponse, toHttpResponse } from "@/services/_shared"
import { aiJobIdSchema } from "@/services/ai-jobs/ai-jobs.schemas"
import { cancelAiJob, getAiJob } from "@/services/ai-jobs/ai-jobs.service"

type Params = { params: Promise<{ projectId: string; jobId: string }> }

/** One job's status (polled by the dashboard chip). */
export async function GET(_request: Request, { params }: Params) {
  const { projectId, jobId } = await params
  const gate = await requireProject(projectId, "project.view")
  if ("error" in gate) return gate.error
  try {
    return jsonResponse(await getAiJob(projectId, aiJobIdSchema.parse(jobId)))
  } catch (error) {
    return toHttpResponse(error, { fallback: "取得に失敗しました", context: "AiJob GET" })
  }
}

/** Cancel a queued / running job: the requester, or PO / SM / admin (project.update). */
export async function DELETE(_request: Request, { params }: Params) {
  const { projectId, jobId } = await params
  const gate = await requireProject(projectId, "ai.use")
  if ("error" in gate) return gate.error
  try {
    const actor = actorFromSession(gate.session)
    return jsonResponse(await cancelAiJob(projectId, aiJobIdSchema.parse(jobId), actor, can(gate.actor, "project.update")))
  } catch (error) {
    return toHttpResponse(error, { fallback: "キャンセルに失敗しました", context: "AiJob CANCEL" })
  }
}
