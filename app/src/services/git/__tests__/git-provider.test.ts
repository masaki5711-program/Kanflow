import { describe, expect, it, vi } from "vitest"

const noopLog = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), child: () => noopLog }
vi.mock("@/lib/prisma", () => ({ prisma: {} }))
vi.mock("@/lib/logger", () => ({ logger: noopLog }))

const { assertOneSource, DEFAULT_GIT_PROVIDER, GIT_PROVIDERS, parseGitProvider, readableProvider, supportedProviderFilter, UnsupportedProviderError } = await import("../git-provider")
const { devSourceFor } = await import("../dev-source")

describe("parseGitProvider", () => {
  it("accepts gitlab, the only provider today (and the default)", () => {
    expect(GIT_PROVIDERS).toEqual(["gitlab"])
    expect(DEFAULT_GIT_PROVIDER).toBe("gitlab")
    expect(parseGitProvider("gitlab")).toBe("gitlab")
  })

  it.each(["gitstation", "github", "GitLab", "", " gitlab", null, undefined, 1])("rejects %j with a 400 GIT_PROVIDER_UNSUPPORTED (never falls back to GitLab)", (value) => {
    let caught: unknown
    try {
      parseGitProvider(value)
    } catch (err) {
      caught = err
    }
    expect(caught).toBeInstanceOf(UnsupportedProviderError)
    expect(caught).toMatchObject({ status: 400, code: "GIT_PROVIDER_UNSUPPORTED" })
    expect((caught as Error).message).toContain("gitlab")
  })

  it("keeps an oversized provider out of the message (32 characters at most)", () => {
    const err = new UnsupportedProviderError("x".repeat(500))
    expect(err.provider).toHaveLength(32)
    expect(err.extra).toEqual({ provider: "x".repeat(32) })
  })
})

describe("devSourceFor (source factory)", () => {
  it("returns the GitLab source kind with its cursor codec", () => {
    const kind = devSourceFor("gitlab")
    expect(kind.provider).toBe("gitlab")
    expect(typeof kind.cursors.fromRow).toBe("function")
    expect(typeof kind.connect).toBe("function")
  })

  it.each(["gitstation", "github", "", undefined])("rejects unknown provider %j", (provider) => {
    expect(() => devSourceFor(provider)).toThrow(UnsupportedProviderError)
  })
})

describe("assertOneSource (one ingestion source per project)", () => {
  it("allows a first integration, the same provider, or a switch while no repository exists", () => {
    expect(() => assertOneSource(null, "gitlab", 3)).not.toThrow()
    expect(() => assertOneSource("gitlab", "gitlab", 3)).not.toThrow()
    expect(() => assertOneSource("gitstation", "gitlab", 0)).not.toThrow()
  })

  it("refuses to switch the source of a project that has repositories (409 GIT_SOURCE_LOCKED)", () => {
    expect(() => assertOneSource("gitstation", "gitlab", 1)).toThrow(expect.objectContaining({ status: 409, code: "GIT_SOURCE_LOCKED", extra: { provider: "gitstation" } }))
  })
})

describe("readableProvider (gate for background work)", () => {
  it("passes a supported provider without logging", () => {
    expect(readableProvider("rA", "gitlab", "sync")).toBe("gitlab")
    expect(noopLog.error).not.toHaveBeenCalled()
  })

  it("refuses anything else, logging once per repository and provider per process", () => {
    expect(readableProvider("rB", "github", "sync")).toBeNull()
    expect(readableProvider("rB", "github", "index")).toBeNull()
    expect(readableProvider("rC", "github", "sync")).toBeNull()
    expect(noopLog.error.mock.calls).toEqual([
      ["git provider unsupported", { repositoryId: "rB", provider: "github", skipped: "sync" }],
      ["git provider unsupported", { repositoryId: "rC", provider: "github", skipped: "sync" }],
    ])
  })

  it("the query filter lists exactly the supported providers", () => {
    expect(supportedProviderFilter()).toEqual({ in: ["gitlab"] })
  })
})
