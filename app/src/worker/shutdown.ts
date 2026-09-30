/**
 * Ordered, idempotent graceful shutdown.
 *
 * Steps run strictly in order; a failing step is logged and the sequence
 * continues (a failed abort must not keep the lock / DB pool open). If the
 * whole sequence exceeds `timeoutMs`, the process exits with code 1 anyway —
 * the service manager's stop timeout must never be the one that kills us.
 */

export interface ShutdownStep {
  name: string
  run: () => unknown
}

export interface ShutdownLog {
  info(msg: string, fields?: Record<string, unknown>): void
  error(msg: string, fields?: Record<string, unknown>): void
}

export interface ShutdownOptions {
  steps: () => ShutdownStep[]
  timeoutMs: number
  exit: (code: number) => void
  log: ShutdownLog
}

export interface ShutdownCoordinator {
  /** Start the sequence (later calls return the same promise). */
  trigger(reason: string, code?: number): Promise<void>
  readonly triggered: boolean
}

async function runSteps(steps: ShutdownStep[], log: ShutdownLog): Promise<boolean> {
  let clean = true
  for (const step of steps) {
    const t0 = Date.now()
    try {
      await step.run()
      log.info(`shutdown: ${step.name} done`, { ms: Date.now() - t0 })
    } catch (err) {
      clean = false
      log.error(`shutdown: ${step.name} failed`, { error: err instanceof Error ? err.message : String(err) })
    }
  }
  return clean
}

export function createShutdown(opts: ShutdownOptions): ShutdownCoordinator {
  let pending: Promise<void> | null = null
  return {
    get triggered() {
      return pending !== null
    },
    trigger(reason: string, code = 0): Promise<void> {
      if (pending) return pending
      opts.log.info("shutdown requested", { reason, code })
      let timer: ReturnType<typeof setTimeout> | undefined
      const timedOut = new Promise<"timeout">((resolve) => {
        timer = setTimeout(() => resolve("timeout"), opts.timeoutMs)
      })
      pending = Promise.race([runSteps(opts.steps(), opts.log), timedOut]).then((r) => {
        clearTimeout(timer)
        if (r === "timeout") {
          opts.log.error("shutdown timed out; forcing exit", { timeoutMs: opts.timeoutMs })
          opts.exit(1)
          return
        }
        opts.exit(code)
      })
      return pending
    },
  }
}
