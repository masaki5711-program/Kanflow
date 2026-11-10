import type { WorkerConfig } from "./config"
import { DailyScheduler, type SchedulerLog } from "./scheduler"

/**
 * Night batch of LLM rule drafts (plan 12 E6; PLAN_RULE_DRAFT_SCHEDULE, default 02:30): the requests queued by
 * 実績を確定 are processed one at a time at background priority on the shared Ollama, each after the web users are
 * idle (`waitForTurn`). PLAN_LLM_ASSIST=off or PLAN_RULE_DRAFT_SCHEDULE=off: no batch. See
 * services/plan-llm/rule-drafts.service.ts. The AI review of finalized actuals (services/plan-llm/actuals-review.service.ts)
 * runs in the same batch, after the drafts, the same way (proposals only; a PO / SM decides each).
 */

type DraftConfig = Pick<WorkerConfig, "planRuleDraftTimes">

/** Start the daily scheduler, or null when PLAN_RULE_DRAFT_SCHEDULE=off. */
export function startPlanRuleDraftScheduler(cfg: DraftConfig, log: SchedulerLog, signal?: AbortSignal, waitForTurn?: (signal?: AbortSignal) => Promise<unknown>): DailyScheduler | null {
  if (cfg.planRuleDraftTimes.length === 0) return null
  const scheduler = new DailyScheduler({
    name: "plan-rule-drafts",
    times: cfg.planRuleDraftTimes,
    log,
    run: async () => {
      // Loaded lazily: the worker starts without the plan services when the batch never fires.
      const [{ runRuleDraftBatch }, { runActualsReviewBatch }, { planLlmFromEnv }] = await Promise.all([
        import("@/services/plan-llm/rule-drafts.service"),
        import("@/services/plan-llm/actuals-review.service"),
        import("@/lib/plan-llm/ollama-llm"),
      ])
      const llm = planLlmFromEnv()
      // One after the other (one Ollama call at a time). A thrown drafts batch must not starve the review: the review
      // still runs, then the first failure is rethrown so the scheduler logs it.
      const drafts = await runRuleDraftBatch({ llm, signal, waitForTurn }).then(
        (value) => ({ ok: true as const, value }),
        (error: unknown) => ({ ok: false as const, error })
      )
      const reviews = await runActualsReviewBatch({ llm, signal, waitForTurn })
      if (!drafts.ok) throw drafts.error
      return { drafts: drafts.value, reviews }
    },
  })
  scheduler.start()
  log.info("plan rule-draft batch scheduled", { next: scheduler.nextAt()?.toISOString() })
  return scheduler
}
