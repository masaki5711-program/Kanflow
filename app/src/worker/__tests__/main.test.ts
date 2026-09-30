import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest"

const m = vi.hoisted(() => ({
  loadEnvFiles: vi.fn(() => [".env"]),
  loadWorkerConfig: vi.fn(() => ({ cfg: true })),
  describeConfig: vi.fn(() => ({ described: true })),
  runWorker: vi.fn(),
}))

vi.mock("@/worker/config", () => ({
  loadEnvFiles: m.loadEnvFiles,
  loadWorkerConfig: m.loadWorkerConfig,
  describeConfig: m.describeConfig,
}))
vi.mock("@/worker/runtime", () => ({ runWorker: m.runWorker }))

let exitSpy: MockInstance<typeof process.exit>
let stdout: MockInstance<typeof process.stdout.write>
let stderr: MockInstance<typeof process.stderr.write>
const origArgv = process.argv

async function runMain(args: string[]) {
  process.argv = ["node", "main.ts", ...args]
  vi.resetModules()
  await import("@/worker/main")
  for (let i = 0; i < 20; i++) await new Promise((r) => setTimeout(r, 0))
}

beforeEach(() => {
  vi.clearAllMocks()
  m.runWorker.mockResolvedValue(undefined)
  exitSpy = vi.spyOn(process, "exit").mockImplementation((() => undefined) as never)
  stdout = vi.spyOn(process.stdout, "write").mockImplementation(() => true)
  stderr = vi.spyOn(process.stderr, "write").mockImplementation(() => true)
})
afterEach(() => {
  process.argv = origArgv
  vi.restoreAllMocks()
})

describe("worker main", () => {
  it("prints usage and exits 0 for --help", async () => {
    await runMain(["--help"])
    expect(stdout.mock.calls[0][0]).toContain("Usage: npm run worker")
    expect(exitSpy.mock.calls[0][0]).toBe(0)
  })

  it("reports unknown arguments and exits 2", async () => {
    await runMain(["--bogus"])
    expect(stderr.mock.calls[0][0]).toContain("unknown argument(s): --bogus")
    expect(exitSpy.mock.calls[0][0]).toBe(2)
  })

  it("prints the resolved config for --dry-run and exits 0 without starting", async () => {
    await runMain(["--dry-run"])
    const printed = JSON.parse(String(stdout.mock.calls[0][0]))
    expect(printed).toMatchObject({ dryRun: true, envFiles: [".env"], config: { described: true } })
    expect(exitSpy.mock.calls[0][0]).toBe(0)
  })

  it("runs the worker with CLI flags", async () => {
    await runMain(["--surveillance-now"])
    expect(m.runWorker).toHaveBeenCalledWith({ cfg: true }, { surveillanceNow: true, envFiles: [".env"] })
    expect(exitSpy).not.toHaveBeenCalled()
  })

  it("exits 1 when start-up fails", async () => {
    m.runWorker.mockRejectedValue(new Error("db down"))
    await runMain([])
    expect(String(stderr.mock.calls[0][0])).toContain("kanflow-worker failed to start")
    expect(String(stderr.mock.calls[0][0])).toContain("db down")
    expect(exitSpy).toHaveBeenCalledWith(1)
  })

  it("handles non-Error failures", async () => {
    m.runWorker.mockRejectedValue("nope")
    await runMain([])
    expect(String(stderr.mock.calls[0][0])).toContain("nope")
  })
})
