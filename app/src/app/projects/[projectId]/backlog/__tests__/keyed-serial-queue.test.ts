import { describe, expect, it } from "vitest"
import { createKeyedSerialQueue, newestVersion } from "../keyed-serial-queue"

function deferred<T>() {
  let resolve!: (v: T) => void
  let reject!: (e: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

describe("createKeyedSerialQueue (N-03)", () => {
  it("runs tasks of one key in order and hands the next one the version the previous returned", async () => {
    const q = createKeyedSerialQueue()
    const first = deferred<{ version: number }>()
    const seen: (number | undefined)[] = []
    const a = q.run("pbi", (v) => (seen.push(v), first.promise))
    const b = q.run("pbi", async (v) => (seen.push(v), { version: 9 }))
    await Promise.resolve()
    expect(seen).toEqual([undefined])
    first.resolve({ version: 4 })
    await expect(a).resolves.toEqual({ version: 4 })
    await expect(b).resolves.toEqual({ version: 9 })
    expect(seen).toEqual([undefined, 4])
    // Later writes keep the newest known version.
    await q.run("pbi", async (v) => (seen.push(v), null))
    expect(seen).toEqual([undefined, 4, 9])
  })

  it("a failed task does not block the next one; other keys run independently", async () => {
    const q = createKeyedSerialQueue()
    const slow = deferred<never>()
    const failed = q.run("a", () => slow.promise)
    const other = q.run("b", async () => "b-done")
    await expect(other).resolves.toBe("b-done")
    const next = q.run("a", async (v) => `a-next ${String(v)}`)
    slow.reject(new Error("409"))
    await expect(failed).rejects.toThrow("409")
    await expect(next).resolves.toBe("a-next undefined")
  })
})

describe("newestVersion", () => {
  it("prefers the higher of the list row and our own last write", () => {
    expect(newestVersion(3, undefined)).toBe(3)
    expect(newestVersion(undefined, 5)).toBe(5)
    expect(newestVersion(3, 5)).toBe(5)
    expect(newestVersion(7, 5)).toBe(7)
    expect(newestVersion(undefined, undefined)).toBeUndefined()
  })
})
