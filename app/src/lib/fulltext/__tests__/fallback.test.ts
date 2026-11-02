import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const log = vi.hoisted(() => ({ warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() }))
vi.mock("@/lib/logger", () => ({ logger: { child: () => log } }))

const { withFulltext, resetFulltextFallback, FULLTEXT_RETRY_MS } = await import("../fallback")

const missingIndex = () =>
  Object.assign(new Error("Raw query failed. Code: `42883`. Message: `function word_similarity(unknown, text) does not exist`"), {
    meta: { driverAdapterError: { cause: { code: "42883" } } },
  })

beforeEach(() => {
  vi.clearAllMocks()
  resetFulltextFallback()
})
afterEach(() => {
  vi.unstubAllEnvs()
  vi.useRealTimers()
})

describe("withFulltext", () => {
  it("runs the trigram path with the search terms and skips LIKE when it returns rows", async () => {
    const fulltext = vi.fn(async (terms: readonly string[]) => [...terms])
    const like = vi.fn(async () => ["like"])
    expect(await withFulltext("login api", fulltext, like)).toEqual(["login", "api"])
    expect(like).not.toHaveBeenCalled()
  })

  it("falls back to LIKE when the trigram path finds nothing (null)", async () => {
    const like = vi.fn(async () => ["like"])
    expect(await withFulltext("login", async () => null, like)).toEqual(["like"])
  })

  it("uses LIKE directly for terms shorter than 3 characters (no trigram, would scan)", async () => {
    const fulltext = vi.fn(async () => ["ft"])
    expect(await withFulltext("機", fulltext, async () => ["like"])).toEqual(["like"])
    expect(await withFulltext("受入", fulltext, async () => ["like"])).toEqual(["like"])
    expect(await withFulltext("ab cde", fulltext, async () => ["like"])).toEqual(["like"])
    expect(fulltext).not.toHaveBeenCalled()
  })

  it("uses LIKE directly when SEARCH_FULLTEXT=off", async () => {
    vi.stubEnv("SEARCH_FULLTEXT", "off")
    const fulltext = vi.fn(async () => ["ft"])
    expect(await withFulltext("login", fulltext, async () => ["like"])).toEqual(["like"])
    expect(fulltext).not.toHaveBeenCalled()
  })

  it("falls back when pg_trgm is missing, warns once and pauses the trigram path for a while", async () => {
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
