import crypto from "node:crypto"

/**
 * In-process single-flight job runner with a small history.
 *
 * `trigger()` starts `run` asynchronously and returns immediately. While a
 * job is running, further triggers are NOT started — they get the running
 * job back with `accepted: false` (mutex). `abort()` cancels the running
 * job through its AbortSignal; `settled()` resolves when it has finished.
 */

export type JobStatus = "running" | "done" | "failed" | "aborted"

export interface JobRecord<R> {
  id: string
  source: string
  status: JobStatus
  startedAt: string
  finishedAt: string | null
  result: R | null
  error: string | null
}

export interface TriggerOutcome<R> {
  accepted: boolean
  job: JobRecord<R>
}

const HISTORY = 10

export class SingleFlightJobRunner<R> {
  private currentJob: { record: JobRecord<R>; controller: AbortController; done: Promise<void> } | null = null
  private history: JobRecord<R>[] = []

  constructor(
    private readonly onError?: (jobId: string, error: string) => void,
    private readonly now: () => Date = () => new Date()
  ) {}

  trigger(source: string, run: (signal: AbortSignal) => Promise<R>): TriggerOutcome<R> {
    if (this.currentJob) return { accepted: false, job: { ...this.currentJob.record } }
    const controller = new AbortController()
    const record: JobRecord<R> = {
      id: crypto.randomUUID(),
      source,
      status: "running",
      startedAt: this.now().toISOString(),
      finishedAt: null,
      result: null,
      error: null,
    }
    this.history = [record, ...this.history].slice(0, HISTORY)
    const done = this.execute(record, controller, run)
    this.currentJob = { record, controller, done }
    return { accepted: true, job: { ...record } }
  }

  private async execute(record: JobRecord<R>, controller: AbortController, run: (signal: AbortSignal) => Promise<R>): Promise<void> {
    // Yield once so `trigger()` returns before any synchronous part of `run` executes.
    await Promise.resolve()
    let finished: JobRecord<R>
    try {
      const result = await run(controller.signal)
      finished = { ...record, status: controller.signal.aborted ? "aborted" : "done", result }
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err)
      finished = { ...record, status: controller.signal.aborted ? "aborted" : "failed", error }
      this.onError?.(record.id, error)
    }
    finished = { ...finished, finishedAt: this.now().toISOString() }
    this.history = this.history.map((r) => (r.id === record.id ? finished : r))
    this.currentJob = null
  }

  running(): JobRecord<R> | null {
    return this.currentJob ? { ...this.currentJob.record } : null
  }

  get(id: string): JobRecord<R> | null {
    const r = this.history.find((h) => h.id === id)
    return r ? { ...r } : null
  }

  list(): JobRecord<R>[] {
    return this.history.map((r) => ({ ...r }))
  }

  abort(reason?: unknown): void {
    this.currentJob?.controller.abort(reason)
  }

  /** Resolves when no job is running. */
  async settled(): Promise<void> {
    while (this.currentJob) await this.currentJob.done
  }
}
