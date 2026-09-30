/**
 * Counting semaphore with two priority lanes. Waiting "user" acquirers are
 * always served before waiting "background" ones; FIFO within a lane.
 * A waiter whose signal aborts leaves the queue and rejects with the reason.
 */

export type Priority = "user" | "background"

interface Waiter {
  grant: (release: () => void) => void
}

export interface SemaphoreStatus {
  max: number
  active: number
  queuedUser: number
  queuedBackground: number
}

export class PrioritySemaphore {
  private active = 0
  private readonly lanes: Record<Priority, Waiter[]> = { user: [], background: [] }

  constructor(readonly max: number) {
    if (!Number.isInteger(max) || max < 1) throw new RangeError(`invalid concurrency: ${max}`)
  }

  status(): SemaphoreStatus {
    return {
      max: this.max,
      active: this.active,
      queuedUser: this.lanes.user.length,
      queuedBackground: this.lanes.background.length,
    }
  }

  /** Resolves with an idempotent release function once a slot is free. */
  acquire(priority: Priority, signal?: AbortSignal): Promise<() => void> {
    if (signal?.aborted) return Promise.reject(signal.reason)
    // Invariant: a lane is non-empty only while every slot is taken.
    if (this.active < this.max) {
      this.active += 1
      return Promise.resolve(this.releaser())
    }
    return new Promise((resolve, reject) => {
      const lane = this.lanes[priority]
      const onAbort = () => {
        const i = lane.indexOf(waiter)
        if (i >= 0) lane.splice(i, 1)
        reject(signal?.reason)
      }
      const waiter: Waiter = {
        grant: (release) => {
          signal?.removeEventListener("abort", onAbort)
          resolve(release)
        },
      }
      lane.push(waiter)
      signal?.addEventListener("abort", onAbort, { once: true })
    })
  }

  private releaser(): () => void {
    let released = false
    return () => {
      if (released) return
      released = true
      this.active -= 1
      this.dispatch()
    }
  }

  private dispatch(): void {
    while (this.active < this.max) {
      const next = this.lanes.user.shift() ?? this.lanes.background.shift()
      if (!next) return
      this.active += 1
      next.grant(this.releaser())
    }
  }
}
