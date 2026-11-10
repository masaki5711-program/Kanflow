import { beforeEach, describe, expect, it, vi } from "vitest"

/**
 * The parameter-search queue (params.service `enqueueParamSearch` / `drain`) without a database: the search, the
 * backtests and the gate are fakes. Pins that the queue never leaves a caller waiting, pauses for backtests, and picks
 * up a job pushed just as a drain ends.
 */
const m = vi.hoisted(() => ({
  busy: vi.fn(() => false),
  settle: vi.fn(async () => undefined),
  search: vi.fn(),
  hash: vi.fn(async () => "h1"),
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

vi.mock("@/lib/logger", () => ({ logger: { child: () => m.log } }))
vi.mock("@/services/_shared/db", () => ({
  defaultDb: {},
  withTransaction: (fn: (tx: unknown) => unknown) =>
    fn({ $executeRaw: async () => 0, planEstimateParamProposal: { updateMany: async () => ({ count: 0 }), create: async () => ({}) } }),
}))
vi.mock("@/services/plan-estimate-run/gate", () => ({
  activeParamApproval: async () => null,
  currentParams: () => null,
  decideGate: () => ({ on: false }),
  endInvalidParamApproval: async () => null,
  lineageInputHash: m.hash,
}))
vi.mock("../eval.service", () => ({
  backtestInput: async (lineage: string) => ({ lineage, inputHash: "h1", skips: [], projects: [], pool: [], leavesWithoutTemplate: 0 }),
  backtestsBusy: m.busy,
  currentLineages: async () => [],
  enqueueLineageRecompute: vi.fn(),
  settleQueuedBacktests: m.settle,
}))
vi.mock("../param-search", () => ({ searchParams: m.search }))

const svc = await import("../params.service")

const RESULT = { outcome: "keep_default", reason: "no_improvement", params: {}, baseline: {}, before: null, after: null, candidates: 1, evaluated: 1, timedOut: false, elapsedMs: 1, slowestCandidateMs: 1 }

describe("parameter search queue", () => {
  beforeEach(() => {
    m.busy.mockReset().mockReturnValue(false)
    m.settle.mockReset().mockResolvedValue(undefined)
    m.search.mockReset().mockResolvedValue(RESULT)
    m.log.error.mockReset()
  })

  it("a failing wait for the backtests settles that job with the error; the queue goes on and empties", async () => {
    m.busy.mockReturnValueOnce(true)
    m.settle.mockRejectedValueOnce(new Error("backtest chain broke"))
    const run = await svc.enqueueParamSearch(["L1", "L2"])
    expect(run.failed).toEqual(["L1"])
    expect(run.searched.map((s) => s.lineage)).toEqual(["L2"])
    expect(m.log.error).toHaveBeenCalledWith("parameter search of a lineage failed; the others go on", expect.objectContaining({ lineage: "L1", error: "backtest chain broke" }))
    await svc.settleParamSearches()
    expect(svc.searchingLineages()).toEqual([])
  })

  it("a paused search is requeued first and starts again after the backtest; past the limit it fails", async () => {
    m.search.mockResolvedValueOnce(null).mockResolvedValueOnce(RESULT)
    const run = await svc.enqueueParamSearch(["P1"])
    expect(run.searched.map((s) => s.lineage)).toEqual(["P1"])
    expect(m.search).toHaveBeenCalledTimes(2)
    m.search.mockReset().mockResolvedValue(null)
    const stuck = await svc.enqueueParamSearch(["P2"])
    expect(stuck.failed).toEqual(["P2"])
    expect(m.search).toHaveBeenCalledTimes(svc.SEARCH_MAX_PAUSES + 1)
  })

  it("a job pushed just as a drain finishes (after its loop, before it is marked done) is still drained", async () => {
    m.search.mockRejectedValueOnce(new Error("R1 failed"))
    let late: Promise<unknown> | null = null
    // The failure of R1 is logged inside the drain's last step; R2 is pushed one microtask later — after the loop has
    // seen an empty queue, before a `.finally` would have cleared the drain.
    m.log.error.mockImplementationOnce(() => queueMicrotask(() => (late = svc.enqueueParamSearch(["R2"]))))
    const first = await svc.enqueueParamSearch(["R1"])
    expect(first.failed).toEqual(["R1"])
    await vi.waitFor(() => expect(late).not.toBeNull())
    const second = (await Promise.race([late, new Promise((resolve) => setTimeout(() => resolve("stuck"), 1_000))])) as { searched: { lineage: string }[] } | "stuck"
    expect(second).not.toBe("stuck")
    expect(second !== "stuck" && second.searched.map((s) => s.lineage)).toEqual(["R2"])
    await svc.settleParamSearches()
    expect(svc.searchingLineages()).toEqual([])
  })
})
