import { describe, expect, test, vi } from "vitest"
import { GateBusy, PriorityGate } from "@/lib/translation/priority-gate"
import { RemoteGate, aggregatePeers, backoffMs } from "../remote-gate"
import type { PeerProbe } from "../peer-client"

const CONFIG = { pollMs: 1_000, maxBackoffMs: 30_000, quietMs: 3_000, degradedIntervalMs: 30_000 }

function setup(peers: string[], responses: Record<string, PeerProbe>) {
  let t = 1_000_000
  const gate = new PriorityGate()
  const probe = vi.fn(async (url: string) => responses[url])
  const remote = new RemoteGate({ config: { ...CONFIG, peers }, target: gate, probe, now: () => t })
  return {
    gate,
    probe,
    remote,
    advance: (ms: number) => {
      t += ms
    },
    set: (url: string, r: PeerProbe) => {
      responses[url] = r
    },
  }
}

const IDLE: PeerProbe = { ok: true, busyHigh: 0, idleForMs: null }
const BUSY: PeerProbe = { ok: true, busyHigh: 1, idleForMs: 0 }
const DOWN: PeerProbe = { ok: false, error: "ECONNREFUSED" }

describe("aggregatePeers", () => {
  test("busy wins over unreachable, unreachable over idle", () => {
    expect(aggregatePeers([{ reachable: true, busy: true }, { reachable: false, busy: false }])).toBe("busy")
    expect(aggregatePeers([{ reachable: true, busy: false }, { reachable: false, busy: false }])).toBe("degraded")
    expect(aggregatePeers([{ reachable: true, busy: false }, { reachable: null, busy: false }])).toBe("idle")
    expect(aggregatePeers([])).toBe("idle")
  })
})

describe("backoffMs", () => {
  test("doubles per failure and caps at the maximum", () => {
    expect(backoffMs(0, 1_000, 30_000)).toBe(1_000)
    expect(backoffMs(1, 1_000, 30_000)).toBe(2_000)
    expect(backoffMs(3, 1_000, 30_000)).toBe(8_000)
    expect(backoffMs(10, 1_000, 30_000)).toBe(30_000)
  })
})

describe("RemoteGate", () => {
  test("a busy peer makes the worker yield: in-flight ticket preempted, new tickets refused", async () => {
    const { gate, remote } = setup(["http://a", "http://b"], { "http://a": IDLE, "http://b": BUSY })
    const ticket = gate.beginBackground()

    await expect(remote.poll()).resolves.toBe("busy")

    expect(ticket.preempted).toBe(true)
    expect(ticket.signal.aborted).toBe(true)
    expect(() => gate.beginBackground()).toThrow(GateBusy)
    expect(remote.admit()).toEqual({ allow: false, reason: "peer-busy" })
    ticket.end()
  })

  test("mirrored entries are not reported as local activity (no feedback between peers)", async () => {
    const { gate, remote } = setup(["http://a"], { "http://a": BUSY })
    await remote.poll()
    expect(gate.high_active).toBe(1)
    expect(gate.local_high_active).toBe(0)
    expect(gate.localIdleForMs()).toBe(Number.POSITIVE_INFINITY)
  })

  test("mirror is released once the peer is idle beyond the quiet window", async () => {
    const { gate, remote, set, advance } = setup(["http://a"], { "http://a": BUSY })
    await remote.poll()
    expect(gate.high_active).toBe(1)

    set("http://a", { ok: true, busyHigh: 0, idleForMs: 500 })
    advance(1_000)
    await expect(remote.poll()).resolves.toBe("busy") // still inside peer's quiet window

    set("http://a", { ok: true, busyHigh: 0, idleForMs: 5_000 })
    advance(1_000)
    await expect(remote.poll()).resolves.toBe("idle")
    expect(gate.high_active).toBe(0)
    expect(remote.admit()).toEqual({ allow: true })
  })

  test("an unreachable peer does not block the worker but throttles it and backs off probing", async () => {
    const { gate, remote, probe, advance } = setup(["http://a"], { "http://a": DOWN })

    await expect(remote.poll()).resolves.toBe("degraded")
    expect(gate.high_active).toBe(0)
    expect(() => gate.beginBackground().end()).not.toThrow()

    // First tick admitted with batch 1, then throttled for degradedIntervalMs.
    expect(remote.admit()).toEqual({ allow: true, batch: 1, reason: "peer-unreachable" })
    expect(remote.admit()).toEqual({ allow: false, reason: "peer-unreachable-backoff" })

    // Re-probe is delayed exponentially: not due after 1s, due after 2s.
    expect(probe).toHaveBeenCalledTimes(1)
    advance(1_000)
    await remote.poll()
    expect(probe).toHaveBeenCalledTimes(1)
    advance(1_000)
    await remote.poll()
    expect(probe).toHaveBeenCalledTimes(2)
    expect(remote.snapshot().peers[0].failures).toBe(2)
    expect(remote.snapshot().peers[0].nextProbeInMs).toBe(4_000)

    advance(30_000)
    expect(remote.admit().allow).toBe(true)
  })

  test("a busy peer that becomes unreachable stops blocking (fail-safe for the worker)", async () => {
    const { gate, remote, set, advance } = setup(["http://a"], { "http://a": BUSY })
    await remote.poll()
    expect(gate.high_active).toBe(1)
    set("http://a", DOWN)
    advance(1_000)
    await expect(remote.poll()).resolves.toBe("degraded")
    expect(gate.high_active).toBe(0)
  })

  test("stop() releases a held mirror", async () => {
    const { gate, remote } = setup(["http://a"], { "http://a": BUSY })
    await remote.poll()
    remote.stop()
    expect(gate.high_active).toBe(0)
  })

  test("waitUntilNotBusy returns false after maxWait while the peer stays busy", async () => {
    vi.useFakeTimers()
    try {
      const gate = new PriorityGate()
      const remote = new RemoteGate({
        config: { ...CONFIG, pollMs: 10, peers: ["http://a"] },
        target: gate,
        probe: async () => BUSY,
      })
      const p = remote.waitUntilNotBusy(50)
      await vi.advanceTimersByTimeAsync(100)
      await expect(p).resolves.toBe(false)
    } finally {
      vi.useRealTimers()
    }
  })

  test("no peers → always idle", async () => {
    const { remote } = setup([], {})
    await expect(remote.poll()).resolves.toBe("idle")
    expect(remote.admit()).toEqual({ allow: true })
  })
})
