import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/services/_shared/db", async () => (await import("@/services/__tests__/support")).dbMock())
vi.mock("@/services/_shared/translations", async () => (await import("@/services/__tests__/support")).translationMock())
vi.mock("../updates.repository")
vi.mock("@/services/notifications/notifications.repository")
vi.mock("@/services/notifications/notifications.service", async () => {
  const real = await vi.importActual<typeof import("@/services/notifications/notifications.service")>(
    "@/services/notifications/notifications.service",
  )
  return { ...real, enrichNotifications: vi.fn(async (items: unknown) => items) }
})
vi.mock("@/services/activity/activity.service", async () => {
  const real = await vi.importActual<typeof import("@/services/activity/activity.service")>("@/services/activity/activity.service")
  return {
    ...real,
    withEntityLabels: vi.fn(async (_projectId: string, items: unknown) => items),
    withMemberNames: vi.fn(async (items: unknown) => items),
    withEntityI18n: vi.fn(async (items: unknown) => items),
  }
})

const repo = await import("../updates.repository")
const notifRepo = await import("@/services/notifications/notifications.repository")
const notifSvc = await import("@/services/notifications/notifications.service")
const activitySvc = await import("@/services/activity/activity.service")
const svc = await import("../updates.service")
const { DEFAULT_DB, TX } = await import("@/services/__tests__/support")

const DAY_MS = 24 * 60 * 60 * 1000
const NOW = new Date("2026-10-02T00:00:00.000Z")
const WEEK_AGO = new Date(NOW.getTime() - 7 * DAY_MS)

const activityRow = (id: string, over: Record<string, unknown> = {}) => ({
  id,
  projectId: "p1",
  entityType: "sprint_task",
  entityId: "t1",
  action: "update",
  actorId: "u2",
  actorName: "Bob",
  diff: null,
  createdAt: NOW,
  actor: { id: "u2", name: "Bob" },
  ...over,
})

const notifRow = (id: string, over: Record<string, unknown> = {}) => ({
  id,
  type: "mentioned",
  projectId: "p1",
  entityType: "pbi",
  entityId: "b1",
  payload: JSON.stringify({ entityLabel: "X" }),
  readAt: null,
  createdAt: NOW,
  project: { id: "p1", name: "P" },
  ...over,
})

beforeEach(() => vi.clearAllMocks())

describe("baselineOf", () => {
  it("never-visited (null or undefined) → one week before now", () => {
    expect(svc.baselineOf(null, NOW)).toEqual(WEEK_AGO)
    expect(svc.baselineOf(undefined, NOW)).toEqual(WEEK_AGO)
  })

  it("keeps a given last-seen date as the baseline", () => {
    const seen = new Date("2026-09-01T00:00:00.000Z")
    expect(svc.baselineOf(seen, NOW)).toBe(seen)
  })
})

describe("getProjectUpdates", () => {
  it("first visit: baseline is one week ago; aggregates activity, notifications and counts", async () => {
    vi.mocked(repo.findVisit).mockResolvedValue(null)
    vi.mocked(repo.findNewActivity).mockResolvedValue([activityRow("a1"), activityRow("a2")] as never)
    vi.mocked(repo.countNewActivity).mockResolvedValue(5)
    vi.mocked(notifRepo.findNotifications).mockResolvedValue([notifRow("n1")] as never)
    vi.mocked(repo.countUnreadByProject).mockResolvedValue({ all: new Map([["p1", 3]]), mentions: new Map([["p1", 1]]) })

    const out = await svc.getProjectUpdates("u1", "p1", NOW)

    expect(repo.findVisit).toHaveBeenCalledWith(DEFAULT_DB, "u1", "p1")
    expect(repo.findNewActivity).toHaveBeenCalledWith(DEFAULT_DB, "u1", "p1", WEEK_AGO, 20)
    expect(repo.countNewActivity).toHaveBeenCalledWith(DEFAULT_DB, "u1", "p1", WEEK_AGO)
    expect(notifRepo.findNotifications).toHaveBeenCalledWith(DEFAULT_DB, "u1", { limit: 20, unreadOnly: true, projectId: "p1" })
    expect(repo.countUnreadByProject).toHaveBeenCalledWith(DEFAULT_DB, "u1", ["p1"])

    expect(out.firstVisit).toBe(true)
    expect(out.since).toBe(WEEK_AGO.toISOString())
    expect(out.newActivity).toBe(5)
    expect(out.unread).toBe(3)
    expect(out.mentions).toBe(1)
    expect(out.activity.map((a) => a.id)).toEqual(["a1", "a2"])
    expect(out.notifications.map((n) => n.id)).toEqual(["n1"])

    expect(activitySvc.withEntityLabels).toHaveBeenCalledWith("p1", expect.arrayContaining([expect.objectContaining({ id: "a1" })]))
    expect(activitySvc.withMemberNames).toHaveBeenCalled()
    expect(activitySvc.withEntityI18n).toHaveBeenCalled()
    expect(notifSvc.enrichNotifications).toHaveBeenCalled()
  })

  it("later visit: baseline is the stored lastSeenAt; missing counts default to 0", async () => {
    const seen = new Date("2026-09-20T00:00:00.000Z")
    vi.mocked(repo.findVisit).mockResolvedValue({ lastSeenAt: seen } as never)
    vi.mocked(repo.findNewActivity).mockResolvedValue([] as never)
    vi.mocked(repo.countNewActivity).mockResolvedValue(0)
    vi.mocked(notifRepo.findNotifications).mockResolvedValue([] as never)
    vi.mocked(repo.countUnreadByProject).mockResolvedValue({ all: new Map(), mentions: new Map() })

    const out = await svc.getProjectUpdates("u1", "p1", NOW)

    expect(repo.findNewActivity).toHaveBeenCalledWith(DEFAULT_DB, "u1", "p1", seen, 20)
    expect(out.firstVisit).toBe(false)
    expect(out.since).toBe(seen.toISOString())
    expect(out.unread).toBe(0)
    expect(out.mentions).toBe(0)
    expect(out.activity).toEqual([])
    expect(out.notifications).toEqual([])
  })

  it("slices the notification page to the list limit (one extra row is fetched for paging)", async () => {
    vi.mocked(repo.findVisit).mockResolvedValue(null)
    vi.mocked(repo.findNewActivity).mockResolvedValue([] as never)
    vi.mocked(repo.countNewActivity).mockResolvedValue(0)
    const rows = Array.from({ length: 21 }, (_, i) => notifRow(`n${i}`))
    vi.mocked(notifRepo.findNotifications).mockResolvedValue(rows as never)
    vi.mocked(repo.countUnreadByProject).mockResolvedValue({ all: new Map(), mentions: new Map() })

    const out = await svc.getProjectUpdates("u1", "p1", NOW)

    expect(out.notifications).toHaveLength(20)
    expect(out.notifications[19].id).toBe("n19")
  })
})

describe("getUpdateSummaries", () => {
  it("empty ids → empty map, no queries", async () => {
    const out = await svc.getUpdateSummaries("u1", [], NOW)
    expect(out).toEqual(new Map())
    expect(repo.findVisits).not.toHaveBeenCalled()
    expect(repo.countNewActivityByProject).not.toHaveBeenCalled()
    expect(repo.countUnreadByProject).not.toHaveBeenCalled()
  })

  it("passes each project's own baseline to countNewActivityByProject and defaults missing counts to 0", async () => {
    const seenP1 = new Date("2026-09-01T00:00:00.000Z")
    vi.mocked(repo.findVisits).mockResolvedValue([{ projectId: "p1", lastSeenAt: seenP1 }] as never)
    vi.mocked(repo.countNewActivityByProject).mockResolvedValue(new Map([["p1", 4]]))
    vi.mocked(repo.countUnreadByProject).mockResolvedValue({ all: new Map([["p1", 2]]), mentions: new Map() })

    const out = await svc.getUpdateSummaries("u1", ["p1", "p2"], NOW)

    expect(repo.findVisits).toHaveBeenCalledWith(DEFAULT_DB, "u1", ["p1", "p2"])
    const baselinesArg = vi.mocked(repo.countNewActivityByProject).mock.calls[0][2] as Map<string, Date>
    expect(baselinesArg.get("p1")).toEqual(seenP1)
    expect(baselinesArg.get("p2")).toEqual(WEEK_AGO)
    expect(repo.countUnreadByProject).toHaveBeenCalledWith(DEFAULT_DB, "u1", ["p1", "p2"])

    expect(out.get("p1")).toEqual({ newActivity: 4, unread: 2, mentions: 0 })
    expect(out.get("p2")).toEqual({ newActivity: 0, unread: 0, mentions: 0 })
  })
})

describe("getProjectUpdateSummary", () => {
  it("defaults to all-zero counts when the project has nothing", async () => {
    vi.mocked(repo.findVisits).mockResolvedValue([] as never)
    vi.mocked(repo.countNewActivityByProject).mockResolvedValue(new Map())
    vi.mocked(repo.countUnreadByProject).mockResolvedValue({ all: new Map(), mentions: new Map() })

    expect(await svc.getProjectUpdateSummary("u1", "p1", NOW)).toEqual({ newActivity: 0, unread: 0, mentions: 0 })
  })

  it("returns the single project's summary", async () => {
    vi.mocked(repo.findVisits).mockResolvedValue([] as never)
    vi.mocked(repo.countNewActivityByProject).mockResolvedValue(new Map([["p1", 2]]))
    vi.mocked(repo.countUnreadByProject).mockResolvedValue({ all: new Map([["p1", 9]]), mentions: new Map([["p1", 4]]) })

    expect(await svc.getProjectUpdateSummary("u1", "p1", NOW)).toEqual({ newActivity: 2, unread: 9, mentions: 4 })
  })
})

describe("markProjectSeen", () => {
  it("upserts the visit and marks the project's notifications read inside one transaction", async () => {
    const out = await svc.markProjectSeen("u1", "p1", NOW)

    expect(repo.upsertVisit).toHaveBeenCalledWith(TX, "u1", "p1", NOW)
    expect(repo.markProjectNotificationsRead).toHaveBeenCalledWith(TX, "u1", "p1", NOW)
    expect(out).toEqual({ seenAt: NOW.toISOString() })
  })
})
