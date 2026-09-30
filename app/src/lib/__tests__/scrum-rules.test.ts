import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/lib/prisma", () => ({ prisma: {} }))

const { derivePbiStatusChange, syncPbiStatusFromTasks, isRealTask } = await import("@/lib/pbi-status-sync")
const { computeSprintActualScore, recalcSprintActualScore } = await import("@/lib/sprint-score")
const { computePlanProgressUpdates, recalcPlanProgress, statusToProgress } = await import("@/lib/plan-progress")

const NOW = new Date("2026-09-01T00:00:00Z")
const task = (taskName: string | null, status: string) => ({ taskName, status })

describe("derivePbiStatusChange", () => {
  it("ignores placeholders and PBIs without real tasks", () => {
    expect(isRealTask({ taskName: "  " })).toBe(false)
    expect(derivePbiStatusChange("ready", [task(null, "done")], NOW)).toBeNull()
  })

  it("completes a PBI when every real task is done", () => {
    expect(derivePbiStatusChange("ready", [task("a", "done"), task(null, "todo")], NOW)).toEqual({
      status: "completed",
      completedAt: NOW,
    })
  })

  it("reverts a completed PBI when a task re-opens", () => {
    expect(derivePbiStatusChange("completed", [task("a", "done"), task("b", "in_progress")])).toEqual({
      status: "ready",
      completedAt: null,
    })
  })

  it("leaves mixed and already-consistent states alone", () => {
    expect(derivePbiStatusChange("ready", [task("a", "done"), task("b", "todo")])).toBeNull()
    expect(derivePbiStatusChange("completed", [task("a", "done")])).toBeNull()
  })
})

describe("syncPbiStatusFromTasks", () => {
  const db = {
    productBacklogItem: { findUnique: vi.fn(), update: vi.fn() },
    sprintBacklogItem: { findMany: vi.fn() },
  }
  beforeEach(() => vi.clearAllMocks())

  it("does nothing for a missing or trashed PBI", async () => {
    db.productBacklogItem.findUnique.mockResolvedValue(null)
    await syncPbiStatusFromTasks("pb1", db as never)
    expect(db.sprintBacklogItem.findMany).not.toHaveBeenCalled()
    expect(db.productBacklogItem.findUnique.mock.calls[0][0].where).toEqual({ id: "pb1", deletedAt: null })
  })

  it("writes the derived change on the given client", async () => {
    db.productBacklogItem.findUnique.mockResolvedValue({ id: "pb1", status: "ready" })
    db.sprintBacklogItem.findMany.mockResolvedValue([task("a", "done")])
    await syncPbiStatusFromTasks("pb1", db as never)
    expect(db.productBacklogItem.update).toHaveBeenCalledWith({
      where: { id: "pb1" },
      data: expect.objectContaining({ status: "completed" }),
    })
  })

  it("bumps the PBI version with an automatic status change (open editors get a 409, not a silent revert)", async () => {
    db.productBacklogItem.findUnique.mockResolvedValue({ id: "pb1", status: "ready" })
    db.sprintBacklogItem.findMany.mockResolvedValue([task("a", "done")])
    await syncPbiStatusFromTasks("pb1", db as never)
    expect(db.productBacklogItem.update).toHaveBeenCalledWith({
      where: { id: "pb1" },
      data: expect.objectContaining({ version: { increment: 1 } }),
    })
  })

  it("skips the write when nothing changes", async () => {
    db.productBacklogItem.findUnique.mockResolvedValue({ id: "pb1", status: "ready" })
    db.sprintBacklogItem.findMany.mockResolvedValue([task("a", "todo")])
    await syncPbiStatusFromTasks("pb1", db as never)
    expect(db.productBacklogItem.update).not.toHaveBeenCalled()
  })
})

describe("sprint score", () => {
  const item = (pb: string, score: number | null, taskName: string | null, status: string) => ({
    status,
    taskName,
    pbItem: { id: pb, workloadScore: score },
  })

  it("sums only PBIs whose real tasks are all done", () => {
    const items = [
      item("p1", 3, "a", "done"),
      item("p1", 3, "b", "done"),
      item("p2", 5, "c", "done"),
      item("p2", 5, "d", "todo"),
      item("p3", 8, null, "todo"),
      item("p4", null, "e", "done"),
    ]
    expect(computeSprintActualScore(items)).toBe(3)
    expect(computeSprintActualScore([])).toBe(0)
  })

  it("stores the recalculated score", async () => {
    const db = {
      sprintBacklogItem: { findMany: vi.fn().mockResolvedValue([item("p1", 2, "a", "done")]) },
      sprint: { update: vi.fn() },
    }
    await expect(recalcSprintActualScore("s1", db as never)).resolves.toBe(2)
    expect(db.sprint.update).toHaveBeenCalledWith({ where: { id: "s1" }, data: { actualScore: 2 } })
  })

  it("ignores tasks of PBIs in the trash", async () => {
    const db = {
      sprintBacklogItem: { findMany: vi.fn().mockResolvedValue([]) },
      sprint: { update: vi.fn() },
    }
    await recalcSprintActualScore("s1", db as never)
    expect(db.sprintBacklogItem.findMany.mock.calls[0][0].where).toEqual({ sprintId: "s1", pbItem: { deletedAt: null } })
  })
})

describe("plan progress", () => {
  const node = (id: string, parentId: string | null, status: string, progressPct: number) => ({
    id,
    parentId,
    status,
    progressPct,
  })

  it("maps status to progress", () => {
    expect([statusToProgress("done"), statusToProgress("delayed"), statusToProgress("on_hold"), statusToProgress("?")])
      .toEqual([100, 50, 0, 0])
  })

  it("recomputes a leaf and its ancestors deepest-first", () => {
    const nodes = [
      node("root", null, "not_started", 0),
      node("mid", "root", "not_started", 0),
      node("leafA", "mid", "done", 0),
      node("leafB", "mid", "not_started", 0),
      node("other", "root", "done", 100),
    ]
    const updates = computePlanProgressUpdates(nodes, ["leafA", "root"])
    expect(updates).toEqual([
      { id: "leafA", progressPct: 100 },
      { id: "mid", progressPct: 50 },
      { id: "root", progressPct: 75 },
    ])
  })

  it("ignores unknown start ids and returns nothing when up to date", () => {
    expect(computePlanProgressUpdates([node("a", null, "done", 100)], ["a", "missing"])).toEqual([])
  })

  it("persists only changed rows with one tree read", async () => {
    const db = {
      planItem: {
        findMany: vi.fn().mockResolvedValue([node("p", null, "x", 0), node("c", "p", "done", 100)]),
        update: vi.fn(),
      },
    }
    await recalcPlanProgress("proj", ["c"], db as never)
    expect(db.planItem.findMany).toHaveBeenCalledTimes(1)
    expect(db.planItem.update).toHaveBeenCalledWith({ where: { id: "p" }, data: { progressPct: 100 } })
    await recalcPlanProgress("proj", [], db as never)
    expect(db.planItem.findMany).toHaveBeenCalledTimes(1)
  })
})
