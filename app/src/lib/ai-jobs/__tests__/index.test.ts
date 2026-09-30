import { describe, expect, it, vi } from "vitest"

vi.mock("../handlers", () => ({ AI_JOB_HANDLERS: {} }))
vi.mock("../store", () => ({ createAiJobStore: () => ({}) }))
vi.mock("../notify", () => ({ notifyJobFinished: vi.fn() }))

const { loadAiJobRunnerConfig, waitForLocalGate, createAiJobRunner } = await import("..")

describe("loadAiJobRunnerConfig", () => {
  it("defaults and overrides", () => {
    expect(loadAiJobRunnerConfig({})).toEqual({ pollMs: 5000, staleMs: 1_800_000, yieldMaxMs: 600_000 })
    expect(loadAiJobRunnerConfig({ AI_JOB_POLL_MS: "1000", AI_JOB_STALE_MS: "x", AI_JOB_YIELD_MAX_MS: "5" })).toEqual({
      pollMs: 1000,
      staleMs: 1_800_000,
      yieldMaxMs: 5,
    })
  })

  it("createAiJobRunner builds an idle runner", () => {
    const runner = createAiJobRunner({ log: { info() {}, warn() {}, error() {} }, config: loadAiJobRunnerConfig({}) })
    expect(runner.current()).toBeNull()
  })
})

describe("waitForLocalGate", () => {
  it("returns at once when idle", async () => {
    const isIdle = vi.fn(() => true)
    await waitForLocalGate(isIdle, new AbortController().signal, 10_000, 1)
    expect(isIdle).toHaveBeenCalledTimes(1)
  })

  it("polls until idle", async () => {
    let n = 0
    await waitForLocalGate(() => ++n >= 3, new AbortController().signal, 10_000, 1)
    expect(n).toBe(3)
  })

  it("gives up after maxWaitMs and on abort", async () => {
    let t = 0
    await waitForLocalGate(() => false, new AbortController().signal, 5, 1, () => (t += 2))
    const c = new AbortController()
    const p = waitForLocalGate(() => false, c.signal, 60_000, 50)
    c.abort()
    await expect(p).resolves.toBeUndefined()
  })
})
