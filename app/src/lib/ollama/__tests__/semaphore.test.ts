import { describe, expect, test } from "vitest"
import { PrioritySemaphore } from "../semaphore"

const flush = () => new Promise((r) => setTimeout(r, 0))

describe("PrioritySemaphore", () => {
  test("grants up to max immediately and queues the rest", async () => {
    const sem = new PrioritySemaphore(2)
    const r1 = await sem.acquire("user")
    await sem.acquire("user")
    let third = false
    void sem.acquire("user").then(() => {
      third = true
    })
    await flush()
    expect(third).toBe(false)
    expect(sem.status()).toEqual({ max: 2, active: 2, queuedUser: 1, queuedBackground: 0 })
    r1()
    await flush()
    expect(third).toBe(true)
  })

  test("serves waiting user acquirers before earlier background ones", async () => {
    const sem = new PrioritySemaphore(1)
    const release = await sem.acquire("background")
    const order: string[] = []
    const b1 = sem.acquire("background").then((r) => (order.push("bg1"), r))
    const u1 = sem.acquire("user").then((r) => (order.push("user1"), r))
    const u2 = sem.acquire("user").then((r) => (order.push("user2"), r))

    release()
    ;(await u1)()
    ;(await u2)()
    ;(await b1)()
    expect(order).toEqual(["user1", "user2", "bg1"])
    expect(sem.status().active).toBe(0)
  })

  test("FIFO within the same lane", async () => {
    const sem = new PrioritySemaphore(1)
    const release = await sem.acquire("user")
    const order: number[] = []
    const waits = [1, 2, 3].map((n) => sem.acquire("user").then((r) => (order.push(n), r)))
    release()
    for (const w of waits) (await w)()
    expect(order).toEqual([1, 2, 3])
  })

  test("an aborted waiter leaves the queue and rejects with the reason", async () => {
    const sem = new PrioritySemaphore(1)
    const release = await sem.acquire("user")
    const ac = new AbortController()
    const waiting = sem.acquire("user", ac.signal)
    ac.abort(new Error("gone"))
    await expect(waiting).rejects.toThrow("gone")
    expect(sem.status().queuedUser).toBe(0)
    release()
    expect(sem.status().active).toBe(0)
  })

  test("rejects immediately when the signal is already aborted", async () => {
    const sem = new PrioritySemaphore(1)
    await expect(sem.acquire("user", AbortSignal.abort(new Error("x")))).rejects.toThrow("x")
    expect(sem.status().active).toBe(0)
  })

  test("release is idempotent", async () => {
    const sem = new PrioritySemaphore(1)
    const release = await sem.acquire("user")
    release()
    release()
    expect(sem.status().active).toBe(0)
  })

  test("rejects an invalid limit", () => {
    expect(() => new PrioritySemaphore(0)).toThrow(RangeError)
  })
})
