/**
 * Background AI job loop (one job at a time per process).
 *
 * tick: sweep stale `running` rows (a crashed process) → claim the oldest
 * queued job (conditional update, safe with several runners) → wait for the
 * AI gate (users first) → run the kind's handler with an AbortSignal →
 * done / failed. While a job runs, its row is polled so a cancel from the UI
 * aborts it within `cancelPollMs`. `stop()` aborts the current job and puts
 * it back to `queued` (the next process start picks it up again).
 *
 * Pure orchestration: storage, handlers, the gate wait and notifications are
 * injected (see ./index.ts for the real wiring).
 */

export interface ClaimedJob {
  id: string
  projectId: string
  userId: string | null
  kind: string
  params: Record<string, unknown>
  attempts: number
}

export interface AiJobStore {
  sweepStale(startedBefore: Date, maxAttempts: number): Promise<{ requeued: number; failed: number }>
  claimNext(): Promise<ClaimedJob | null>
  setProgress(jobId: string, progress: number): Promise<void>
  complete(jobId: string, reportId: string): Promise<boolean>
  fail(jobId: string, error: string): Promise<boolean>
  requeue(jobId: string): Promise<void>
  statusOf(jobId: string): Promise<string | null>
}

export interface JobResult {
  reportId: string
  title: string
}

export interface JobContext {
  signal: AbortSignal
  /** 0–100; best effort. */
  progress: (pct: number) => Promise<void>
}

export type AiJobHandler = (job: ClaimedJob, ctx: JobContext) => Promise<JobResult>

export type JobOutcome = { status: "done"; result: JobResult } | { status: "failed"; error: string }

export interface RunnerLog {
  info(msg: string, fields?: Record<string, unknown>): void
  warn(msg: string, fields?: Record<string, unknown>): void
  error(msg: string, fields?: Record<string, unknown>): void
}

export interface AiJobRunnerOptions {
  store: AiJobStore
  handlers: Readonly<Record<string, AiJobHandler>>
  /** Awaited after claiming, before the model is used (yield to users). */
  waitForTurn?: (signal: AbortSignal) => Promise<void>
  /** Called once a job finished (notifications). Must not throw; failures are logged. */
  onFinished?: (job: ClaimedJob, outcome: JobOutcome) => Promise<void>
  log: RunnerLog
  pollMs?: number
  cancelPollMs?: number
  /** A `running` row older than this belongs to a dead process. */
  staleMs?: number
  maxAttempts?: number
  sweepEveryMs?: number
  now?: () => number
}

export const DEFAULT_AI_JOB_POLL_MS = 5_000
export const DEFAULT_AI_JOB_STALE_MS = 30 * 60_000
const DEFAULT_CANCEL_POLL_MS = 5_000
const DEFAULT_MAX_ATTEMPTS = 2
const DEFAULT_SWEEP_EVERY_MS = 60_000
const ERROR_MAX = 1000

class ShutdownAbort extends Error {
  constructor() {
    super("runner stopping")
    this.name = "ShutdownAbort"
  }
}

class CancelledAbort extends Error {
  constructor() {
    super("cancelled by a user")
    this.name = "CancelledAbort"
  }
}

function message(err: unknown): string {
  return (err instanceof Error ? err.message : String(err)).slice(0, ERROR_MAX)
}

export class AiJobRunner {
  private timer: ReturnType<typeof setTimeout> | null = null
  private running = false
  private stopped = true
  /** start() was called at least once (tick() alone — tests — never treats itself as stopped). */
  private loopStarted = false
  private lastSweepAt = 0
  private currentJob: { job: ClaimedJob; controller: AbortController; done: Promise<void> } | null = null
  private loopDone: Promise<void> = Promise.resolve()
  private readonly o: Required<Omit<AiJobRunnerOptions, "waitForTurn" | "onFinished">> &
    Pick<AiJobRunnerOptions, "waitForTurn" | "onFinished">

  constructor(options: AiJobRunnerOptions) {
    this.o = {
      pollMs: DEFAULT_AI_JOB_POLL_MS,
      cancelPollMs: DEFAULT_CANCEL_POLL_MS,
      staleMs: DEFAULT_AI_JOB_STALE_MS,
      maxAttempts: DEFAULT_MAX_ATTEMPTS,
      sweepEveryMs: DEFAULT_SWEEP_EVERY_MS,
      now: () => Date.now(),
      ...options,
    }
  }

  /** The job being processed, if any (heartbeat / logs). */
  current(): { id: string; kind: string } | null {
    return this.currentJob ? { id: this.currentJob.job.id, kind: this.currentJob.job.kind } : null
  }

  start(): void {
    if (!this.stopped) return
    this.stopped = false
    this.loopStarted = true
    this.schedule(0)
  }

  /** Stop polling, abort the current job (it goes back to the queue) and wait for it. */
  async stop(): Promise<void> {
    this.stopped = true
    if (this.timer) clearTimeout(this.timer)
    this.timer = null
    this.currentJob?.controller.abort(new ShutdownAbort())
    await this.loopDone
  }

  private schedule(delayMs: number): void {
    if (this.stopped) return
    this.timer = setTimeout(() => {
      this.timer = null
      this.loopDone = this.tick()
        .then((r) => this.schedule(r === "ran" ? 0 : this.o.pollMs))
        .catch((err: unknown) => {
          this.o.log.error("ai job tick failed", { error: message(err) })
          this.schedule(this.o.pollMs)
        })
    }, delayMs)
  }

  /** One iteration (exposed for tests): "ran" when a job was processed. */
  async tick(): Promise<"idle" | "ran" | "busy"> {
    if (this.running) return "busy"
    this.running = true
    try {
      await this.maybeSweep()
      const job = await this.o.store.claimNext()
      if (!job) return "idle"
      if (this.stopped && this.loopStarted) {
        // stop() arrived while claiming: give the job back untouched.
        await this.o.store.requeue(job.id)
        return "idle"
      }
      await this.process(job)
      return "ran"
    } finally {
      this.running = false
    }
  }

  private async maybeSweep(): Promise<void> {
    const now = this.o.now()
    if (now - this.lastSweepAt < this.o.sweepEveryMs) return
    this.lastSweepAt = now
    const { requeued, failed } = await this.o.store.sweepStale(new Date(now - this.o.staleMs), this.o.maxAttempts)
    if (requeued + failed > 0) this.o.log.warn("stale ai jobs recovered", { requeued, failed })
  }

  private async process(job: ClaimedJob): Promise<void> {
    const handler = this.o.handlers[job.kind]
    if (!handler) {
      await this.o.store.fail(job.id, `unknown job kind: ${job.kind}`)
      return
    }
    const controller = new AbortController()
    let finish!: () => void
    const done = new Promise<void>((r) => (finish = r))
    this.currentJob = { job, controller, done }
    const watcher = setInterval(() => void this.checkCancelled(job.id, controller), this.o.cancelPollMs)
    this.o.log.info("ai job started", { jobId: job.id, kind: job.kind, projectId: job.projectId, attempt: job.attempts })
    try {
      await this.o.waitForTurn?.(controller.signal)
      controller.signal.throwIfAborted()
      const result = await handler(job, {
        signal: controller.signal,
        progress: (pct) => this.o.store.setProgress(job.id, Math.max(0, Math.min(100, Math.round(pct)))).catch(() => undefined),
      })
      await this.finishDone(job, result)
    } catch (err) {
      await this.finishError(job, controller.signal.reason, err)
    } finally {
      clearInterval(watcher)
      this.currentJob = null
      finish()
    }
  }

  private async checkCancelled(jobId: string, controller: AbortController): Promise<void> {
    try {
      if ((await this.o.store.statusOf(jobId)) === "cancelled") controller.abort(new CancelledAbort())
    } catch {
      // a failed check is retried at the next interval
    }
  }

  private async finishDone(job: ClaimedJob, result: JobResult): Promise<void> {
    const stored = await this.o.store.complete(job.id, result.reportId)
    this.o.log.info("ai job done", { jobId: job.id, kind: job.kind, reportId: result.reportId, stored })
    if (stored) await this.report(job, { status: "done", result })
  }

  private async finishError(job: ClaimedJob, reason: unknown, err: unknown): Promise<void> {
    if (reason instanceof ShutdownAbort) {
      await this.o.store.requeue(job.id)
      this.o.log.info("ai job returned to the queue (shutdown)", { jobId: job.id })
      return
    }
    if (reason instanceof CancelledAbort) {
      this.o.log.info("ai job cancelled", { jobId: job.id })
      return
    }
    const error = message(err)
    const stored = await this.o.store.fail(job.id, error)
    this.o.log.warn("ai job failed", { jobId: job.id, kind: job.kind, error })
    if (stored) await this.report(job, { status: "failed", error })
  }

  private async report(job: ClaimedJob, outcome: JobOutcome): Promise<void> {
    try {
      await this.o.onFinished?.(job, outcome)
    } catch (err) {
      this.o.log.warn("ai job notification failed", { jobId: job.id, error: message(err) })
    }
  }
}
