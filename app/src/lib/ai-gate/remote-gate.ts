import type { AiGateConfig } from "./config"
import type { PeerProbe } from "./peer-client"

/**
 * Cross-process view of "a user is waiting for Ollama".
 *
 * Polls every peer web process (GET /api/internal/ai-busy) and MIRRORS the
 * result into this process's PriorityGate: while any peer is busy (a user
 * call in flight, or one ended less than `quietMs` ago) the mirror holds a
 * `beginHigh({ remote: true })` entry. That single entry both aborts the
 * translation currently running here (its fetch to Ollama is cancelled) and
 * keeps new background tickets out — the translation worker needs no
 * knowledge of other processes.
 *
 * Failure policy:
 * - Users never wait on this: web processes only answer a counter.
 * - Unreachable / misconfigured peer → treated as NOT busy (the worker keeps
 *   going) but the gate reports `degraded`; the peer is re-probed with
 *   exponential backoff, and `admit()` throttles the worker to one row per
 *   `degradedIntervalMs` until every peer answers again.
 */

export type RemoteGateState = "idle" | "busy" | "degraded"

export interface MirrorTarget {
  beginHigh(opts: { remote?: boolean }): () => void
}

export interface GateLog {
  info(msg: string, fields?: Record<string, unknown>): void
  warn(msg: string, fields?: Record<string, unknown>): void
}

export interface PeerSnapshot {
  url: string
  reachable: boolean | null
  busy: boolean
  failures: number
  lastError: string | null
  nextProbeInMs: number
}

export interface Admission {
  allow: boolean
  /** Max rows to claim this tick (undefined = worker default). */
  batch?: number
  reason?: string
}

interface PeerState {
  url: string
  reachable: boolean | null
  busy: boolean
  failures: number
  nextProbeAt: number
  lastError: string | null
}

export interface RemoteGateOptions {
  config: Pick<AiGateConfig, "peers" | "pollMs" | "maxBackoffMs" | "quietMs" | "degradedIntervalMs">
  target: MirrorTarget
  probe: (url: string) => Promise<PeerProbe>
  now?: () => number
  log?: GateLog
}

/** Pure aggregation of per-peer states. */
export function aggregatePeers(peers: ReadonlyArray<{ reachable: boolean | null; busy: boolean }>): RemoteGateState {
  if (peers.some((p) => p.reachable === true && p.busy)) return "busy"
  if (peers.some((p) => p.reachable === false)) return "degraded"
  return "idle"
}

/** Re-probe delay after `failures` consecutive failures (exponential, capped). */
export function backoffMs(failures: number, pollMs: number, maxBackoffMs: number): number {
  if (failures <= 0) return pollMs
  return Math.min(maxBackoffMs, pollMs * 2 ** Math.min(failures, 20))
}

export class RemoteGate {
  private readonly peers: PeerState[]
  private readonly now: () => number
  private release: (() => void) | null = null
  private polling: Promise<RemoteGateState> | null = null
  private timer: ReturnType<typeof setInterval> | null = null
  private lastDegradedAdmitAt = Number.NEGATIVE_INFINITY

  constructor(private readonly opts: RemoteGateOptions) {
    this.now = opts.now ?? Date.now
    this.peers = opts.config.peers.map((url) => ({ url, reachable: null, busy: false, failures: 0, nextProbeAt: 0, lastError: null }))
  }

  state(): RemoteGateState {
    return aggregatePeers(this.peers)
  }

  /** Probe every peer that is due (single-flight) and update the mirror. */
  poll(): Promise<RemoteGateState> {
    if (this.polling) return this.polling
    this.polling = this.pollDue().finally(() => {
      this.polling = null
    })
    return this.polling
  }

  private async pollDue(): Promise<RemoteGateState> {
    const t = this.now()
    const due = this.peers.filter((p) => p.nextProbeAt <= t)
    const results = await Promise.all(due.map((p) => this.opts.probe(p.url)))
    due.forEach((p, i) => this.record(p, results[i]))
    const state = this.state()
    this.applyMirror(state === "busy")
    return state
  }

  private record(p: PeerState, r: PeerProbe): void {
    const { pollMs, maxBackoffMs, quietMs } = this.opts.config
    const t = this.now()
    if (r.ok) {
      if (p.reachable === false) this.opts.log?.info("ai-gate peer reachable again", { peer: p.url })
      p.reachable = true
      p.failures = 0
      p.lastError = null
      p.busy = r.busyHigh > 0 || (r.idleForMs !== null && r.idleForMs < quietMs)
      p.nextProbeAt = t + pollMs
      return
    }
    if (p.reachable !== false) this.opts.log?.warn("ai-gate peer unreachable; worker continues throttled", { peer: p.url, error: r.error })
    p.reachable = false
    p.busy = false
    p.failures += 1
    p.lastError = r.error
    p.nextProbeAt = t + backoffMs(p.failures, pollMs, maxBackoffMs)
  }

  private applyMirror(busy: boolean): void {
    if (busy && !this.release) {
      this.release = this.opts.target.beginHigh({ remote: true })
    } else if (!busy && this.release) {
      const r = this.release
      this.release = null
      r()
    }
  }

  /** Admission control for one worker tick (the mirror already blocks while busy). */
  admit(): Admission {
    const state = this.state()
    if (state === "busy") return { allow: false, reason: "peer-busy" }
    if (state === "idle") return { allow: true }
    const t = this.now()
    if (t - this.lastDegradedAdmitAt < this.opts.config.degradedIntervalMs) return { allow: false, reason: "peer-unreachable-backoff" }
    this.lastDegradedAdmitAt = t
    return { allow: true, batch: 1, reason: "peer-unreachable" }
  }

  /**
   * Resolve once no peer is busy (true) or after `maxWaitMs` / abort (false).
   * Used by long jobs that should start only when users are not waiting.
   */
  async waitUntilNotBusy(maxWaitMs: number, signal?: AbortSignal): Promise<boolean> {
    const deadline = this.now() + maxWaitMs
    for (;;) {
      if (signal?.aborted) return false
      if ((await this.poll()) !== "busy") return true
      if (this.now() >= deadline) return false
      await sleep(this.opts.config.pollMs, signal)
    }
  }

  start(): void {
    if (this.timer || this.peers.length === 0) return
    this.timer = setInterval(() => void this.poll(), this.opts.config.pollMs)
    this.timer.unref?.()
    void this.poll()
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
    this.applyMirror(false)
  }

  snapshot(): { state: RemoteGateState; mirrored: boolean; peers: PeerSnapshot[] } {
    const t = this.now()
    return {
      state: this.state(),
      mirrored: this.release !== null,
      peers: this.peers.map((p) => ({
        url: p.url,
        reachable: p.reachable,
        busy: p.busy,
        failures: p.failures,
        lastError: p.lastError,
        nextProbeInMs: Math.max(0, p.nextProbeAt - t),
      })),
    }
  }
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(done, ms)
    function done() {
      clearTimeout(timer)
      signal?.removeEventListener("abort", done)
      resolve()
    }
    signal?.addEventListener("abort", done, { once: true })
  })
}
