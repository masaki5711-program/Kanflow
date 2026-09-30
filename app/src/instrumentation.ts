/**
 * Next.js server start hook.
 *
 * The background translation loop does NOT run in web processes by default:
 * it runs in the standalone worker (`npm run worker`, Windows service
 * `kanflow-worker`, see docs/operations/worker.md). Web processes only
 * answer GET /api/internal/ai-busy so that worker can yield to users.
 *
 * AI_TRANSLATION_WORKER=inprocess restores the old behaviour (loop inside
 * every `next start`); `next dev` additionally needs
 * AI_TRANSLATION_WORKER_IN_DEV=true. See lib/translation/worker-mode.ts.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return
  const { decideInProcessWorker } = await import("@/lib/translation/worker-mode")
  const { logger } = await import("@/lib/logger")
  const log = logger.child({ module: "instrumentation" })
  const decision = decideInProcessWorker(process.env)
  if (!decision.start) {
    if (decision.mode === "external" && process.env.NODE_ENV === "production") {
      log.warn("translation worker not started in this web process; make sure the kanflow-worker service is running", {
        reason: decision.reason,
      })
    } else {
      log.info("translation worker not started in this process", { reason: decision.reason })
    }
    return
  }
  const { startTranslationWorker } = await import("@/lib/translation/worker")
  startTranslationWorker()
  log.info("in-process translation worker started", { reason: decision.reason })
  // Optional: yield to user AI calls of OTHER web processes too (explicit peers only).
  if (process.env.AI_GATE_PEERS?.trim()) {
    const { createRemoteGate } = await import("@/lib/ai-gate")
    const { setWorkerAdmission } = await import("@/lib/translation/worker")
    const remote = createRemoteGate(process.env, log)
    remote.start()
    setWorkerAdmission(() => remote.admit())
  }
}
