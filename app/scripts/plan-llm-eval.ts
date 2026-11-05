/**
 * Live evaluation of the LLM rule drafts (plan 12 E6) on the SYNTHETIC evaluation set
 * (src/lib/plan-llm/eval/rule-draft-eval.ts). Sends the synthetic cases to the local Ollama (OLLAMA_BASE_URL) at
 * BACKGROUND priority with the analysis model — the resident one, no model switch — and prints the scores as JSON.
 * Reads no database and writes nothing. Run it when the shared Ollama is quiet (e.g. at night):
 *
 *   node --import tsx scripts/plan-llm-eval.ts --live
 *   node --import tsx scripts/plan-llm-eval.ts --reference     scores the reference answers (no Ollama)
 *
 * Without one of the flags it refuses, so nothing reaches the shared Ollama by accident.
 */
import { planLlmConfig } from "../src/lib/plan-llm/config"
import { caseInput, REFERENCE_ANSWERS, RULE_DRAFT_EVAL_SET, scoreCase, summarize, type CaseScore } from "../src/lib/plan-llm/eval/rule-draft-eval"
import { ollamaPlanLlm } from "../src/lib/plan-llm/ollama-llm"
import { parseRuleDrafts } from "../src/lib/plan-llm/parse"
import { runLlmTask } from "../src/lib/plan-llm/run"

async function main(): Promise<void> {
  const live = process.argv.includes("--live")
  const reference = process.argv.includes("--reference")
  if (live === reference) {
    console.error("pass exactly one of --live (asks the local Ollama) or --reference (no Ollama)")
    process.exit(2)
  }
  const scores: (CaseScore & { failure?: string })[] = []
  if (reference) {
    for (const c of RULE_DRAFT_EVAL_SET) scores.push(scoreCase(c, REFERENCE_ANSWERS[c.id]))
  } else {
    const llm = ollamaPlanLlm()
    const config = planLlmConfig(process.env)
    for (const c of RULE_DRAFT_EVAL_SET) {
      let answer = ""
      const input = caseInput(c)
      // The same runner as production (one retry on an invalid answer); the raw answer is kept for scoring.
      const outcome = await runLlmTask(llm, input, (text) => {
        answer = text
        return parseRuleDrafts(text, input)
      }, { priority: "background", timeoutMs: config.batchTimeoutMs, label: "plan-llm-eval" })
      scores.push(outcome.ok ? scoreCase(c, answer) : { ...scoreCase(c, ""), failure: outcome.reason })
    }
  }
  console.log(JSON.stringify({ mode: live ? "live" : "reference", summary: summarize(scores), cases: scores }, null, 2))
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : String(err))
  process.exit(1)
})
