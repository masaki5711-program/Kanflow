import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/services/_shared/db", async () => (await import("@/services/__tests__/support")).dbMock())
vi.mock("@/services/_shared/translations", async () => (await import("@/services/__tests__/support")).translationMock())
vi.mock("@/lib/pbi-status-sync", () => ({ syncPbiStatusFromTasks: vi.fn(async () => undefined) }))
vi.mock("@/lib/sprint-score", () => ({ recalcSprintActualScore: vi.fn(async () => 0) }))
vi.mock("../sprints.repository")

const repo = await import("../sprints.repository")
const tr = await import("@/services/_shared/translations")
const { syncPbiStatusFromTasks } = await import("@/lib/pbi-status-sync")
const { recalcSprintActualScore } = await import("@/lib/sprint-score")
const { TX: TX_MOCK } = await import("@/services/__tests__/support")
const TX = TX_MOCK as never
const carry = await import("../sprints.carry-over")

let seq = 0
const item = (pbItemId: string, taskName: string | null, status: string, extra: Record<string, unknown> = {}) => ({
  id: `r${++seq}`, pbItemId, taskName, status, assignee: null, estimatedHours: null, assignees: [], carriedCopies: [], ...extra,
})

describe("planCarryOver", () => {
  beforeEach(() => vi.clearAllMocks())

  it("plans copies of the open tasks of the requested PBIs only, plus the bare membership of a PBI without tasks", async () => {
    vi.mocked(repo.findCarryOverSource).mockResolvedValue({
      id: "s0", status: "archived",
      items: [
        item("b1", "design", "done"),
        item("b1", "build", "in_progress", { id: "build", assignee: "Ann", estimatedHours: 4, assignees: [{ userId: "u1" }] }),
        item("b2", null, "todo", { id: "bare" }),
        item("b3", "other", "todo"),
        item("b4", "finished", "done"),
      ],
    } as never)
    const plan = await carry.planCarryOver(TX, "p1", { fromSprintId: "s0", pbItemIds: ["b1", "b2", "b4"] })
    expect(plan.pbIds).toEqual(["b1", "b2"])
    expect(plan.tasks).toEqual([
      { sourceId: "build", pbItemId: "b1", taskName: "build", assignee: "Ann", estimatedHours: 4, assigneeIds: ["u1"] },
      { sourceId: "bare", pbItemId: "b2", taskName: null, assignee: null, estimatedHours: null, assigneeIds: [] },
    ])
  })

  it("leaves out work an earlier carry-over already took", async () => {
    vi.mocked(repo.findCarryOverSource).mockResolvedValue({
      id: "s0", status: "archived",
      items: [item("b1", "build", "todo", { carriedCopies: [{ id: "copy" }] }), item("b2", "test", "todo")],
    } as never)
    const plan = await carry.planCarryOver(TX, "p1", { fromSprintId: "s0", pbItemIds: ["b1", "b2"] })
    expect(plan.pbIds).toEqual(["b2"])
  })

  it("404s for a sprint of another project and 409s while the sprint is still open", async () => {
    vi.mocked(repo.findCarryOverSource).mockResolvedValueOnce(null)
    await expect(carry.planCarryOver(TX, "p1", { fromSprintId: "x", pbItemIds: [] })).rejects.toMatchObject({ status: 404 })
    vi.mocked(repo.findCarryOverSource).mockResolvedValueOnce({ id: "s0", status: "active", items: [] } as never)
    await expect(carry.planCarryOver(TX, "p1", { fromSprintId: "s0", pbItemIds: [] })).rejects.toMatchObject({ status: 409 })
  })
})

describe("insertCarriedTasks", () => {
  beforeEach(() => vi.clearAllMocks())

  it("copies each task, queues its translation and re-syncs the score and the PBIs", async () => {
    vi.mocked(repo.insertCarriedTask).mockResolvedValueOnce({ id: "t9", taskName: "build" } as never)
    vi.mocked(repo.insertCarriedTask).mockResolvedValueOnce({ id: "t10", taskName: null } as never)
    await carry.insertCarriedTasks(TX, "s1", {
      pbIds: ["b1", "b2"],
      tasks: [
        { sourceId: "r1", pbItemId: "b1", taskName: "build", assignee: "Ann", estimatedHours: 4, assigneeIds: ["u1"] },
        { sourceId: "r2", pbItemId: "b2", taskName: null, assignee: null, estimatedHours: null, assigneeIds: [] },
      ],
    })
    expect(repo.insertCarriedTask).toHaveBeenCalledWith(
      TX,
      { sprintId: "s1", carriedFromId: "r1", pbItemId: "b1", taskName: "build", assignee: "Ann", estimatedHours: 4 },
      ["u1"],
    )
    // Only a named task has text to translate.
    expect(tr.enqueueIn).toHaveBeenCalledTimes(1)
    expect(tr.enqueueIn).toHaveBeenCalledWith(TX, "sprint_task", "t9", { id: "t9", taskName: "build" })
    expect(recalcSprintActualScore).toHaveBeenCalledWith("s1", TX)
    expect(syncPbiStatusFromTasks).toHaveBeenCalledTimes(2)
  })

  it("does nothing when there is nothing to carry", async () => {
    await carry.insertCarriedTasks(TX, "s1", carry.EMPTY_CARRY)
    expect(repo.insertCarriedTask).not.toHaveBeenCalled()
    expect(recalcSprintActualScore).not.toHaveBeenCalled()
  })
})
