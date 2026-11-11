import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { createAutosave, PermanentSaveError, type SaveStatus } from "../autosave"

/** A fake document: `dirty` is what hasChanges answers; `save` clears it unless told to fail. */
function setup(options: { debounceMs?: number; retryDelaysMs?: number[] } = {}) {
  const statuses: SaveStatus[] = []
  const world = { dirty: false, fail: null as unknown, saves: 0, hold: null as null | (() => void) }
  const autosave = createAutosave({
    debounceMs: options.debounceMs ?? 300,
    retryDelaysMs: options.retryDelaysMs ?? [1000, 2000],
    hasChanges: () => world.dirty,
    onStatus: (status) => statuses.push(status),
    save: async () => {
      world.saves += 1
      if (world.hold === null && world.fail === null) {
        world.dirty = false
        return
      }
      if (world.fail !== null) throw world.fail
      await new Promise<void>((resolve) => {
        world.hold = resolve
      })
      world.dirty = false
    },
  })
  const change = () => {
    world.dirty = true
    autosave.changed()
  }
  return { autosave, statuses, world, change }
}

describe("autosave", () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it("saves once after the changes stop (debounce)", async () => {
    const { change, statuses, world } = setup()
    change()
    await vi.advanceTimersByTimeAsync(200)
    change()
    await vi.advanceTimersByTimeAsync(200)
    expect(world.saves).toBe(0)
    await vi.advanceTimersByTimeAsync(100)
    expect(world.saves).toBe(1)
    expect(statuses).toEqual(["pending", "pending", "saving", "saved"])
  })

  it("shows a failed save and tries again with growing waits; nothing is dropped", async () => {
    const { change, statuses, world, autosave } = setup()
    world.fail = new Error("network")
    change()
    await vi.advanceTimersByTimeAsync(300)
    expect(autosave.status()).toBe("failed")
    expect(world.dirty).toBe(true)

    await vi.advanceTimersByTimeAsync(999)
    expect(world.saves).toBe(1)
    await vi.advanceTimersByTimeAsync(1)
    expect(world.saves).toBe(2)
    await vi.advanceTimersByTimeAsync(2000)
    expect(world.saves).toBe(3)

    world.fail = null
    await vi.advanceTimersByTimeAsync(2000)
    expect(world.saves).toBe(4)
    expect(world.dirty).toBe(false)
    expect(statuses[statuses.length - 1]).toBe("saved")
    expect(statuses).toContain("failed")
  })

  it("stays failed while the user keeps editing; the new change waits for the retry (no request per edit during an outage)", async () => {
    const { change, world, autosave } = setup()
    world.fail = new Error("network")
    change()
    await vi.advanceTimersByTimeAsync(300)
    expect(autosave.status()).toBe("failed")
    world.fail = null
    change()
    change()
    expect(autosave.status()).toBe("failed")
    await vi.advanceTimersByTimeAsync(300)
    // The edits did not cut the 1 s retry wait short…
    expect(world.saves).toBe(1)
    expect(autosave.status()).toBe("failed")
    // …and the retry sends them.
    await vi.advanceTimersByTimeAsync(700)
    expect(world.saves).toBe(2)
    expect(autosave.status()).toBe("saved")
  })

  it("does not retry by itself what the server refused, but the next change or flush tries again", async () => {
    const { change, world, autosave } = setup()
    world.fail = new PermanentSaveError("sheet full")
    change()
    await vi.advanceTimersByTimeAsync(300)
    expect(autosave.status()).toBe("failed")
    await vi.advanceTimersByTimeAsync(60_000)
    expect(world.saves).toBe(1)

    world.fail = null
    await expect(autosave.flush()).resolves.toBe(true)
    expect(world.saves).toBe(2)
    expect(autosave.status()).toBe("saved")
  })

  it("sends one request at a time and saves again when the document changed meanwhile", async () => {
    const { change, world, autosave } = setup()
    world.hold = () => {}
    change()
    await vi.advanceTimersByTimeAsync(300)
    expect(autosave.status()).toBe("saving")
    const release = world.hold
    world.hold = null

    change()
    await vi.advanceTimersByTimeAsync(1000)
    expect(world.saves).toBe(1)

    release()
    await vi.advanceTimersByTimeAsync(0)
    // The held request "saved" the first change; pretend the second one is still unsaved.
    world.dirty = true
    autosave.changed()
    await vi.advanceTimersByTimeAsync(300)
    expect(world.saves).toBe(2)
    expect(autosave.status()).toBe("saved")
  })

  it("flush saves now and reports whether everything is saved", async () => {
    const { change, world, autosave } = setup()
    change()
    await expect(autosave.flush()).resolves.toBe(true)
    expect(world.saves).toBe(1)
    await vi.advanceTimersByTimeAsync(1000)
    expect(world.saves).toBe(1)

    world.fail = new Error("network")
    change()
    await expect(autosave.flush()).resolves.toBe(false)
    expect(autosave.status()).toBe("failed")
  })

  it("flush with nothing to save is true and sends nothing", async () => {
    const { world, autosave } = setup()
    await expect(autosave.flush()).resolves.toBe(true)
    expect(world.saves).toBe(0)
  })

  it("does nothing after dispose", async () => {
    const { change, world, autosave, statuses } = setup()
    change()
    autosave.dispose()
    await vi.advanceTimersByTimeAsync(5000)
    expect(world.saves).toBe(0)
    change()
    expect(statuses).toEqual(["pending"])
  })
})
