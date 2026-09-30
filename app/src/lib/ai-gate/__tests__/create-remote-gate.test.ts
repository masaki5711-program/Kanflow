import { beforeEach, describe, expect, it, vi } from "vitest"

const probePeer = vi.fn()
vi.mock("@/lib/ai-gate/peer-client", async (orig) => ({
  ...(await orig<typeof import("@/lib/ai-gate/peer-client")>()),
  probePeer: (...a: unknown[]) => probePeer(...a),
}))

const { createRemoteGate, RemoteGate } = await import("@/lib/ai-gate")

beforeEach(() => probePeer.mockReset())

describe("createRemoteGate", () => {
  it("warns when peers are configured without a token", () => {
    const log = { warn: vi.fn(), info: vi.fn(), error: vi.fn() }
    const g = createRemoteGate({ AI_GATE_PEERS: "http://a:3000" } as unknown as NodeJS.ProcessEnv, log as never)
    expect(g).toBeInstanceOf(RemoteGate)
    expect(log.warn).toHaveBeenCalledWith(expect.stringContaining("INTERNAL_API_TOKEN"), { peers: ["http://a:3000"] })
  })

  it("does not warn with a token or without peers", () => {
    const log = { warn: vi.fn(), info: vi.fn(), error: vi.fn() }
    createRemoteGate({ AI_GATE_PEERS: "http://a:3000", INTERNAL_API_TOKEN: "t" } as unknown as NodeJS.ProcessEnv, log as never)
    createRemoteGate({ AI_GATE_PEERS: "none" } as unknown as NodeJS.ProcessEnv, log as never)
    createRemoteGate({ AI_GATE_PEERS: "http://a:3000" } as unknown as NodeJS.ProcessEnv)
    expect(log.warn).not.toHaveBeenCalled()
  })

  it("wires the probe with the configured token and timeout", async () => {
    probePeer.mockResolvedValue({ ok: false, error: "down" })
    const g = createRemoteGate({
      AI_GATE_PEERS: "http://a:3000",
      INTERNAL_API_TOKEN: "secret",
      AI_GATE_TIMEOUT_MS: "123",
    } as unknown as NodeJS.ProcessEnv)
    const deps = (g as unknown as { deps?: { probe: (u: string) => unknown } }).deps
    const probe =
      deps?.probe ??
      (Object.values(g as unknown as Record<string, unknown>).find(
        (v) => v && typeof v === "object" && "probe" in (v as object)
      ) as { probe: (u: string) => unknown } | undefined)?.probe
    expect(typeof probe).toBe("function")
    await probe!("http://a:3000")
    expect(probePeer).toHaveBeenCalledWith("http://a:3000", "secret", { timeoutMs: 123 })
  })
})
