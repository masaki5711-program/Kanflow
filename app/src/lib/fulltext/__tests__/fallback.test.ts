import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const log = vi.hoisted(() => ({ warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() }))
vi.mock("@/lib/logger", () => ({ logger: { child: () => log } }))

const { withFulltext, resetFulltextFallback, FULLTEXT_RETRY_MS } = await import("../fallback")

const missingIndex = () =>
  Object.assign(new Error("Raw query failed. Code: `1191`."), { meta: { driverAdapterError: { cause: { code: 1191 } } } })

beforeEach(() => {
  vi.clearAllMocks()
  resetFulltextFallback()
})
afterEach(() => {
  vi.unstubAllEnvs()
  vi.useRealTimers()
})

describe("withFulltext", () => {
  it("runs the FULLTEXT path with the boolean query and skips LIKE when it returns rows", async () => {
    const fulltext = vi.fn(async (q: string) => [q])
    const like = vi.fn(async () => ["like"])
    expect(await withFulltext("login api", fulltext, like)).toEqual(["+login* +api*"])
    expect(like).not.toHaveBeenCalled()
  })

  it("falls back to LIKE when FULLTEXT finds nothing (null)", async () => {
    const like = vi.fn(async () => ["like"])
    expect(await withFulltext("login", async () => null, like)).toEqual(["like"])
  })

  it("uses LIKE directly for short terms", async () => {
    const fulltext = vi.fn(async () => ["ft"])
    expect(await withFulltext("機", fulltext, async () => ["like"])).toEqual(["like"])
    expect(fulltext).not.toHaveBeenCalled()
  })

  it("uses LIKE directly when SEARCH_FULLTEXT=off", async () => {
    vi.stubEnv("SEARCH_FULLTEXT", "off")
    const fulltext = vi.fn(async () => ["ft"])
    expect(await withFulltext("login", fulltext, async () => ["like"])).toEqual(["like"])
    expect(fulltext).not.toHaveBeenCalled()
  })

  it("falls back on a missing FULLTEXT index, warns once and pauses FULLTEXT for a while", async () => {
    vi.useFakeTimers({ now: 1_000_000 })
    const fulltext = vi.fn(async () => {
      throw missingIndex()
    })
    const like = vi.fn(async () => ["like"])

    expect(await withFulltext("login", fulltext, like)).toEqual(["like"])
    expect(await withFulltext("login", fulltext, like)).toEqual(["like"])
    expect(fulltext).toHaveBeenCalledTimes(1) // paused after the first failure
    expect(log.warn).toHaveBeenCalledTimes(1)

    vi.setSystemTime(1_000_000 + FULLTEXT_RETRY_MS + 1)
    expect(await withFulltext("login", fulltext, like)).toEqual(["like"])
    expect(fulltext).toHaveBeenCalledTimes(2) // retried after the pause
    expect(log.warn).toHaveBeenCalledTimes(1) // still logged only once
  })

  it("rethrows any other database error", async () => {
    const boom = new Error("connection lost")
    await expect(
      withFulltext("login", async () => {
        throw boom
      }, async () => ["like"])
    ).rejects.toBe(boom)
  })
})
