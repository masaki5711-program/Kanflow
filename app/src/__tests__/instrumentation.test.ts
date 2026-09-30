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
  }
})

vi.mock("@/lib/translation/worker-mode", () => ({ decideInProcessWorker: m.decide }))
vi.mock("@/lib/logger", () => ({ logger: { child: () => m.log } }))
vi.mock("@/lib/translation/worker", () => ({
  startTranslationWorker: m.startTranslationWorker,
  setWorkerAdmission: m.setWorkerAdmission,
}))
vi.mock("@/lib/ai-gate", () => ({ createRemoteGate: m.createRemoteGate }))

const { register } = await import("@/instrumentation")

beforeEach(() => {
  vi.clearAllMocks()
  m.createRemoteGate.mockReturnValue(m.remote)
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
