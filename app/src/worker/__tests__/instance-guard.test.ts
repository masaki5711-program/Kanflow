import { describe, expect, test, vi } from "vitest"
import { acquireNamedLock, lockResultIsOne, type RawTx, type TxRunner } from "../named-lock"
import { acquireSingleInstance } from "../instance-guard"

/**
 * Fake Prisma: `$transaction` runs the callback against a tx whose
 * `$queryRaw` is answered by `answer(sql, values)`. The transaction promise
 * settles only when the callback does (like the real interactive tx).
 */
function fakeClient(answer: (sql: string, values: unknown[]) => unknown) {
  const queries: string[] = []
  const tx: RawTx = {
    $queryRaw: vi.fn(async (strings: TemplateStringsArray, ...values: unknown[]) => {
      const sql = strings.join("?")
      queries.push(sql)
      return answer(sql, values) as never
    }) as RawTx["$queryRaw"],
  }
  const client: TxRunner = {
    $transaction: vi.fn(async (fn) => fn(tx)) as TxRunner["$transaction"],
  }
  return { client, queries }
}

describe("lockResultIsOne", () => {
  test("accepts 1 / 1n, rejects 0 / null / empty", () => {
    expect(lockResultIsOne([{ v: 1 }])).toBe(true)
    expect(lockResultIsOne([{ v: BigInt(1) }])).toBe(true)
    expect(lockResultIsOne([{ v: 0 }])).toBe(false)
    expect(lockResultIsOne([{ v: null }])).toBe(false)
    expect(lockResultIsOne([])).toBe(false)
  })
})

describe("acquireNamedLock", () => {
  test("acquires with GET_LOCK(name, 0), verifies on the same tx and releases", async () => {
    const { client, queries } = fakeClient(() => [{ v: BigInt(1) }])
    const handle = await acquireNamedLock(client, "kanflow_worker")
    expect(handle).not.toBeNull()
    expect(queries[0]).toContain("GET_LOCK(")
    await expect(handle!.verify()).resolves.toBe(true)
    expect(queries[1]).toContain("IS_USED_LOCK(")
    await handle!.release()
    expect(queries[2]).toContain("RELEASE_LOCK(")
    await expect(handle!.verify()).resolves.toBe(false)
    expect(client.$transaction).toHaveBeenCalledTimes(1)
  })

  test("returns null when another session holds the lock", async () => {
    const { client } = fakeClient(() => [{ v: 0 }])
    await expect(acquireNamedLock(client, "kanflow_worker")).resolves.toBeNull()
  })

  test("verify() is false when the session no longer owns the lock", async () => {
    const { client } = fakeClient((sql) => (sql.includes("IS_USED_LOCK") ? [{ v: null }] : [{ v: 1 }]))
    const handle = await acquireNamedLock(client, "kanflow_worker")
    await expect(handle!.verify()).resolves.toBe(false)
    await handle!.release()
  })

  test("verify() is false when the pinned connection died", async () => {
    const { client } = fakeClient((sql) => {
      if (sql.includes("IS_USED_LOCK")) throw new Error("connection lost")
      return [{ v: 1 }]
    })
    const handle = await acquireNamedLock(client, "kanflow_worker")
    await expect(handle!.verify()).resolves.toBe(false)
    await expect(handle!.verify()).resolves.toBe(false)
  })

  test("rejects when the database is unreachable", async () => {
    const client: TxRunner = { $transaction: vi.fn(async () => Promise.reject(new Error("pool timeout"))) as TxRunner["$transaction"] }
    await expect(acquireNamedLock(client, "x")).rejects.toThrow("pool timeout")
  })
})

describe("acquireSingleInstance", () => {
  test("waits as standby until the other instance's lock is gone", async () => {
    let calls = 0
    const { client } = fakeClient((sql) => {
      if (sql.includes("GET_LOCK")) return [{ v: ++calls >= 3 ? 1 : 0 }]
      return [{ v: 1 }]
    })
    const sleep = vi.fn(async () => undefined)
    const warn = vi.fn()
    const handle = await acquireSingleInstance({ acquire: (n) => acquireNamedLock(client, n), name: "kanflow_worker", retryMs: 30_000, sleep, log: { info: vi.fn(), warn } })
    expect(handle).not.toBeNull()
    expect(calls).toBe(3)
    expect(sleep).toHaveBeenCalledTimes(2)
    expect(warn).toHaveBeenCalledTimes(1) // standby message logged once, not per retry
    await handle!.release()
  })

  test("database errors are retried, abort returns null", async () => {
    const controller = new AbortController()
    const acquire = vi.fn(async () => {
      throw new Error("ECONNREFUSED")
    })
    const sleep = vi.fn(async () => {
      if (acquire.mock.calls.length >= 2) controller.abort()
    })
    const handle = await acquireSingleInstance({
      name: "kanflow_worker",
      retryMs: 1,
      signal: controller.signal,
      acquire,
      sleep,
    })
    expect(handle).toBeNull()
    expect(acquire).toHaveBeenCalledTimes(2)
  })

  test("a lock obtained after abort is released immediately", async () => {
    const controller = new AbortController()
    const release = vi.fn(async () => undefined)
    const acquire = vi.fn(async () => {
      controller.abort()
      return { name: "x", verify: async () => true, release }
    })
    await expect(acquireSingleInstance({ name: "x", retryMs: 1, signal: controller.signal, acquire })).resolves.toBeNull()
    expect(release).toHaveBeenCalledTimes(1)
  })
})
