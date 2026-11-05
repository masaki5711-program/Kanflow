/**
 * E6 part 2a (plan 12 §3.1 / §3.4): at proposal time the LLM helps accept / reject the stage-3 / 4 candidates of a
 * run. It sees the item names of VISIBLE candidates only (the run's visible set: projects the creator and every PO / SM
 * can view) and answers with the subset of candidate ids to keep; similarity and weights stay the formula's. A hidden
 * candidate is never sent and never rejected. Any failure (timeout, Ollama down, invalid twice) means no rejection:
 * the formula alone, with the failure recorded on the run (summary.assist) and logged.
 */
import { planLlmConfig, type PlanLlmConfig } from "@/lib/plan-llm/config"
import { parseCandidateReview } from "@/lib/plan-llm/parse"
import { runLlmTask, type PlanLlm } from "@/lib/plan-llm/run"
import { candidateReviewInput } from "@/lib/plan-llm/visible"
import { logger } from "@/lib/logger"
import type { CandidateReviewer } from "@/services/plan-estimate-run/estimate-run.compute"

const log = logger.child({ module: "plan-llm-candidates" })

export function candidateReviewer(llm: PlanLlm, config: PlanLlmConfig = planLlmConfig(process.env), signal?: AbortSignal): CandidateReviewer {
  return async (leaves, visibleProjectIds) => {
    const built = candidateReviewInput(leaves, visibleProjectIds)
    // Leaves left out to fit the prompt keep the formula's decision (like hidden candidates).
    if (built.omitted > 0) log.info("candidate review: leaves left out to fit the prompt", { omitted: built.omitted, sent: built.input.leaves.length })
    if (built.candidates.size === 0) return { state: "no_candidates", rejected: 0, sourceIds: [], model: null, rejectedCandidates: {} }
    const outcome = await runLlmTask(llm, built.input, (text) => parseCandidateReview(text, built), {
      priority: "user",
      timeoutMs: config.interactiveTimeoutMs,
      signal,
      label: "plan-candidates",
    })
    // The names were sent whatever the answer: the ids are recorded either way.
    if (!outcome.ok) return { state: outcome.reason, rejected: 0, sourceIds: built.sourceIds, model: llm.model, rejectedCandidates: {} }
    return { state: "applied", rejected: outcome.value.rejectedCount, sourceIds: built.sourceIds, model: llm.model, rejectedCandidates: outcome.value.rejected }
  }
}
