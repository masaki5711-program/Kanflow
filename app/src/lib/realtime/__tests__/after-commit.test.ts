import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const noopLog = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), child: () => noopLog }
vi.mock("@/lib/logger", () => ({ logger: noopLog }))

const $transaction = vi.fn()
vi.mock("@/lib/prisma", () => ({ prisma: { $transaction: (...a: unknown[]) => $transaction(...a) } }))

const bus = await import("../bus")
const { publishAfterCommit, runWithCommitScope } = await import("../after-commit")
const { withTransaction } = await import("@/services/_shared/db")

const input = { type: "activity" as const, projectId: "p1", entityType: "pbi", entityId: "b1", action: "update" }

let received: string[]
beforeEach(() => {
  bus.resetBusForTests()
  received = []
  bus.subscribe((e) => received.push(`${e.type}:${e.entityId}`))
})
afterEach(() => vi.useRealTimers())

describe("runWithCommitScope / publishAfterCommit", () => {
  it("buffers events published inside the scope and delivers them once the body resolved", async () => {
    let seenInside: string[] = []
    await runWithCommitScope(async () => {
      publishAfterCommit(input)
      await Promise.resolve()
      seenInside = [...received]
    })
    expect(seenInside).toEqual([])
    expect(received).toEqual(["activity:b1"])
  })

  it("drops the events of a scope whose body rejects (rolled back)", async () => {
    vi.useFakeTimers()
    await expect(
      runWithCommitScope(async () => {
        publishAfterCommit(input)
        throw new Error("rollback")
      }),
    ).rejects.toThrow("rollback")
    vi.advanceTimersByTime(bus.DEFERRED_PUBLISH_MS * 2)
    expect(received).toEqual([])
  })

  it("stamps the publish time", async () => {
    const at: string[] = []
    bus.subscribe((e) => at.push(e.at))
    await runWithCommitScope(async () => publishAfterCommit(input))
    expect(Date.parse(at[0])).not.toBeNaN()
  })

  it("outside a scope the event is deferred by DEFERRED_PUBLISH_MS", () => {
    vi.useFakeTimers()
    publishAfterCommit(input)
    expect(received).toEqual([])
    vi.advanceTimersByTime(bus.DEFERRED_PUBLISH_MS)
    expect(received).toEqual(["activity:b1"])
  })

  it("an event from a promise that outlives its scope is deferred, not lost", async () => {
    vi.useFakeTimers()
    let late: () => void = () => {}
    await runWithCommitScope(async () => {
      late = () => publishAfterCommit({ ...input, entityId: "late" })
    })
    late()
    vi.advanceTimersByTime(bus.DEFERRED_PUBLISH_MS)
    expect(received).toEqual(["activity:late"])
  })

  it("a nested scope delivers its own events when it commits, the outer ones when the outer commits", async () => {
    const order: string[] = []
    await runWithCommitScope(async () => {
      publishAfterCommit({ ...input, entityId: "outer" })
      await runWithCommitScope(async () => publishAfterCommit({ ...input, entityId: "inner" }))
      order.push(...received)
    })
    expect(order).toEqual(["activity:inner"])
    expect(received).toEqual(["activity:inner", "activity:outer"])
  })
})

describe("withTransaction (after-commit wiring)", () => {
  it("publishes only after prisma.$transaction resolved (COMMIT), so a refetch reads committed rows", async () => {
    let commit: () => void = () => {}
    $transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
      const result = await fn({ tx: true })
      await new Promise<void>((resolve) => {
        commit = resolve
      })
      return result
    })
    const done = withTransaction(async () => {
      publishAfterCommit(input)
      return "ok"
    })
    await vi.waitFor(() => expect($transaction).toHaveBeenCalled())
    await Promise.resolve()
    expect(received).toEqual([])
    commit()
    await expect(done).resolves.toBe("ok")
    expect(received).toEqual(["activity:b1"])
  })

  it("publishes nothing when the transaction fails", async () => {
    vi.useFakeTimers()
    $transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
      await fn({})
      throw new Error("deadlock")
    })
    await expect(withTransaction(async () => publishAfterCommit(input))).rejects.toThrow("deadlock")
    vi.advanceTimersByTime(bus.DEFERRED_PUBLISH_MS * 2)
    expect(received).toEqual([])
  })
})
