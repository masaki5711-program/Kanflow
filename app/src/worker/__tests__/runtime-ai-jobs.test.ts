import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest"

const m = vi.hoisted(() => {
  const makeLog = (): Record<string, ReturnType<typeof vi.fn>> => {
    const l: Record<string, ReturnType<typeof vi.fn>> = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
      flush: vi.fn().mockResolvedValue(undefined),
    }
    l.child = vi.fn(() => l)
    return l
  }
  return {
    log: makeLog(),
    makeLog,
    aiLogFlush: vi.fn().mockResolvedValue(undefined),
    prisma: { $transaction: vi.fn(), $disconnect: vi.fn().mockResolvedValue(undefined) },
    remote: {
      start: vi.fn(),
      stop: vi.fn(),
      admit: vi.fn(() => ({ allow: true })),
      waitUntilNotBusy: vi.fn().mockResolvedValue(true),
      snapshot: vi.fn(() => ({ state: "idle" })),
    },
    createRemoteGate: vi.fn(),
    setWorkerAdmission: vi.fn(),
    startTranslationWorker: vi.fn(),
    stopTranslationWorker: vi.fn().mockResolvedValue(true),
    workerStatus: vi.fn(() => ({ lastTickAt: null, lastResult: null })),
    acquireSingleInstance: vi.fn(),
    lock: { release: vi.fn(), verify: vi.fn().mockResolvedValue(true) },
    runSurveillance: vi.fn(),
    startCollabScheduler: vi.fn(() => null),
    startPurgeTrashScheduler: vi.fn(() => null),
    writeHeartbeatFile: vi.fn(),
    removeHeartbeatFile: vi.fn(),
    acquireDedicatedLock: vi.fn(),
    connect: vi.fn(),
    createLockConnect: vi.fn(),
    aiRunner: { start: vi.fn(), stop: vi.fn().mockResolvedValue(undefined), current: vi.fn(() => ({ id: "j1", kind: "progress_report" })) },
    createAiJobRunner: vi.fn(),
    schedulerInstances: [] as Array<{ opts: { run: () => Promise<void> }; start: ReturnType<typeof vi.fn>; stop: ReturnType<typeof vi.fn> }>,
  }
})

vi.mock("@/lib/logger", () => ({ createLogger: () => m.log }))
vi.mock("@/lib/ai-monitor", () => ({ aiLogFlush: m.aiLogFlush }))
vi.mock("@/lib/prisma", () => ({ prisma: m.prisma }))
vi.mock("@/lib/ai-gate", () => ({ createRemoteGate: (...a: unknown[]) => m.createRemoteGate(...a) }))
vi.mock("@/lib/translation/worker", () => ({
  setWorkerAdmission: m.setWorkerAdmission,
  startTranslationWorker: m.startTranslationWorker,
  stopTranslationWorker: m.stopTranslationWorker,
  workerStatus: m.workerStatus,
}))
vi.mock("@/worker/instance-guard", () => ({ acquireSingleInstance: m.acquireSingleInstance }))
vi.mock("@/lib/ai-gate/worker-heartbeat", () => ({
  writeHeartbeatFile: m.writeHeartbeatFile,
  removeHeartbeatFile: m.removeHeartbeatFile,
}))
vi.mock("@/worker/dedicated-lock", () => ({
  acquireDedicatedLock: m.acquireDedicatedLock,
  createLockConnect: m.createLockConnect,
}))
vi.mock("@/worker/jobs/surveillance", () => ({ runSurveillance: m.runSurveillance }))
vi.mock("@/worker/collab-daily", () => ({ startCollabScheduler: m.startCollabScheduler }))
vi.mock("@/lib/ai-jobs", () => ({ createAiJobRunner: (...a: unknown[]) => m.createAiJobRunner(...a) }))
vi.mock("@/worker/trash-daily", () => ({ startPurgeTrashScheduler: m.startPurgeTrashScheduler }))
vi.mock("@/worker/scheduler", () => ({
  DailyScheduler: class {
    start = vi.fn()
    stop = vi.fn()
    constructor(public opts: { run: () => Promise<void> }) {
      m.schedulerInstances.push(this)
    }
    nextAt() {
      return new Date("2026-01-01T06:30:00Z")
    }
  },
}))

const { runWorker } = await import("@/worker/runtime")

type Handler = (...a: unknown[]) => void
let handlers: Record<string, Handler[]>
let exitSpy: MockInstance<typeof process.exit>

function cfg(over: Record<string, unknown> = {}) {
  return {
    translationMode: "external",
    runTranslation: true,
    surveillanceTimes: [{ hour: 6, minute: 30 }],
    surveillanceRetentionDays: 30,
    surveillanceYieldMaxMs: 1000,
    heartbeatMs: 1000,
    heartbeatFile: "X:/logs/worker-heartbeat.json",
    businessHours: null,
    shutdownTimeoutMs: 5000,
    lockName: "kanflow_worker",
    gate: { peers: [], token: null, pollMs: 1, timeoutMs: 1, maxBackoffMs: 1, quietMs: 1, degradedIntervalMs: 1 },
    notifyDueTimes: [{ hour: 7, minute: 45 }],
    notifyDueSoonDays: 2,
    activityRetentionDays: 730,
    notificationRetentionDays: 90,
    purgeTrashTimes: [{ hour: 3, minute: 15 }],
    purgeTrashAfterDays: 30,
    ...over,
  } as never
}

const flush = async () => {
  for (let i = 0; i < 20; i++) await Promise.resolve()
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.clearAllMocks()
  m.schedulerInstances.length = 0
  m.createRemoteGate.mockReturnValue(m.remote)
  m.acquireSingleInstance.mockResolvedValue(m.lock)
  m.lock.verify.mockResolvedValue(true)
  m.stopTranslationWorker.mockResolvedValue(true)
  m.runSurveillance.mockResolvedValue({ ok: true })
  m.createLockConnect.mockReturnValue(m.connect)
  m.writeHeartbeatFile.mockImplementation(() => undefined)
  m.createAiJobRunner.mockReturnValue(m.aiRunner)
  m.aiRunner.stop.mockResolvedValue(undefined)
  handlers = {}
  vi.spyOn(process, "on").mockImplementation(((ev: string, fn: Handler) => {
    ;(handlers[ev] ??= []).push(fn)
    return process
  }) as never)
  exitSpy = vi.spyOn(process, "exit").mockImplementation((() => undefined) as never)
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
})

/** AI report job wiring in the worker runtime (the loop itself: lib/ai-jobs/__tests__/runner.test.ts). */
describe("runWorker — AI jobs", () => {
  const aiCfg = (over: Record<string, unknown> = {}) =>
    cfg({ runAiJobs: true, aiJobRunner: "worker", aiJobs: { pollMs: 5000, staleMs: 60_000, yieldMaxMs: 1234 }, ...over })

  it("starts the job runner when jobs run in the worker", async () => {
    await runWorker(aiCfg(), { surveillanceNow: false, envFiles: [] })
    await flush()
    expect(m.createAiJobRunner).toHaveBeenCalledWith(expect.objectContaining({ config: { pollMs: 5000, staleMs: 60_000, yieldMaxMs: 1234 } }))
    expect(m.aiRunner.start).toHaveBeenCalled()
  })

  it("does not start it when another process runs jobs", async () => {
    await runWorker(aiCfg({ runAiJobs: false, aiJobRunner: "web" }), { surveillanceNow: false, envFiles: [] })
    await flush()
    expect(m.createAiJobRunner).not.toHaveBeenCalled()
    expect(m.log.info).toHaveBeenCalledWith("ai job runner not started in the worker", { location: "web" })
  })

  it("a job waits for busy web users via the remote gate, up to AI_JOB_YIELD_MAX_MS", async () => {
    m.remote.waitUntilNotBusy.mockResolvedValue(false)
    await runWorker(aiCfg(), { surveillanceNow: false, envFiles: [] })
    await flush()
    const { waitForTurn } = m.createAiJobRunner.mock.calls[0][0] as { waitForTurn: (s: AbortSignal) => Promise<void> }
    const signal = new AbortController().signal
    await waitForTurn(signal)
    expect(m.remote.waitUntilNotBusy).toHaveBeenCalledWith(1234, signal)
    expect(m.log.warn).toHaveBeenCalledWith(expect.stringContaining("AI_JOB_YIELD_MAX_MS"))
  })

  it("heartbeat shows the current job and shutdown stops the runner", async () => {
    await runWorker(aiCfg(), { surveillanceNow: false, envFiles: [] })
    await flush()
    await vi.advanceTimersByTimeAsync(1000)
    expect(m.log.info).toHaveBeenCalledWith("heartbeat", expect.objectContaining({ aiJob: { id: "j1", kind: "progress_report" } }))
    handlers.SIGTERM[0]()
    await vi.advanceTimersByTimeAsync(0)
    await flush()
    expect(m.aiRunner.stop).toHaveBeenCalled()
    expect(exitSpy).toHaveBeenCalledWith(0)
  })

  it("passes the configured investigation cap to surveillance", async () => {
    await runWorker(aiCfg({ surveillanceMaxInvestigations: 7 }), { surveillanceNow: true, envFiles: [] })
    expect(m.runSurveillance).toHaveBeenCalledWith(expect.objectContaining({ maxInvestigations: 7 }))
  })
})
