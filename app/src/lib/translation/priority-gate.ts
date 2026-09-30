/**
 * Priority gate between user-facing AI calls (high) and background
 * translation (low). In-process equivalent of an AI-service PriorityGate:
 * Kanflow talks to Ollama directly from the Next.js server, so the gate has
 * to live in the same process as the chat / analysis routes.
 *
 * - High-priority work calls `beginHigh()` on entry (every Ollama helper in
 *   lib/ollama.ts does this by default). Entering aborts every running
 *   background ticket: the fetch to Ollama is cancelled through its
 *   AbortSignal, which closes the connection and stops generation.
 * - Background work takes a ticket with `beginBackground()`. It throws
 *   `GateBusy` when a high-priority call is in flight; a ticket aborted by a
 *   high-priority entry is marked `preempted`.
 * - `isIdle(quietMs)`: no high call in flight AND none finished within the
 *   last `quietMs` — the worker only starts when a user is not waiting.
 * - Cross-process: `beginHigh({ remote: true })` mirrors a user call running
 *   in ANOTHER process (see lib/ai-gate/remote-gate.ts). It preempts and
 *   blocks background work exactly like a local entry, but is excluded from
 *   `local_high_active`, which is what /api/internal/ai-busy reports to
 *   peers — so two processes mirroring each other can never latch busy.
 */

export class GateBusy extends Error {
  constructor() {
    super("gate busy: a user-facing AI request is running")
    this.name = "GateBusy"
  }
}

export interface BackgroundTicket {
  signal: AbortSignal
  /** Set when the ticket was aborted by a high-priority entry. */
  readonly preempted: boolean
  /** Release the ticket (idempotent). Always call in `finally`. */
  end(): void
}

interface TicketState {
  controller: AbortController
  preempted: boolean
  done: boolean
}

export class PriorityGate {
  private highActive = 0
  private remoteHighActive = 0
  private lastHighAt = 0
  private lastLocalHighAt = 0
  private readonly background = new Set<TicketState>()

  get high_active(): number {
    return this.highActive
  }

  /** High entries started by this process's own callers (remote mirrors excluded). */
  get local_high_active(): number {
    return this.highActive - this.remoteHighActive
  }

  get background_active(): number {
    return this.background.size
  }

  /**
   * Enter a high-priority section. Returns a release function (idempotent).
   * `remote: true` marks a mirror of another process's user call.
   */
  beginHigh(opts: { remote?: boolean } = {}): () => void {
    const remote = opts.remote === true
    const now = Date.now()
    this.highActive += 1
    if (remote) this.remoteHighActive += 1
    this.lastHighAt = now
    if (!remote) this.lastLocalHighAt = now
    this.preemptAll()
    let released = false
    return () => {
      if (released) return
      released = true
      const end = Date.now()
      this.highActive = Math.max(0, this.highActive - 1)
      if (remote) this.remoteHighActive = Math.max(0, this.remoteHighActive - 1)
      this.lastHighAt = end
      if (!remote) this.lastLocalHighAt = end
    }
  }

  /**
   * Milliseconds since this process's own last high-priority activity
   * (0 while one is running; Infinity if there never was one).
   */
  localIdleForMs(now = Date.now()): number {
    if (this.local_high_active > 0) return 0
    if (this.lastLocalHighAt === 0) return Number.POSITIVE_INFINITY
    return Math.max(0, now - this.lastLocalHighAt)
  }

  async withHigh<T>(fn: () => Promise<T>): Promise<T> {
    const end = this.beginHigh()
    try {
      return await fn()
    } finally {
      end()
    }
  }

  /** Take a background ticket, or throw GateBusy when a user request is running. */
  beginBackground(): BackgroundTicket {
    if (this.highActive > 0) throw new GateBusy()
    const state: TicketState = { controller: new AbortController(), preempted: false, done: false }
    this.background.add(state)
    const release = () => {
      if (state.done) return
      state.done = true
      this.background.delete(state)
    }
    return {
      signal: state.controller.signal,
      get preempted() {
        return state.preempted
      },
      end: release,
    }
  }

  /** True when no user-facing call is running and none ended within `quietMs`. */
  isIdle(quietMs: number): boolean {
    if (this.highActive > 0) return false
    return Date.now() - this.lastHighAt >= quietMs
  }

  status(): { high_active: number; background_active: number } {
    return { high_active: this.highActive, background_active: this.background.size }
  }

  /** Abort every running background ticket (graceful shutdown). Returns how many. */
  preemptBackground(): number {
    return this.preemptAll()
  }

  private preemptAll(): number {
    let n = 0
    for (const t of this.background) {
      if (t.done || t.preempted) continue
      t.preempted = true
      t.controller.abort(new GateBusy())
      n += 1
    }
    return n
  }
}

// Process-wide singleton. Kept on globalThis so Next.js dev HMR does not
// create a second gate that cannot see the first one's in-flight calls.
const g = globalThis as unknown as { __kanflowPriorityGate?: PriorityGate }
export const gate: PriorityGate = g.__kanflowPriorityGate ?? (g.__kanflowPriorityGate = new PriorityGate())
