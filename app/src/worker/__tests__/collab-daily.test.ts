import { beforeEach, describe, expect, it, vi } from "vitest"

const m = vi.hoisted(() => ({
  purge: vi.fn(),
  notifyDue: vi.fn(),
  chatPurge: vi.fn(),
  improvement: vi.fn(),
  feedback: vi.fn(),
  instances: [] as Array<{ opts: { name: string; run: () => Promise<unknown> }; start: ReturnType<typeof vi.fn> }>,
}))

vi.mock("../jobs/activity-retention", () => ({ purgeCollaborationHistory: m.purge }))
vi.mock("../jobs/notify-due", () => ({ runNotifyDue: m.notifyDue }))
vi.mock("../jobs/chat-retention", () => ({ purgeChatHistory: m.chatPurge }))
vi.mock("../jobs/improvement-checks", () => ({ runImprovementCheckReminders: m.improvement }))
vi.mock("@/services/feedback/feedback.recurrence.service", () => ({ runFeedbackRecurrence: m.feedback }))
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

const RECURRENCE = { candidates: 1, proposed: 1, alreadyProposed: 0, retired: 0, skippedNoProject: 0, skippedNoPo: 0, failed: 0 }

beforeEach(() => {
  vi.clearAllMocks()
  m.instances.length = 0
  m.feedback.mockResolvedValue(RECURRENCE)
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
    m.chatPurge.mockRejectedValue(new Error("chat"))
    m.improvement.mockRejectedValue(new Error("kaizen"))
    const out2 = await runCollabDaily(CFG, log)
    expect(out2).toEqual({ retention: null, notifyDue: null, chatRetention: null, improvementReminders: null, feedbackRecurrence: RECURRENCE })
    expect(log.error).toHaveBeenCalledWith("improvement check reminders failed", { error: "kaizen" })
    expect(log.error).toHaveBeenCalledWith("chat / ai job retention failed", { error: "chat" })
    expect(out.retention).toBeNull()
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

describe("chat + AI job retention step", () => {
  it("runs with the configured days (defaults 180 / 30 / 30)", async () => {
    m.purge.mockResolvedValue({ activity: { days: 1, deleted: 0 }, notifications: { days: 1, deleted: 0 } })
    m.notifyDue.mockResolvedValue({ status: "done", candidates: { tasks: 0, planItems: 0 }, notified: 0 })
    m.chatPurge.mockResolvedValue({ chatIdle: { days: 180, deleted: 1 }, chatDeleted: { days: 30, deleted: 2 }, aiJobs: { days: 30, deleted: 3 } })
    const out = await runCollabDaily(CFG, log)
    expect(m.chatPurge).toHaveBeenCalledWith({ idleDays: 180, deletedDays: 30, aiJobDays: 30 })
    expect(out.chatRetention?.chatDeleted.deleted).toBe(2)
    await runCollabDaily({ ...CFG, chatRetentionDays: 90, chatDeletedRetentionDays: 7, aiJobRetentionDays: 14 }, log)
    expect(m.chatPurge).toHaveBeenLastCalledWith({ idleDays: 90, deletedDays: 7, aiJobDays: 14 })
  })

  it("worker config reads the retention env", () => {
    const cfg = loadWorkerConfig({ CHAT_RETENTION_DAYS: "365", CHAT_DELETED_RETENTION_DAYS: "x", AI_JOB_RETENTION_DAYS: "10" } as unknown as NodeJS.ProcessEnv)
    expect(cfg).toMatchObject({ chatRetentionDays: 365, chatDeletedRetentionDays: 30, aiJobRetentionDays: 10 })
    expect(describeConfig(cfg)).toMatchObject({ chatRetentionDays: 365, aiJobRetentionDays: 10 })
  })
})

describe("改善成果ボード 定着確認 reminder step", () => {
  it("runs by default and is skipped with improvementReminders: false", async () => {
    m.improvement.mockResolvedValue({ status: "done", due: 2, notified: 2, stamped: 2 })
    const out = await runCollabDaily(CFG, log)
    expect(m.improvement).toHaveBeenCalledWith({ signal: undefined })
    expect(out.improvementReminders).toEqual({ status: "done", due: 2, notified: 2, stamped: 2 })
    m.improvement.mockClear()
    const off = await runCollabDaily({ ...CFG, improvementReminders: false }, log)
    expect(m.improvement).not.toHaveBeenCalled()
    expect(off.improvementReminders).toBeNull()
  })

  it("worker config: IMPROVEMENT_CHECK_REMINDERS=off disables, default on", () => {
    expect(loadWorkerConfig({} as NodeJS.ProcessEnv).improvementReminders).toBe(true)
    const off = loadWorkerConfig({ IMPROVEMENT_CHECK_REMINDERS: "off" } as unknown as NodeJS.ProcessEnv)
    expect(off.improvementReminders).toBe(false)
    expect(describeConfig(off)).toMatchObject({ improvementReminders: false })
  })
})

describe("feedback loop recurrence step (prevention-PBI proposals)", () => {
  it("runs by default, once per daily run, and is skipped with feedbackRecurrence: false", async () => {
    const out = await runCollabDaily(CFG, log)
    expect(m.feedback).toHaveBeenCalledWith({ signal: undefined })
    expect(out.feedbackRecurrence).toEqual(RECURRENCE)
    m.feedback.mockClear()
    const off = await runCollabDaily({ ...CFG, feedbackRecurrence: false }, log)
    expect(m.feedback).not.toHaveBeenCalled()
    expect(off.feedbackRecurrence).toBeNull()
  })

  it("a failing step is logged and does not fail the daily run", async () => {
    m.feedback.mockRejectedValue(new Error("db down"))
    const out = await runCollabDaily(CFG, log)
    expect(out.feedbackRecurrence).toBeNull()
    expect(log.error).toHaveBeenCalledWith("feedback recurrence failed", { error: "db down" })
  })

  it("worker config: FEEDBACK_RECURRENCE=off disables, default on", () => {
    expect(loadWorkerConfig({} as NodeJS.ProcessEnv).feedbackRecurrence).toBe(true)
    const off = loadWorkerConfig({ FEEDBACK_RECURRENCE: "off" } as unknown as NodeJS.ProcessEnv)
    expect(off.feedbackRecurrence).toBe(false)
    expect(describeConfig(off)).toMatchObject({ feedbackRecurrence: false })
  })
})
