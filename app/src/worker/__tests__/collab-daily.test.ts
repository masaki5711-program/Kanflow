import { beforeEach, describe, expect, it, vi } from "vitest"

const m = vi.hoisted(() => ({
  purge: vi.fn(),
  notifyDue: vi.fn(),
  instances: [] as Array<{ opts: { name: string; run: () => Promise<unknown> }; start: ReturnType<typeof vi.fn> }>,
}))

vi.mock("../jobs/activity-retention", () => ({ purgeCollaborationHistory: m.purge }))
vi.mock("../jobs/notify-due", () => ({ runNotifyDue: m.notifyDue }))
vi.mock("../scheduler", () => ({
  DailyScheduler: class {
    start = vi.fn()
    constructor(public opts: { name: string; run: () => Promise<unknown> }) {
      m.instances.push(this)
    }
    nextAt() {
      return new Date("2026-10-01T22:45:00Z")
    }
  },
}))

const { runCollabDaily, startCollabScheduler } = await import("../collab-daily")
const { describeConfig, loadWorkerConfig, parseSchedule } = await import("../config")

const log = { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
const CFG = { notifyDueTimes: [{ hour: 7, minute: 45 }], notifyDueSoonDays: 3, activityRetentionDays: 730, notificationRetentionDays: 90 }

beforeEach(() => {
  vi.clearAllMocks()
  m.instances.length = 0
})

describe("worker config (collab)", () => {
  it("defaults", () => {
    const cfg = loadWorkerConfig({} as NodeJS.ProcessEnv)
    expect(cfg.notifyDueTimes).toEqual([{ hour: 7, minute: 45 }])
    expect(cfg.notifyDueSoonDays).toBe(2)
    expect(cfg.activityRetentionDays).toBe(730)
    expect(cfg.notificationRetentionDays).toBe(90)
    expect(describeConfig(cfg)).toMatchObject({ notifyDueSchedule: "07:45", notifyDueSoonDays: 2 })
  })

  it("reads the env; invalid values fall back", () => {
    const cfg = loadWorkerConfig({
      NOTIFY_DUE_SCHEDULE: "off",
      NOTIFY_DUE_SOON_DAYS: "5",
      ACTIVITY_RETENTION_DAYS: "-1",
      NOTIFICATION_RETENTION_DAYS: "30",
    } as unknown as NodeJS.ProcessEnv)
    expect(cfg.notifyDueTimes).toEqual([])
    expect(cfg.notifyDueSoonDays).toBe(5)
    expect(cfg.activityRetentionDays).toBe(730)
    expect(cfg.notificationRetentionDays).toBe(30)
  })

  it("parseSchedule falls back to the given default", () => {
    expect(parseSchedule("bad", "07:45")).toEqual([{ hour: 7, minute: 45 }])
    expect(parseSchedule(undefined, "09:00")).toEqual([{ hour: 9, minute: 0 }])
  })
})

describe("runCollabDaily", () => {
  it("runs retention then due notifications with the configured values", async () => {
    m.purge.mockResolvedValue({ activity: { days: 730, deleted: 1 }, notifications: { days: 90, deleted: 2 } })
    m.notifyDue.mockResolvedValue({ status: "done", candidates: { tasks: 0, planItems: 0 }, notified: 0 })
    const out = await runCollabDaily(CFG, log)
    expect(m.purge).toHaveBeenCalledWith({ activityDays: 730, notificationDays: 90 })
    expect(m.notifyDue).toHaveBeenCalledWith({ soonDays: 3, signal: undefined })
    expect(out.retention?.activity.deleted).toBe(1)
    expect(out.notifyDue?.status).toBe("done")
  })

  it("a failing step is logged and does not stop the other", async () => {
    m.purge.mockRejectedValue(new Error("lock wait"))
    m.notifyDue.mockRejectedValue(new Error("db"))
    const out = await runCollabDaily(CFG, log)
    expect(out).toEqual({ retention: null, notifyDue: null })
    expect(m.notifyDue).toHaveBeenCalled()
    expect(log.error).toHaveBeenCalledWith("collab retention sweep failed", { error: "lock wait" })
    expect(log.error).toHaveBeenCalledWith("due-date notifications failed", { error: "db" })
  })
})

describe("startCollabScheduler", () => {
  it("is disabled without times", () => {
    expect(startCollabScheduler({ ...CFG, notifyDueTimes: [] }, log)).toBeNull()
    expect(m.instances).toHaveLength(0)
  })

  it("starts a daily scheduler that runs the job", async () => {
    m.purge.mockResolvedValue({ activity: { days: 1, deleted: 0 }, notifications: { days: 1, deleted: 0 } })
    m.notifyDue.mockResolvedValue({ status: "done", candidates: { tasks: 0, planItems: 0 }, notified: 0 })
    const s = startCollabScheduler(CFG, log)
    expect(s).not.toBeNull()
    expect(m.instances[0].opts.name).toBe("collab-daily")
    expect(m.instances[0].start).toHaveBeenCalled()
    await m.instances[0].opts.run()
    expect(m.notifyDue).toHaveBeenCalled()
  })
})
