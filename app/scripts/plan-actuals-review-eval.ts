/**
 * Evaluation of the AI review of finalized actuals on the SYNTHETIC evaluation set
 * (src/lib/plan-llm/eval/actuals-review-eval-set.ts), through the production path (visible input, prompt, one retry,
 * validators). Reads no database and writes nothing but the report. Run it when the shared Ollama is quiet:
 *
 *   node --import tsx scripts/plan-actuals-review-eval.ts --live [--runs 3] [--out <dir>]
 *       asks the LOCAL Ollama (OLLAMA_BASE_URL, OLLAMA_MODEL_ANALYSIS — the resident analysis model, BACKGROUND
 *       priority, PLAN_LLM_BATCH_TIMEOUT_MS per case). A non-local host or an Ollama "cloud" model is refused.
 *   node --import tsx scripts/plan-actuals-review-eval.ts --fake[=reference|naive|obedient|paraphrasing|garbage]
 *       a deterministic fake model (no Ollama): checks the harness itself.
 *
 * Prints the summary as JSON; with --out also writes actuals-review-eval.json / .md there (ids, labels and numbers
 * only). Exit code: 0 when every run passes the proposed default-on gate, 3 when one does not, 2 on bad arguments.
 * Without --live or --fake it refuses, so nothing reaches the shared Ollama by accident.
 */
import { mkdirSync, writeFileSync } from "node:fs"
import path from "node:path"
import { OLLAMA_BASE_URL } from "../src/lib/ollama/config"
import { OLLAMA_MODELS } from "../src/lib/ollama"
import { planLlmConfig } from "../src/lib/plan-llm/config"
import { endpointProblem, FAKE_MODELS, gateChecks, renderMarkdown, runEvaluation, type FakeModelName } from "../src/lib/plan-llm/eval/actuals-review-eval"
import { ollamaPlanLlm } from "../src/lib/plan-llm/ollama-llm"
import type { PlanLlm } from "../src/lib/plan-llm/run"

function arg(name: string): string | undefined {
  const i = process.argv.findIndex((a) => a === name || a.startsWith(`${name}=`))
  if (i < 0) return undefined
  const a = process.argv[i]
  return a.includes("=") ? a.slice(a.indexOf("=") + 1) : (process.argv[i + 1] ?? "")
}

function fail(message: string, code: number): never {
  console.error(message)
  process.exit(code)
}

async function main(): Promise<void> {
  const live = process.argv.includes("--live")
  const fakeArg = process.argv.find((a) => a === "--fake" || a.startsWith("--fake="))
  if (live === Boolean(fakeArg)) fail("pass exactly one of --live (asks the local Ollama) or --fake[=<name>] (no Ollama)", 2)
  const runs = Number(arg("--runs") ?? (live ? 3 : 1))
  if (!Number.isInteger(runs) || runs < 1 || runs > 10) fail("--runs must be 1..10", 2)
  const out = arg("--out")

  let llm: PlanLlm
  if (live) {
    const problem = endpointProblem(OLLAMA_BASE_URL, OLLAMA_MODELS.analysis, (process.env.PLAN_LLM_EVAL_ALLOWED_HOSTS ?? "").split(","))
    if (problem) fail(`refused: ${problem}`, 2)
    llm = ollamaPlanLlm()
  } else {
    const name = (fakeArg?.includes("=") ? fakeArg.slice(fakeArg.indexOf("=") + 1) : "reference") as FakeModelName
    if (!(name in FAKE_MODELS)) fail(`unknown fake model "${name}" (${Object.keys(FAKE_MODELS).join(", ")})`, 2)
    llm = FAKE_MODELS[name]()
  }

  const timeoutMs = planLlmConfig(process.env).batchTimeoutMs
  const results = []
  for (let n = 0; n < runs; n++) {
    const r = await runEvaluation(llm, { timeoutMs })
    results.push({ model: llm.model, ...r })
  }
  const gates = results.map((r) => gateChecks(r.summary))
  const pass = gates.every((g) => g.every((c) => c.pass))
  const report = {
    mode: live ? "live" : "fake",
    model: llm.model,
    at: new Date().toISOString(),
    pass,
    runs: results.map((r, i) => ({ summary: r.summary, gate: gates[i], projects: r.outcomes })),
  }
  if (out) {
    mkdirSync(out, { recursive: true })
    writeFileSync(path.join(out, "actuals-review-eval.json"), `${JSON.stringify(report, null, 2)}\n`)
    writeFileSync(path.join(out, "actuals-review-eval.md"), renderMarkdown(results, report.at))
  }
  console.log(JSON.stringify({ mode: report.mode, model: report.model, pass, runs: results.map((r, i) => ({ summary: r.summary, failed: gates[i].filter((c) => !c.pass).map((c) => c.name) })) }, null, 2))
  if (!pass) process.exit(3)
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : String(err))
  process.exit(1)
})
