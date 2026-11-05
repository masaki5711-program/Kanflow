import type { WorkerConfig } from "./config"
import { DailyScheduler, type SchedulerLog } from "./scheduler"

/**
 * Night batch of LLM rule drafts (plan 12 E6; PLAN_RULE_DRAFT_SCHEDULE, default 02:30): the requests queued by
 * 実績を確定 are processed one at a time at background priority on the shared Ollama, each after the web users are
 * idle (`waitForTurn`). PLAN_LLM_ASSIST=off or PLAN_RULE_DRAFT_SCHEDULE=off: no batch. See
 * services/plan-llm/rule-drafts.service.ts.
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
      const [{ runRuleDraftBatch }, { planLlmFromEnv }] = await Promise.all([import("@/services/plan-llm/rule-drafts.service"), import("@/lib/plan-llm/ollama-llm")])
      return runRuleDraftBatch({ llm: planLlmFromEnv(), signal, waitForTurn })
    },
  })
  scheduler.start()
  log.info("plan rule-draft batch scheduled", { next: scheduler.nextAt()?.toISOString() })
  return scheduler
}
