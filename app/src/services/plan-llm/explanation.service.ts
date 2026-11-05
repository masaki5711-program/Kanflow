/**
 * E6 part 2b / 3 (plan 12 §3.4 "説明の文", §4): the explanation text of an estimate run, written once by the LLM and
 * stored on the run (ja / en / id, with the keys of the items it describes).
 *
 * Input = only what every estimator can see: source names only of projects that the creator, every explicit PO / SM of
 * the project (holders of plan.estimate; admins see everything and do not narrow it) AND the requester can view NOW,
 * within the run's own visible set. Every other source folds into "other projects n (band)" with the ratio rounded to
 * 0.1. Rules go in as kind + numbers only (never a quote — of this project or any other — and only rules whose cited
 * sources are not confidential now). A run with a source that is no longer usable (confidential now, D-5), or that
 * expired, is not explained.
 *
 * One attempt at a time: an attempt is claimed by stamping llmExplainedAt; a failure of Ollama (down, slow, an error
 * status) leaves the state open and the next attempt waits EXPLAIN_RETRY_AFTER_MS; an invalid answer twice (or a
 * defect) is stored as `failed`. The source project ids whose names were given are added to the run's llmSourceIds
 * whatever the outcome; a reader who cannot view all of them, or whose card withholds an item the text describes, gets
 * "AI の説明は表示できません" instead (./explanation.view.ts). Nothing here changes the plan.
 */
import type { Prisma } from "@/generated/prisma/client"
import { logger } from "@/lib/logger"
import { PLAN_LLM_PROMPT_VERSION, planLlmConfig, type PlanLlmConfig } from "@/lib/plan-llm/config"
import { parseExplanation } from "@/lib/plan-llm/parse"
import { runLlmTask, type PlanLlm } from "@/lib/plan-llm/run"
import { EXPLAIN_LEAVES_MAX, explanationInput, type RawExplanationLeaf } from "@/lib/plan-llm/visible"
import { defaultDb, type Db } from "@/services/_shared/db"
import { visibleProjectsOf, type RunSummary } from "@/services/plan-estimate-run/estimate-run.compute"
import { engineOf, evidenceOf, findRun, readExplanation, vanishedSources, viewableOf, type Reader, type StoredRun } from "@/services/plan-estimate-run/estimate-run.service"
import { sourceConfidentiality } from "@/services/plan-lesson-rules/lesson-rules.service"
import { attemptedRecently, EXPLAIN_RETRY_AFTER_MS, type ExplanationView, type StoredExplanationText } from "./explanation.view"

const log = logger.child({ module: "plan-llm-explanation" })

export interface ExplainOptions {
  llm: PlanLlm | null
  config?: PlanLlmConfig
  signal?: AbortSignal
  now?: () => Date
}

/** The explanation input of a run, for `requester`, built from what every estimator can see now. */
async function buildInput(projectId: string, run: StoredRun, requester: Reader, db: Db) {
  const summary = run.summary as RunSummary
  const evidence = evidenceOf(run)
  const engine = engineOf(run)
  const byKey = new Map(evidence.leaves.map((l) => [l.key, l]))
  const changed = summary.changes.slice(0, EXPLAIN_LEAVES_MAX).flatMap((c) => {
    const leaf = byKey.get(c.key)
    return leaf ? [{ change: c, leaf }] : []
  })

  // Visible now to every estimator and the requester, within the run's own visible set.
  const candidateIds = [...new Set(changed.flatMap(({ leaf }) => (leaf.estimate?.kept ?? []).map((k) => k.sourceProjectId)))]
  const runVisible = new Set(engine.fixed.visibleProjectIds)
  const forEstimators = new Set(await visibleProjectsOf(projectId, engine.creator, candidateIds.filter((id) => runVisible.has(id)), db))
  const forRequester = await viewableOf(requester, [...forEstimators], db)
  const intersection = new Set([...forEstimators].filter((id) => forRequester.has(id)))

  const itemIds = [...new Set(changed.flatMap(({ leaf }) => (leaf.estimate?.kept ?? []).map((k) => k.snapshotItemId)))]
  const [projects, items, ruleRows] = await Promise.all([
    intersection.size ? db.project.findMany({ where: { id: { in: [...intersection] } }, select: { id: true, name: true } }) : [],
    itemIds.length ? db.planActualsItem.findMany({ where: { id: { in: itemIds } }, select: { id: true, name: true } }) : [],
    evidence.ruleIds.length ? db.planLessonRule.findMany({ where: { id: { in: evidence.ruleIds } }, orderBy: { id: "asc" } }) : [],
  ])
  const projectName = new Map(projects.map((p) => [p.id, p.name]))
  const itemName = new Map(items.map((i) => [i.id, i.name]))
  // A rule whose cited source is confidential now does not go in at all (only kind + numbers would, but D-5 holds).
  const taint = await sourceConfidentiality(db, ruleRows)
  const rules = ruleRows.filter((r) => taint.get(r.id) === false).map((r) => ({ kind: r.kind, params: r.params }))

  const raw: RawExplanationLeaf[] = changed.map(({ change, leaf }) => {
    const est = leaf.estimate
    return {
      key: leaf.key,
      name: leaf.name,
      templateDays: change.templateDays,
      days: change.days,
      p80Days: est?.d80 ?? null,
      ratio: est?.r50 ?? null,
      // A source whose name could not be resolved for everyone stays out of the names (it folds into the band).
      sources: (est?.kept ?? []).map((k) => ({
        sourceProjectId: intersection.has(k.sourceProjectId) && projectName.has(k.sourceProjectId) ? k.sourceProjectId : `unnamed:${k.sourceProjectId}`,
        projectName: projectName.get(k.sourceProjectId) ?? "",
        itemName: itemName.get(k.snapshotItemId) ?? "",
      })),
      hiddenProjectCount: est?.hiddenSourceProjectIds.length ?? 0,
      addedByRule: leaf.addedByRule !== null,
    }
  })
  return explanationInput(
    { templateEnd: summary.templateEnd, p50End: summary.p50End, p80End: summary.p80End, plannedEnd: summary.plannedEnd, bufferDays: summary.bufferDays, estimateOn: summary.gateOn, matchedProjects: summary.matchedProjects },
    rules,
    raw,
    intersection
  )
}

/**
 * Write the run's explanation if it has none yet (and no attempt is under way or failed recently), then return what
 * THIS requester may see of it. A run explained, failed or skipped before is not sent again.
 */
export async function explainRun(projectId: string, runId: string, requester: Reader, options: ExplainOptions, db: Db = defaultDb): Promise<ExplanationView> {
  const config = options.config ?? planLlmConfig(process.env)
  const now = options.now ?? (() => new Date())
  const assistOn = options.llm !== null && config.enabled
  let run = await findRun(projectId, runId, db)
  const staleNow = async () => (await vanishedSources(run, db)).size > 0
  const view = async () => readExplanation(run, requester, await staleNow(), assistOn, db, now())
  const t = now()
  if (run.llmExplanationState !== null || !options.llm || !config.enabled || run.expiresAt.getTime() <= t.getTime() || attemptedRecently(run.llmExplainedAt, t)) return view()
  if (await staleNow()) return view()
  const llm = options.llm

  // Claim the attempt: one at a time, and none again within EXPLAIN_RETRY_AFTER_MS of the last one.
  const claimed = await db.planEstimateRun.updateMany({
    where: { id: run.id, projectId, llmExplanationState: null, OR: [{ llmExplainedAt: null }, { llmExplainedAt: { lt: new Date(t.getTime() - EXPLAIN_RETRY_AFTER_MS) } }] },
    data: { llmExplainedAt: t },
  })
  if (claimed.count !== 1) {
    run = await findRun(projectId, runId, db)
    return view()
  }

  const built = await buildInput(projectId, run, requester, db)
  if (built.omitted > 0) log.info("explanation: items left out to fit the prompt", { runId: run.id, omitted: built.omitted, sent: built.input.leaves.length })
  const record = async (data: Prisma.PlanEstimateRunUpdateManyMutationInput) => {
    // Only while the explanation is still open (a concurrent writer cannot be overwritten).
    const res = await db.planEstimateRun.updateMany({ where: { id: run.id, projectId, llmExplanationState: null }, data })
    if (res.count === 0) log.info("explanation already settled by a concurrent request", { runId: run.id })
    run = await findRun(projectId, runId, db)
  }
  if (built.input.leaves.length === 0 && built.input.rules.length === 0) {
    await record({ llmExplanationState: "skipped", llmExplainedAt: now() })
    return view()
  }

  const outcome = await runLlmTask(llm, built.input, parseExplanation, { priority: "user", timeoutMs: config.interactiveTimeoutMs, signal: options.signal, label: "plan-explanation" })
  // The names were given whatever the answer: they are recorded either way.
  const meta = { llmSourceIds: [...new Set([...run.llmSourceIds, ...built.sourceIds])].sort(), llmModel: llm.model, promptVersion: PLAN_LLM_PROMPT_VERSION }
  if (!outcome.ok) {
    if (outcome.reason === "invalid" || outcome.reason === "error") {
      log.warn("run explanation not written; the card shows the deterministic part only", { runId: run.id, projectId, reason: outcome.reason, attempts: outcome.attempts })
      await record({ ...meta, llmExplanationState: "failed", llmExplainedAt: now() })
      return view()
    }
    // Ollama down / slow / an error status, or the request was cancelled: try again later (after the wait).
    log.warn("run explanation postponed: the LLM did not answer", { runId: run.id, projectId, reason: outcome.reason, retryAfterMs: EXPLAIN_RETRY_AFTER_MS })
    await record(meta)
    return { state: "failed" }
  }
  const text: StoredExplanationText = { ...outcome.value, keys: built.input.leaves.map((l) => l.key) }
  log.info("run explanation written", { runId: run.id, projectId, sources: built.sourceIds.length, leaves: built.input.leaves.length })
  await record({ ...meta, llmExplanationState: "ready", llmExplanation: text as unknown as Prisma.InputJsonValue, llmExplainedAt: now() })
  // Read with the confidentiality check of NOW (a source may have become unusable while the model was writing).
  return view()
}
