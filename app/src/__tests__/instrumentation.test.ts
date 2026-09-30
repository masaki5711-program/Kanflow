import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const m = vi.hoisted(() => {
  const log = { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
  return {
    log,
    decide: vi.fn(),
    startTranslationWorker: vi.fn(),
    setWorkerAdmission: vi.fn(),
    remote: { start: vi.fn(), admit: vi.fn(() => ({ allow: false })) },
    createRemoteGate: vi.fn(),
    jobRunner: { start: vi.fn() },
    createAiJobRunner: vi.fn(),
    waitForLocalGate: vi.fn(async () => undefined),
    gate: { isIdle: vi.fn(() => true) },
    startMetrics: vi.fn(() => true),
  }
})

vi.mock("@/lib/translation/worker-mode", () => ({ decideInProcessWorker: m.decide }))
vi.mock("@/lib/logger", () => ({ logger: { child: () => m.log } }))
vi.mock("@/lib/translation/worker", () => ({
  startTranslationWorker: m.startTranslationWorker,
  setWorkerAdmission: m.setWorkerAdmission,
}))
vi.mock("@/lib/ai-gate", () => ({ createRemoteGate: m.createRemoteGate }))
vi.mock("@/lib/ai-jobs", () => ({
  createAiJobRunner: m.createAiJobRunner,
  loadAiJobRunnerConfig: () => ({ pollMs: 5000, staleMs: 1, yieldMaxMs: 777 }),
  waitForLocalGate: m.waitForLocalGate,
}))
vi.mock("@/lib/translation/priority-gate", () => ({ gate: m.gate }))
vi.mock("@/lib/metrics/runtime", () => ({ startMetrics: m.startMetrics }))

const { register } = await import("@/instrumentation")

beforeEach(() => {
  vi.clearAllMocks()
  m.createRemoteGate.mockReturnValue(m.remote)
  m.createAiJobRunner.mockReturnValue(m.jobRunner)
  m.decide.mockReturnValue({ start: false, mode: "external", reason: "external mode" })
  vi.stubEnv("NEXT_RUNTIME", "nodejs")
  vi.stubEnv("AI_GATE_PEERS", "")
})
afterEach(() => vi.unstubAllEnvs())

describe("register", () => {
  it("does nothing outside the nodejs runtime", async () => {
    vi.stubEnv("NEXT_RUNTIME", "edge")
    await register()
    expect(m.decide).not.toHaveBeenCalled()
  })

  it("warns in production when the external worker is expected", async () => {
    vi.stubEnv("NODE_ENV", "production")
    m.decide.mockReturnValue({ start: false, mode: "external", reason: "external mode" })
    await register()
    expect(m.log.warn).toHaveBeenCalledWith(expect.stringContaining("kanflow-worker"), { reason: "external mode" })
    expect(m.startTranslationWorker).not.toHaveBeenCalled()
  })

  it("only logs info when not starting outside production", async () => {
    vi.stubEnv("NODE_ENV", "development")
    m.decide.mockReturnValue({ start: false, mode: "external", reason: "dev" })
    await register()
    expect(m.log.info).toHaveBeenCalledWith("translation worker not started in this process", { reason: "dev" })
    expect(m.log.warn).not.toHaveBeenCalled()
  })

  it("only logs info for the off mode in production", async () => {
    vi.stubEnv("NODE_ENV", "production")
    m.decide.mockReturnValue({ start: false, mode: "off", reason: "off" })
    await register()
    expect(m.log.warn).not.toHaveBeenCalled()
    expect(m.log.info).toHaveBeenCalled()
  })

  it("starts the in-process worker without a remote gate when no peers", async () => {
    m.decide.mockReturnValue({ start: true, mode: "inprocess", reason: "inprocess" })
    await register()
    expect(m.startTranslationWorker).toHaveBeenCalled()
    expect(m.createRemoteGate).not.toHaveBeenCalled()
    expect(m.log.info).toHaveBeenCalledWith("in-process translation worker started", { reason: "inprocess" })
  })

  it("wires the remote gate when explicit peers are configured", async () => {
    vi.stubEnv("AI_GATE_PEERS", "http://a:3000")
    m.decide.mockReturnValue({ start: true, mode: "inprocess", reason: "inprocess" })
    await register()
    expect(m.createRemoteGate).toHaveBeenCalledWith(process.env, m.log)
    expect(m.remote.start).toHaveBeenCalled()
    const admission = m.setWorkerAdmission.mock.calls[0][0] as () => unknown
    expect(admission()).toEqual({ allow: false })
  })
})

describe("register — AI job runner", () => {
  it("starts the in-process job runner in web mode, waiting on the local gate", async () => {
    vi.stubEnv("NODE_ENV", "production")
    vi.stubEnv("AI_JOB_RUNNER", "web")
    await register()
    expect(m.jobRunner.start).toHaveBeenCalled()
    expect(m.log.info).toHaveBeenCalledWith("in-process ai job runner started", expect.anything())
    const { waitForTurn } = m.createAiJobRunner.mock.calls[0][0] as { waitForTurn: (s: AbortSignal) => Promise<void> }
    const signal = new AbortController().signal
    await waitForTurn(signal)
    expect(m.waitForLocalGate).toHaveBeenCalledWith(expect.any(Function), signal, 777)
    const isIdle = (m.waitForLocalGate.mock.calls as unknown as unknown[][])[0][0] as () => boolean
    expect(isIdle()).toBe(true)
    expect(m.gate.isIdle).toHaveBeenCalledWith(3000)
  })

  it("does not start it when the worker runs jobs", async () => {
    vi.stubEnv("NODE_ENV", "production")
    vi.stubEnv("AI_JOB_RUNNER", "worker")
    await register()
    expect(m.createAiJobRunner).not.toHaveBeenCalled()
    expect(m.log.info).toHaveBeenCalledWith("ai job runner not started in this process", expect.anything())
  })

  it("logs a start failure without throwing", async () => {
    vi.stubEnv("NODE_ENV", "production")
    vi.stubEnv("AI_JOB_RUNNER", "web")
    m.createAiJobRunner.mockImplementation(() => {
      throw new Error("boom")
    })
    await expect(register()).resolves.toBeUndefined()
    expect(m.log.error).toHaveBeenCalledWith("ai job runner failed to start", { error: "boom" })
  })
})

describe("register — request metrics", () => {
  it("starts the metrics runtime with the instrumentation logger", async () => {
    await register()
    expect(m.startMetrics).toHaveBeenCalledWith(m.log)
  })

  it("logs a metrics start failure without throwing", async () => {
    m.startMetrics.mockImplementationOnce(() => {
      throw new Error("dc")
    })
    await expect(register()).resolves.toBeUndefined()
    expect(m.log.error).toHaveBeenCalledWith("metrics failed to start", { error: "dc" })
  })
})
