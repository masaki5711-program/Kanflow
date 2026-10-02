import { describe, expect, it } from "vitest"
import { fakeDb } from "@/services/__tests__/fake-db"
import { NEWEST_FIRST } from "@/services/_shared/cursor"
import * as repo from "../updates.repository"

const SINCE = new Date("2026-09-20T00:00:00.000Z")
const byOthers = (userId: string) => ({ OR: [{ actorId: null }, { actorId: { not: userId } }] })

describe("updates.repository", () => {
  it("findVisit / findVisits / upsertVisit", async () => {
    const db = fakeDb()
    await repo.findVisit(db.client, "u1", "p1")
    expect(db.fn("projectVisit.findUnique")).toHaveBeenCalledWith({
      where: { userId_projectId: { userId: "u1", projectId: "p1" } },
      select: { lastSeenAt: true },
    })

    await repo.findVisits(db.client, "u1", ["p1", "p2"])
    expect(db.fn("projectVisit.findMany")).toHaveBeenCalledWith({
      where: { userId: "u1", projectId: { in: ["p1", "p2"] } },
      select: { projectId: true, lastSeenAt: true },
    })

    await repo.upsertVisit(db.client, "u1", "p1", SINCE)
    expect(db.fn("projectVisit.upsert")).toHaveBeenCalledWith({
      where: { userId_projectId: { userId: "u1", projectId: "p1" } },
      create: { userId: "u1", projectId: "p1", lastSeenAt: SINCE },
      update: { lastSeenAt: SINCE },
    })
  })

  it("findNewActivity / countNewActivity: by others, after the baseline, newest first", async () => {
    const db = fakeDb()
    await repo.findNewActivity(db.client, "u1", "p1", SINCE, 20)
    const args = db.fn("activityLog.findMany").mock.calls[0][0]
    expect(args.where).toEqual({ projectId: "p1", createdAt: { gt: SINCE }, ...byOthers("u1") })
    expect(args.orderBy).toEqual(NEWEST_FIRST)
    expect(args.take).toBe(20)

    await repo.countNewActivity(db.client, "u1", "p1", SINCE)
    expect(db.fn("activityLog.count")).toHaveBeenCalledWith({
      where: { projectId: "p1", createdAt: { gt: SINCE }, ...byOthers("u1") },
    })
  })

  it("countNewActivityByProject: empty baselines short-circuit; otherwise one grouped query per baseline", async () => {
    const empty = fakeDb()
    expect(await repo.countNewActivityByProject(empty.client, "u1", new Map())).toEqual(new Map())
    expect(empty.fn("activityLog.groupBy")).not.toHaveBeenCalled()

    const db = fakeDb({ "activityLog.groupBy": [{ projectId: "p1", _count: { _all: 3 } }] })
    const baselines = new Map([
      ["p1", SINCE],
      ["p2", SINCE],
    ])
    const out = await repo.countNewActivityByProject(db.client, "u1", baselines)
    expect(out).toEqual(new Map([["p1", 3]]))

    const args = db.fn("activityLog.groupBy").mock.calls[0][0]
    expect(args.by).toEqual(["projectId"])
    expect(args.where).toEqual({
      AND: [byOthers("u1"), { OR: [{ projectId: "p1", createdAt: { gt: SINCE } }, { projectId: "p2", createdAt: { gt: SINCE } }] }],
    })
    expect(args._count).toEqual({ _all: true })
  })

  it("countUnreadByProject: empty projectIds short-circuit; otherwise all + mentions, filters out a null projectId", async () => {
    const empty = fakeDb()
    expect(await repo.countUnreadByProject(empty.client, "u1", [])).toEqual({ all: new Map(), mentions: new Map() })
    expect(empty.fn("notification.groupBy")).not.toHaveBeenCalled()

    const db = fakeDb()
    db.fn("notification.groupBy")
      .mockResolvedValueOnce([
        { projectId: "p1", _count: { _all: 5 } },
        { projectId: null, _count: { _all: 1 } },
      ])
      .mockResolvedValueOnce([{ projectId: "p1", _count: { _all: 2 } }])

    const out = await repo.countUnreadByProject(db.client, "u1", ["p1"])
    expect(out.all).toEqual(new Map([["p1", 5]]))
    expect(out.mentions).toEqual(new Map([["p1", 2]]))

    const [allArgs, mentionArgs] = db.fn("notification.groupBy").mock.calls
    expect(allArgs[0].where).toEqual({ recipientId: "u1", readAt: null, projectId: { in: ["p1"] } })
    expect(mentionArgs[0].where).toEqual({ recipientId: "u1", readAt: null, projectId: { in: ["p1"] }, type: "mentioned" })
  })

  it("markProjectNotificationsRead is scoped to the recipient and project", async () => {
    const db = fakeDb()
    await repo.markProjectNotificationsRead(db.client, "u1", "p1", SINCE)
    expect(db.fn("notification.updateMany")).toHaveBeenCalledWith({
      where: { recipientId: "u1", projectId: "p1", readAt: null },
      data: { readAt: SINCE },
    })
  })
})
