import { AI_JOB_HANDLERS } from "./handlers"
import { notifyJobFinished } from "./notify"
import { AiJobRunner, type RunnerLog } from "./runner"
import type { AiJobRunnerEnvConfig } from "./runner-config"
import { createAiJobStore } from "./store"

export { AiJobRunner } from "./runner"
export { DEFAULT_AI_JOB_YIELD_MAX_MS, loadAiJobRunnerConfig, type AiJobRunnerEnvConfig } from "./runner-config"

/**
 * The real runner: AiJob table, report handlers, requester notifications.
 * `waitForTurn` decides how politely a job waits for users (the worker waits
 * for peers via the remote AI gate; a web process for its own local gate).
 */
export function createAiJobRunner(opts: {
  log: RunnerLog
  config: AiJobRunnerEnvConfig
  waitForTurn?: (signal: AbortSignal) => Promise<void>
}): AiJobRunner {
  return new AiJobRunner({
    store: createAiJobStore(),
    handlers: AI_JOB_HANDLERS,
    onFinished: async (job, outcome) => {
      await notifyJobFinished(job, outcome)
    },
    waitForTurn: opts.waitForTurn,
    log: opts.log,
    pollMs: opts.config.pollMs,
    staleMs: opts.config.staleMs,
  })
}

/**
 * Wait until this process's own priority gate is idle (no user AI call in
 * flight or within `quietMs`), at most `maxWaitMs`. Used by the in-process
 * (web) runner, which has no remote peers to watch.
 */
export async function waitForLocalGate(
  isIdle: () => boolean,
  signal: AbortSignal,
  maxWaitMs: number,
  pollMs = 1000,
  now: () => number = () => Date.now()
): Promise<void> {
  const deadline = now() + maxWaitMs
  while (!signal.aborted && !isIdle() && now() < deadline) {
    await new Promise<void>((resolve) => {
      const t = setTimeout(resolve, pollMs)
      signal.addEventListener("abort", () => { clearTimeout(t); resolve() }, { once: true })
    })
  }
}
