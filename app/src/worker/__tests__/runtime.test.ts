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

describe("runWorker", () => {
  it("returns early when the lock is not acquired (standby cancelled)", async () => {
    m.acquireSingleInstance.mockResolvedValue(null)
    await runWorker(cfg(), { surveillanceNow: false, envFiles: [] })
    expect(m.createRemoteGate).not.toHaveBeenCalled()
    expect(m.startTranslationWorker).not.toHaveBeenCalled()
  })

  it("starts the collab daily scheduler with the startup signal", async () => {
    await runWorker(cfg(), { surveillanceNow: false, envFiles: [] })
    expect(m.startCollabScheduler).toHaveBeenCalledWith(expect.objectContaining({ lockName: "kanflow_worker" }), m.log, expect.any(AbortSignal))
  })

  it("starts the trash purge scheduler with the startup signal", async () => {
    await runWorker(cfg(), { surveillanceNow: false, envFiles: [] })
    expect(m.startPurgeTrashScheduler).toHaveBeenCalledWith(
      expect.objectContaining({ purgeTrashAfterDays: 30 }),
      m.log,
      expect.any(AbortSignal)
    )
  })

  it("starts gate, translation, scheduler and cli surveillance", async () => {
    await runWorker(cfg(), { surveillanceNow: true, envFiles: [".env"] })
    expect(m.acquireSingleInstance).toHaveBeenCalledWith(expect.objectContaining({ name: "kanflow_worker", retryMs: 30_000 }))
    expect(m.remote.start).toHaveBeenCalled()
    expect(m.startTranslationWorker).toHaveBeenCalled()
    const admission = m.setWorkerAdmission.mock.calls[0][0] as () => unknown
    expect(admission()).toEqual({ allow: true })
    expect(m.schedulerInstances).toHaveLength(1)
    expect(m.schedulerInstances[0].start).toHaveBeenCalled()
    expect(m.runSurveillance).toHaveBeenCalledTimes(1)
    expect(m.log.info).toHaveBeenCalledWith("surveillance started", expect.objectContaining({ source: "cli" }))
    expect(m.log.info).toHaveBeenCalledWith("worker running")
  })

  it("skips translation and scheduler when disabled", async () => {
    await runWorker(cfg({ runTranslation: false, translationMode: "off", surveillanceTimes: [] }), {
      surveillanceNow: false,
      envFiles: [],
    })
    expect(m.startTranslationWorker).not.toHaveBeenCalled()
    expect(m.log.warn).toHaveBeenCalledWith("translation loop NOT started in the worker", { mode: "off" })
    expect(m.schedulerInstances).toHaveLength(0)
  })

  it("scheduled run triggers surveillance and waits for it; beforeInvestigation yields to web users", async () => {
    m.remote.waitUntilNotBusy.mockResolvedValue(false)
    m.runSurveillance.mockImplementation(async (opts: { beforeInvestigation: (s?: AbortSignal) => Promise<void> }) => {
      await opts.beforeInvestigation(new AbortController().signal)
      return { ok: true }
    })
    await runWorker(cfg(), { surveillanceNow: false, envFiles: [] })
    await m.schedulerInstances[0].opts.run()
    expect(m.remote.waitUntilNotBusy).toHaveBeenCalledWith(1000, expect.anything())
    expect(m.log.warn).toHaveBeenCalledWith(expect.stringContaining("still busy"))
  })

  it("reports an already-running surveillance job", async () => {
    let release!: () => void
    m.runSurveillance.mockImplementation(() => new Promise((r) => (release = () => r({ ok: true }))))
    await runWorker(cfg(), { surveillanceNow: true, envFiles: [] })
    const run = m.schedulerInstances[0].opts.run()
    await flush()
    expect(m.log.info).toHaveBeenCalledWith("surveillance already running", expect.objectContaining({ source: "schedule" }))
    release()
    await run
  })

  it("heartbeat logs status while the lock is held", async () => {
    await runWorker(cfg(), { surveillanceNow: false, envFiles: [] })
    await vi.advanceTimersByTimeAsync(1000)
    expect(m.log.info).toHaveBeenCalledWith(
      "heartbeat",
      expect.objectContaining({ gate: "idle", surveillanceJob: null, nextSurveillanceAt: "2026-01-01T06:30:00.000Z" })
    )
  })

  it("heartbeat reports not-run-here when translation is external elsewhere", async () => {
    await runWorker(cfg({ runTranslation: false }), { surveillanceNow: false, envFiles: [] })
    await vi.advanceTimersByTimeAsync(1000)
    expect(m.log.info).toHaveBeenCalledWith("heartbeat", expect.objectContaining({ translation: "not-run-here" }))
  })

  it("lost lock triggers an ordered shutdown with exit code 1", async () => {
    await runWorker(cfg(), { surveillanceNow: false, envFiles: [] })
    m.lock.verify.mockResolvedValue(false)
    await vi.advanceTimersByTimeAsync(1000)
    await flush()
    await vi.advanceTimersByTimeAsync(0)
    expect(m.log.error).toHaveBeenCalledWith(expect.stringContaining("lock lost"), expect.anything())
    expect(m.stopTranslationWorker).toHaveBeenCalledWith({ timeoutMs: 2500 })
    expect(m.setWorkerAdmission).toHaveBeenLastCalledWith(null)
    expect(m.remote.stop).toHaveBeenCalled()
    expect(m.lock.release).toHaveBeenCalled()
    expect(m.prisma.$disconnect).toHaveBeenCalled()
    expect(m.aiLogFlush).toHaveBeenCalled()
    expect(exitSpy).toHaveBeenCalledWith(1)
  })

  it("SIGTERM shuts down with 0; a second signal exits immediately", async () => {
    m.stopTranslationWorker.mockResolvedValue(false)
    await runWorker(cfg(), { surveillanceNow: false, envFiles: [] })
    handlers.SIGTERM[0]()
    await vi.advanceTimersByTimeAsync(0)
    await flush()
    expect(m.log.error).toHaveBeenCalledWith("shutdown: stop-translation failed", expect.anything())
    expect(exitSpy).toHaveBeenCalledWith(0)
    handlers.SIGINT[0]()
    expect(exitSpy).toHaveBeenCalledWith(1)
    expect(m.log.error).toHaveBeenCalledWith("second shutdown request; exiting immediately", { reason: "SIGINT" })
  })

  it("IPC 'shutdown' message triggers shutdown; other messages are ignored", async () => {
    await runWorker(cfg(), { surveillanceNow: false, envFiles: [] })
    handlers.message[0]("hello")
    expect(m.log.info).not.toHaveBeenCalledWith("shutdown requested", expect.anything())
    handlers.message[0]("shutdown")
    expect(m.log.info).toHaveBeenCalledWith("shutdown requested", { reason: "ipc:shutdown", code: 0 })
    await vi.advanceTimersByTimeAsync(0)
    await flush()
  })

  it("logs uncaught exceptions (and shuts down) and unhandled rejections", async () => {
    await runWorker(cfg(), { surveillanceNow: false, envFiles: [] })
    handlers.unhandledRejection[0](new Error("rej"))
    handlers.unhandledRejection[0]("plain")
    expect(m.log.error).toHaveBeenCalledWith("unhandled rejection", { error: "rej" })
    expect(m.log.error).toHaveBeenCalledWith("unhandled rejection", { error: "plain" })
    handlers.uncaughtException[0](new Error("boom"))
    expect(m.log.error).toHaveBeenCalledWith("uncaught exception", expect.objectContaining({ error: "boom" }))
    await vi.advanceTimersByTimeAsync(0)
    await flush()
    expect(exitSpy).toHaveBeenCalledWith(1)
  })

  it("takes the single-instance lock on a dedicated connection, not the Prisma pool", async () => {
    await runWorker(cfg(), { surveillanceNow: false, envFiles: [] })
    expect(m.createLockConnect).toHaveBeenCalledWith(process.env)
    const acquire = m.acquireSingleInstance.mock.calls[0][0].acquire as (name: string) => Promise<unknown>
    m.acquireDedicatedLock.mockResolvedValue("HANDLE")
    await expect(acquire("kanflow_worker")).resolves.toBe("HANDLE")
    expect(m.acquireDedicatedLock).toHaveBeenCalledWith(m.connect, "kanflow_worker")
    expect(m.prisma.$transaction).not.toHaveBeenCalled()
  })

  it("writes the heartbeat file at start and on every heartbeat; removes it on shutdown", async () => {
    await runWorker(cfg(), { surveillanceNow: false, envFiles: [] })
    expect(m.writeHeartbeatFile).toHaveBeenCalledTimes(1)
    const [file, hb] = m.writeHeartbeatFile.mock.calls[0] as [string, Record<string, unknown>]
    expect(file).toBe("X:/logs/worker-heartbeat.json")
    expect(hb).toMatchObject({ v: 1, pid: process.pid, intervalMs: 1000, gate: "idle", businessHours: "off" })
    expect(hb.translation).toMatchObject({ mode: "external", runHere: true, lastTickAt: null })
    await vi.advanceTimersByTimeAsync(1000)
    expect(m.writeHeartbeatFile).toHaveBeenCalledTimes(2)
    handlers.SIGTERM[0]()
    await vi.advanceTimersByTimeAsync(0)
    await flush()
    expect(m.removeHeartbeatFile).toHaveBeenCalledWith("X:/logs/worker-heartbeat.json")
  })

  it("does not write or remove the heartbeat file while only waiting as standby", async () => {
    m.acquireSingleInstance.mockResolvedValue(null)
    await runWorker(cfg(), { surveillanceNow: false, envFiles: [] })
    expect(m.writeHeartbeatFile).not.toHaveBeenCalled()
    handlers.SIGTERM[0]()
    await vi.advanceTimersByTimeAsync(0)
    await flush()
    expect(m.removeHeartbeatFile).not.toHaveBeenCalled()
  })

  it("a failing heartbeat write is logged, not fatal", async () => {
    m.writeHeartbeatFile.mockImplementation(() => {
      throw new Error("EACCES")
    })
    await runWorker(cfg(), { surveillanceNow: false, envFiles: [] })
    expect(m.log.warn).toHaveBeenCalledWith("could not write heartbeat file", expect.objectContaining({ error: "EACCES" }))
    expect(m.log.info).toHaveBeenCalledWith("worker running")
  })

  it("heartbeat reports businessHours open/closed from the configured window", async () => {
    vi.setSystemTime(new Date(2026, 8, 23, 10, 0, 0)) // Wednesday 10:00 local
    const bh = { startMin: 8 * 60, endMin: 17 * 60 + 30, days: new Set([1, 2, 3, 4, 5]), ratePerMin: 6 }
    await runWorker(cfg({ businessHours: bh }), { surveillanceNow: false, envFiles: [] })
    expect((m.writeHeartbeatFile.mock.calls[0][1] as { businessHours: string }).businessHours).toBe("open")
    vi.setSystemTime(new Date(2026, 8, 23, 20, 0, 0))
    await vi.advanceTimersByTimeAsync(1000)
    expect((m.writeHeartbeatFile.mock.calls.at(-1)![1] as { businessHours: string }).businessHours).toBe("closed")
  })

  it("admission combines the AI gate with the business-hours limiter", async () => {
    vi.setSystemTime(new Date(2026, 8, 23, 10, 0, 0))
    const bh = { startMin: 8 * 60, endMin: 17 * 60 + 30, days: new Set([1, 2, 3, 4, 5]), ratePerMin: 2 }
    await runWorker(cfg({ businessHours: bh }), { surveillanceNow: false, envFiles: [] })
    const admission = m.setWorkerAdmission.mock.calls[0][0] as () => { allow: boolean; batch?: number; reason?: string }
    m.remote.admit.mockReturnValueOnce({ allow: true, batch: 3 } as never)
    expect(admission()).toEqual({ allow: true, batch: 2 })
    m.workerStatus.mockReturnValue({ lastTickAt: Date.now(), lastResult: { processed: 2, skipped: null } } as never)
    expect(admission()).toEqual({ allow: false, reason: "business-hours-rate" })
    m.remote.admit.mockReturnValueOnce({ allow: false, reason: "peer-busy" } as never)
    expect(admission()).toEqual({ allow: false, reason: "peer-busy" })
    m.workerStatus.mockReturnValue({ lastTickAt: null, lastResult: null } as never)
  })

  it("surveillance job failures are logged", async () => {
    m.runSurveillance.mockRejectedValue(new Error("fail"))
    await runWorker(cfg(), { surveillanceNow: true, envFiles: [] })
    await flush()
    expect(m.log.error).toHaveBeenCalledWith("surveillance job failed", expect.anything())
  })
})
