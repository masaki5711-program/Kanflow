import { beforeEach, describe, expect, it, vi } from "vitest"

const m = vi.hoisted(() => ({
  runPurgeTrash: vi.fn(),
  instances: [] as Array<{ opts: { name: string; run: () => Promise<unknown> }; start: ReturnType<typeof vi.fn> }>,
}))

vi.mock("../jobs/purge-trash", () => ({ runPurgeTrash: m.runPurgeTrash }))
vi.mock("../scheduler", () => ({
  DailyScheduler: class {
    start = vi.fn()
    constructor(public opts: { name: string; run: () => Promise<unknown> }) {
      m.instances.push(this)
    }
    nextAt() {
      return new Date("2026-10-01T18:15:00Z")
    }
  },
}))

const { startPurgeTrashScheduler } = await import("../trash-daily")
const { describeConfig, loadWorkerConfig } = await import("../config")

const log = { info: vi.fn(), warn: vi.fn(), error: vi.fn() }

beforeEach(() => {
  vi.clearAllMocks()
  m.instances.length = 0
})

describe("worker config (trash purge)", () => {
  it("defaults to 03:15 daily and 30 days", () => {
    const cfg = loadWorkerConfig({} as NodeJS.ProcessEnv)
    expect(cfg.purgeTrashTimes).toEqual([{ hour: 3, minute: 15 }])
    expect(cfg.purgeTrashAfterDays).toBe(30)
    expect(describeConfig(cfg)).toMatchObject({ purgeTrashSchedule: "03:15", purgeTrashAfterDays: 30 })
  })

  it("reads PURGE_TRASH_SCHEDULE / PURGE_TRASH_AFTER_DAYS; invalid values fall back", () => {
    const off = loadWorkerConfig({ PURGE_TRASH_SCHEDULE: "off", PURGE_TRASH_AFTER_DAYS: "7" } as unknown as NodeJS.ProcessEnv)
    expect(off.purgeTrashTimes).toEqual([])
    expect(off.purgeTrashAfterDays).toBe(7)
    const bad = loadWorkerConfig({ PURGE_TRASH_SCHEDULE: "25:99", PURGE_TRASH_AFTER_DAYS: "0" } as unknown as NodeJS.ProcessEnv)
    expect(bad.purgeTrashTimes).toEqual([{ hour: 3, minute: 15 }])
    expect(bad.purgeTrashAfterDays).toBe(30)
  })
})

describe("startPurgeTrashScheduler", () => {
  it("returns null when disabled", () => {
    expect(startPurgeTrashScheduler({ purgeTrashTimes: [], purgeTrashAfterDays: 30 }, log)).toBeNull()
    expect(m.instances).toHaveLength(0)
  })

  it("schedules a daily run of the purge job with the retention and abort signal", async () => {
    const ctrl = new AbortController()
    m.runPurgeTrash.mockResolvedValue({ status: "done" })
    const s = startPurgeTrashScheduler({ purgeTrashTimes: [{ hour: 3, minute: 15 }], purgeTrashAfterDays: 14 }, log, ctrl.signal)
    expect(s).not.toBeNull()
    expect(m.instances).toHaveLength(1)
    expect(m.instances[0].opts.name).toBe("purge-trash")
    expect(m.instances[0].start).toHaveBeenCalled()
    await m.instances[0].opts.run()
    expect(m.runPurgeTrash).toHaveBeenCalledWith({ retentionDays: 14, signal: ctrl.signal, log })
  })
})
