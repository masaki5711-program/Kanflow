import { can, requireProject } from "@/lib/authz"
import { planLlmFromEnv } from "@/lib/plan-llm/ollama-llm"
import { jsonResponse, toHttpResponse } from "@/services/_shared"
import { explainRun } from "@/services/plan-llm/explanation.service"

type Params = { params: Promise<{ projectId: string; runId: string }> }

/**
 * The AI explanation of an estimate run (plan 12 E6): written once by the local LLM from what every estimator can see,
 * then stored; answers what THIS reader may see of it ({ explanation: { state, text? } }). Needs plan.estimate, like
 * the card. A run of another project answers 404 like a missing one. When the LLM is down or slow the answer is
 * { state: "failed" } (logged) and the card stays the deterministic one.
 */
export async function POST(request: Request, { params }: Params) {
  const { projectId, runId } = await params
  const gate = await requireProject(projectId, "plan.estimate")
  if ("error" in gate) return gate.error
  try {
    const reader = { userId: gate.actor.userId, systemRole: gate.actor.systemRole, canViewMemberLoad: can(gate.actor, "plan.viewMemberLoad") }
    return jsonResponse({ explanation: await explainRun(projectId, runId, reader, { llm: planLlmFromEnv(), signal: request.signal }) })
  } catch (error) {
    return toHttpResponse(error, { fallback: "AI の説明を作れませんでした", context: "Plan ESTIMATE explanation" })
  }
}
