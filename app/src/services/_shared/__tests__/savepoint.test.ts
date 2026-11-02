import { beforeEach, describe, expect, it, vi } from "vitest"

const log = vi.hoisted(() => ({ warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() }))
vi.mock("@/lib/logger", () => ({ logger: { child: () => log } }))

import { bestEffort, SavepointRollbackError } from "../savepoint"

beforeEach(() => vi.clearAllMocks())

function txDouble(failOn?: string) {
  const statements: string[] = []
  const tx = {
    $executeRawUnsafe: vi.fn(async (sql: string) => {
      statements.push(sql)
      if (failOn && sql.startsWith(failOn)) throw new Error("connection gone")
      return 0
    }),
  }
  return { tx: tx as never, statements }
}

describe("bestEffort", () => {
  it("runs fn directly on the global client (it has $transaction: nothing to protect)", async () => {
    const global = { $transaction: vi.fn(), $executeRawUnsafe: vi.fn() }
    await expect(bestEffort(global as never, async () => 7)).resolves.toBe(7)
    expect(global.$executeRawUnsafe).not.toHaveBeenCalled()
  })

  it("wraps fn in a savepoint inside a transaction and releases it on success", async () => {
    const { tx, statements } = txDouble()
    await expect(bestEffort(tx, async () => "ok")).resolves.toBe("ok")
    expect(statements).toHaveLength(2)
    expect(statements[0]).toMatch(/^SAVEPOINT kanflow_be_\d+$/)
    expect(statements[1]).toBe(`RELEASE ${statements[0]}`)
  })

  it("rolls back to the savepoint and re-throws the original error, so the transaction stays usable", async () => {
    const { tx, statements } = txDouble()
    const boom = new Error("value too long")
    await expect(bestEffort(tx, async () => Promise.reject(boom))).rejects.toBe(boom)
    expect(statements[1]).toBe(`ROLLBACK TO ${statements[0]}`)
  })

  it("a failed ROLLBACK TO SAVEPOINT is logged and thrown (the transaction must fail visibly), keeping the cause", async () => {
    const { tx, statements } = txDouble("ROLLBACK")
    const boom = new Error("insert failed")
    const err = await bestEffort(tx, async () => Promise.reject(boom)).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(SavepointRollbackError)
    expect((err as SavepointRollbackError).cause).toBe(boom)
    expect((err as Error).message).toContain(statements[0].replace("SAVEPOINT ", ""))
    expect(log.error).toHaveBeenCalledWith(
      "rollback to savepoint failed; the transaction is unusable",
      expect.objectContaining({ savepoint: statements[0].replace("SAVEPOINT ", ""), error: "connection gone", cause: "insert failed" })
    )
  })

  it("uses a fresh savepoint name per call (nested / interleaved calls do not collide)", async () => {
    const { tx, statements } = txDouble()
    await bestEffort(tx, async () => undefined)
    await bestEffort(tx, async () => undefined)
    expect(statements[0]).not.toBe(statements[2])
  })

  it("treats a partial test double without raw SQL like the global client", async () => {
    await expect(bestEffort({ fieldTranslation: {} } as never, async () => 1)).resolves.toBe(1)
  })
})
