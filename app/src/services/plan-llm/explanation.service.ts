/**
 * E6 part 2b / 3 (plan 12 §3.4 "説明の文", §4): the explanation text of an estimate run, written once by the LLM and
 * stored on the run (ja / en / id).
 *
 * Input = only what every estimator can see: source names only of projects that the creator, every explicit PO / SM of
 * the project (holders of plan.estimate; admins see everything and do not narrow it) AND the requester can view NOW,
 * within the run's own visible set. Every other source folds into "other projects n (band)" with the ratio rounded to
 * 0.1. Rules go in as kind + numbers only (never a quote — of this project or any other). Leaves with a source that
 * is no longer usable (confidential now, D-5) are not explained at all: a run with such a source is not explained.
 *
 * The source project ids whose names were given are added to the run's llmSourceIds; a reader who cannot view all of
 * them gets "AI の説明は表示できません" instead of the text (./explanation.view.ts). Nothing here changes the plan:
 * the deterministic card and evidence are what is approved.
 */
import type { Prisma } from "@/generated/prisma/client"
import { logger } from "@/lib/logger"
import { PLAN_LLM_PROMPT_VERSION, planLlmConfig, type PlanLlmConfig } from "@/lib/plan-llm/config"
import { parseExplanation } from "@/lib/plan-llm/parse"
import { runLlmTask, type PlanLlm } from "@/lib/plan-llm/run"
import { EXPLAIN_LEAVES_MAX, explanationInput, type RawExplanationLeaf } from "@/lib/plan-llm/visible"
import { defaultDb, type Db } from "@/services/_shared/db"
import { visibleProjectsOf, type RunSummary } from "@/services/plan-estimate-run/estimate-run.compute"
import { engineOf, evidenceOf, findRun, readExplanation, vanishedSources, viewableOf, type Reader } from "@/services/plan-estimate-run/estimate-run.service"
import type { ExplanationView } from "./explanation.view"

const log = logger.child({ module: "plan-llm-explanation" })

export interface ExplainOptions {
  llm: PlanLlm | null
  config?: PlanLlmConfig
  signal?: AbortSignal
}

/**
 * Write the run's explanation if it has none yet, then return what THIS requester may see of it. Idempotent: a run
 * explained (or failed / skipped) before is not sent again; two concurrent requests write at most one text.
 */
export async function explainRun(projectId: string, runId: string, requester: Reader, options: ExplainOptions, db: Db = defaultDb): Promise<ExplanationView> {
  const config = options.config ?? planLlmConfig(process.env)
  const assistOn = options.llm !== null && config.enabled
  let run = await findRun(projectId, runId, db)
  const stale = (await vanishedSources(run, db)).size > 0
  if (run.llmExplanationState !== null || !options.llm || !config.enabled || stale) return readExplanation(run, requester, stale, assistOn, db)
  const llm = options.llm

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
  const [projects, items, rules] = await Promise.all([
    intersection.size ? db.project.findMany({ where: { id: { in: [...intersection] } }, select: { id: true, name: true } }) : [],
    itemIds.length ? db.planActualsItem.findMany({ where: { id: { in: itemIds } }, select: { id: true, name: true } }) : [],
    evidence.ruleIds.length ? db.planLessonRule.findMany({ where: { id: { in: evidence.ruleIds } }, select: { kind: true, params: true }, orderBy: { id: "asc" } }) : [],
  ])
  const projectName = new Map(projects.map((p) => [p.id, p.name]))
  const itemName = new Map(items.map((i) => [i.id, i.name]))

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
  const built = explanationInput(
    {
      templateEnd: summary.templateEnd,
      p50End: summary.p50End,
      p80End: summary.p80End,
      plannedEnd: summary.plannedEnd,
      bufferDays: summary.bufferDays,
      estimateOn: summary.gateOn,
      matchedProjects: summary.matchedProjects,
    },
    rules,
    raw,
    intersection
  )

  const finish = async (data: Prisma.PlanEstimateRunUpdateManyMutationInput) => {
    // Conditional: only the first writer stores a text; a concurrent one leaves it as it is.
    const res = await db.planEstimateRun.updateMany({ where: { id: run.id, projectId, llmExplanationState: null }, data })
    if (res.count === 0) log.info("explanation already written by a concurrent request", { runId: run.id })
    run = await findRun(projectId, runId, db)
    return readExplanation(run, requester, false, assistOn, db)
  }

  if (built.input.leaves.length === 0 && built.input.rules.length === 0) return finish({ llmExplanationState: "skipped", llmExplainedAt: new Date() })

  const outcome = await runLlmTask(llm, built.input, parseExplanation, { priority: "user", timeoutMs: config.interactiveTimeoutMs, signal: options.signal, label: "plan-explanation" })
  // The names were given whatever the answer: they are recorded either way.
  const sourceIds = [...new Set([...run.llmSourceIds, ...built.sourceIds])].sort()
  const meta = { llmSourceIds: sourceIds, llmModel: llm.model, promptVersion: PLAN_LLM_PROMPT_VERSION, llmExplainedAt: new Date() }
  if (!outcome.ok) {
    if (outcome.reason === "aborted") return readExplanation(run, requester, false, assistOn, db)
    log.warn("run explanation not written; the card shows the deterministic part only", { runId: run.id, projectId, reason: outcome.reason, attempts: outcome.attempts })
    return finish({ ...meta, llmExplanationState: "failed" })
  }
  log.info("run explanation written", { runId: run.id, projectId, sources: built.sourceIds.length, leaves: built.input.leaves.length })
  return finish({ ...meta, llmExplanationState: "ready", llmExplanation: outcome.value as unknown as Prisma.InputJsonValue })
}
