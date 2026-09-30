import { describe, expect, it, vi } from "vitest"

vi.mock("@/lib/prisma", () => ({ prisma: {} }))

const repo = await import("../projects.repository")

const rows = (...ids: string[]) => vi.fn().mockResolvedValue(ids.map((id) => ({ id })))

describe("collectProjectTranslationTree", () => {
  it("collects the ids of every translatable child of the project", async () => {
    const db = {
      productGoal: { findMany: rows("g1") },
      iceboxItem: { findMany: rows("i1", "i2") },
      productBacklogItem: { findMany: rows("b1") },
      sprint: { findMany: rows("s1") },
      sprintBacklogItem: { findMany: rows("t1") },
      dailyScrumNote: { findMany: rows("n1") },
      releaseBacklogItem: { findMany: rows() },
      calendarEvent: { findMany: rows("e1") },
      planItem: { findMany: rows("pl1") },
    }
    const tree = await repo.collectProjectTranslationTree(db as never, "p1")
    expect(tree).toEqual({
      project: ["p1"],
      product_goal: ["g1"],
      icebox_item: ["i1", "i2"],
      backlog_item: ["b1"],
      sprint: ["s1"],
      sprint_task: ["t1"],
      daily_scrum_note: ["n1"],
      release_item: [],
      calendar_event: ["e1"],
      plan_item: ["pl1"],
    })
    expect(db.sprintBacklogItem.findMany).toHaveBeenCalledWith({ where: { sprint: { projectId: "p1" } }, select: { id: true } })
    expect(db.productGoal.findMany).toHaveBeenCalledWith({ where: { projectId: "p1" }, select: { id: true } })
  })
})
