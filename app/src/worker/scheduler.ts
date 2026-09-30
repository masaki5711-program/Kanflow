import { nextRunAt, type DailyTime } from "./config"

/**
 * Daily local-time scheduler. Checks the wall clock every `checkMs` instead
 * of one long setTimeout, so sleep/resume and clock corrections cannot make
 * it skip or double-fire a day. A run that is still going when the next
 * slot comes is not started twice. Missed slots (worker was down) are not
 * caught up.
 */

export interface SchedulerLog {
  info(msg: string, fields?: Record<string, unknown>): void
  warn(msg: string, fields?: Record<string, unknown>): void
  error(msg: string, fields?: Record<string, unknown>): void
}

export interface DailySchedulerOptions {
  name: string
  times: ReadonlyArray<DailyTime>
  run: () => Promise<unknown>
  now?: () => Date
  checkMs?: number
  log?: SchedulerLog
}

export class DailyScheduler {
  private next: Date | null
  private timer: ReturnType<typeof setInterval> | null = null
  private active: Promise<void> | null = null
  private readonly now: () => Date

  constructor(private readonly opts: DailySchedulerOptions) {
    this.now = opts.now ?? (() => new Date())
    this.next = nextRunAt(this.now(), opts.times)
  }

  nextAt(): Date | null {
    return this.next
  }

  isRunning(): boolean {
    return this.active !== null
  }

  /** Fire the job if its slot has come. Returns true when a run was started. */
  tick(): boolean {
    if (!this.next) return false
    const now = this.now()
    if (now.getTime() < this.next.getTime()) return false
    const slot = this.next
    this.next = nextRunAt(now, this.opts.times)
    if (this.active) {
      this.opts.log?.warn(`${this.opts.name}: previous run still in progress, slot skipped`, { slot: slot.toISOString() })
      return false
    }
    this.opts.log?.info(`${this.opts.name}: scheduled run starting`, { slot: slot.toISOString(), next: this.next?.toISOString() })
    this.active = this.opts
      .run()
      .then(
        () => undefined,
        (err: unknown) => {
          this.opts.log?.error(`${this.opts.name}: scheduled run failed`, { error: err instanceof Error ? err.message : String(err) })
        }
      )
      .finally(() => {
        this.active = null
      })
    return true
  }

  start(): void {
    if (this.timer || !this.next) return
    this.timer = setInterval(() => this.tick(), this.opts.checkMs ?? 30_000)
  }

  /** Stop scheduling; resolves when a run in progress has finished. */
  async stop(): Promise<void> {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
    this.next = null
    if (this.active) await this.active
  }
}
