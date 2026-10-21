import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/services/_shared/activity", async () => (await import("@/services/__tests__/support")).activityMock())
vi.mock("@/services/_shared/notifications", async () => (await import("@/services/__tests__/support")).notificationsMock())
vi.mock("@/services/_shared/db", async () => (await import("@/services/__tests__/support")).dbMock())
vi.mock("@/services/_shared/translations", async () => (await import("@/services/__tests__/support")).translationMock())
vi.mock("@/lib/pbi-status-sync", () => ({
  syncPbiStatusFromTasks: vi.fn(async () => undefined),
  isRealTask: (t: { taskName: string | null }) => !!t.taskName?.trim(),
}))
vi.mock("@/lib/sprint-score", () => ({ recalcSprintActualScore: vi.fn(async () => 0) }))
vi.mock("../sprint-completion-review", () => ({ launchSprintCompletionReview: vi.fn() }))
vi.mock("../sprints.repository")
vi.mock("@/services/backlog/backlog.dependencies", () => ({ loadDependencies: vi.fn(async () => new Map()) }))

const repo = await import("../sprints.repository")
const { loadDependencies } = await import("@/services/backlog/backlog.dependencies")
const tr = await import("@/services/_shared/translations")
const { syncPbiStatusFromTasks } = await import("@/lib/pbi-status-sync")
const { launchSprintCompletionReview } = await import("../sprint-completion-review")
const { ACTOR, TX, touchedTranslationFields } = await import("@/services/__tests__/support")
const svc = await import("../sprints.service")

const createInput = { sprintName: "S1", startDate: "2026-01-01", endDate: "2026-01-14" }

describe("sprints.service", () => {
  beforeEach(() => vi.clearAllMocks())

  it("lists sprints with task and PBI i18n nested", async () => {
    vi.mocked(repo.findSprints).mockResolvedValue([
      { id: "s1", items: [{ id: "t1", pbItemId: "b1", pbItem: { id: "b1" }, assignees: [{ user: { id: "u1", name: "Ann" } }] }] },
    ] as never)
    const out = await svc.listSprints("p1")
    expect(out[0]).toMatchObject({ id: "s1", i18n: {}, items: [{ id: "t1", i18n: {}, pbItem: { id: "b1", i18n: {} } }] })
    expect(out[0].items[0].assignees).toEqual([{ id: "u1", name: "Ann" }])
  })

  it("hands each sprint PBI what it waits for and what waits for it", async () => {
    const blocker = { dependencyId: "d1", id: "b0", displayId: 3, initiative: null, userStory: null, status: "ready", i18n: {} }
    vi.mocked(loadDependencies).mockResolvedValueOnce(new Map([["b1", { blockedBy: [blocker], blocking: [] }]]))
    vi.mocked(repo.findSprints).mockResolvedValue([
      { id: "s1", items: [{ id: "t1", pbItemId: "b1", pbItem: { id: "b1" }, assignees: [] }, { id: "t2", pbItemId: "b2", pbItem: { id: "b2" }, assignees: [] }] },
    ] as never)
    const out = await svc.listSprints("p1")
    expect(loadDependencies).toHaveBeenCalledWith(expect.anything(), "p1")
    expect(out[0].items[0].pbItem).toMatchObject({ id: "b1", blockedBy: [blocker], blocking: [] })
    expect(out[0].items[1].pbItem).toMatchObject({ id: "b2", blockedBy: [], blocking: [] })
  })

  it("getSprint 404s", async () => {
    vi.mocked(repo.findSprintDetail).mockResolvedValue(null)
    await expect(svc.getSprint("p1", "s")).rejects.toMatchObject({ status: 404 })
  })

  it("refuses a second open sprint with the blocker in the body", async () => {
    const blocker = { id: "s0", sprintName: "Old", status: "active" }
    vi.mocked(repo.findOpenSprint).mockResolvedValue(blocker)
    await expect(svc.createSprint("p1", createInput, ACTOR)).rejects.toMatchObject({ status: 409, extra: { blocker } })
    expect(repo.insertSprint).not.toHaveBeenCalled()
  })

  it("creates with only the project's PBIs, keeping the requested order", async () => {
    vi.mocked(repo.findOpenSprint).mockResolvedValue(null)
    vi.mocked(repo.findProjectPbiIds).mockResolvedValue([{ id: "b2" }, { id: "b1" }])
    vi.mocked(repo.insertSprint).mockResolvedValue({ id: "s1" } as never)
    await svc.createSprint("p1", { ...createInput, selectedPbIds: ["b1", "foreign", "b2"] }, ACTOR)
    expect(repo.insertSprint).toHaveBeenCalledWith(TX, expect.objectContaining({ status: "planning", capacity: 0 }), ["b1", "b2"])
    expect(tr.enqueueIn).toHaveBeenCalledWith(TX, "sprint", "s1", { id: "s1" })
  })

  it("carries the open tasks of an earlier sprint and does not add the same PBI a second time", async () => {
    vi.mocked(repo.findOpenSprint).mockResolvedValue(null)
    vi.mocked(repo.findCarryOverSource).mockResolvedValue({
      id: "s0", status: "archived",
      items: [
        { id: "r1", pbItemId: "b1", taskName: "build", status: "todo", assignee: null, estimatedHours: 2, assignees: [], carriedCopies: [] },
        { id: "r2", pbItemId: "b2", taskName: null, status: "todo", assignee: null, estimatedHours: null, assignees: [], carriedCopies: [] },
      ],
    } as never)
    vi.mocked(repo.findProjectPbiIds).mockResolvedValue([{ id: "b3" }])
    vi.mocked(repo.insertSprint).mockResolvedValue({ id: "s1" } as never)
    vi.mocked(repo.insertCarriedTask).mockResolvedValue({ id: "t1" } as never)
    vi.mocked(repo.findSprintDetail).mockResolvedValue({ id: "s1", items: [{ id: "t1" }] } as never)
    const out = await svc.createSprint("p1", {
      ...createInput, selectedPbIds: ["b1", "b3"], carryOver: { fromSprintId: "s0", pbItemIds: ["b1", "b2"] },
    }, ACTOR)
    // b1 arrives with its task (no extra placeholder); b2 had none, so its bare membership is copied.
    expect(repo.findProjectPbiIds).toHaveBeenCalledWith(TX, "p1", ["b3"])
    expect(repo.insertSprint).toHaveBeenCalledWith(TX, expect.anything(), ["b3"])
    expect(repo.insertCarriedTask).toHaveBeenCalledWith(TX, expect.objectContaining({ sprintId: "s1", carriedFromId: "r1", pbItemId: "b1", taskName: "build" }), [])
    expect(repo.insertCarriedTask).toHaveBeenCalledWith(TX, expect.objectContaining({ carriedFromId: "r2", pbItemId: "b2", taskName: null }), [])
    expect(out).toMatchObject({ id: "s1", items: [{ id: "t1" }] })
  })

  it("rejects invalid dates before touching the DB", async () => {
    await expect(svc.createSprint("p1", { ...createInput, endDate: "bad" }, ACTOR)).rejects.toMatchObject({ status: 400 })
    expect(repo.findOpenSprint).not.toHaveBeenCalled()
  })

  it("buildSprintUpdate promotes done to archived and converts dates", () => {
    expect(svc.buildSprintUpdate({ status: "done", startDate: "2026-01-01" })).toEqual({
      status: "archived",
      startDate: new Date("2026-01-01"),
    })
    expect(svc.buildSprintUpdate({ status: "active" })).toEqual({ status: "active" })
  })

  it("completing a sprint launches the review after commit", async () => {
    vi.mocked(repo.updateSprint).mockResolvedValue({ id: "s1", sprintName: "S1" } as never)
    await svc.updateSprint("p1", "s1", { status: "done" }, ACTOR)
    expect(launchSprintCompletionReview).toHaveBeenCalledWith("p1", "s1", "S1", ACTOR.userId)
    await svc.updateSprint("p1", "s1", { sprintGoal: "g" }, ACTOR)
    expect(launchSprintCompletionReview).toHaveBeenCalledTimes(1)
    expect(tr.enqueueIn).toHaveBeenLastCalledWith(TX, "sprint", "s1", { sprintGoal: "g" })
  })

  it("delete purges sprint, task and note translations and re-syncs PBIs", async () => {
    vi.mocked(repo.findSprintChildren).mockResolvedValue({
      tasks: [{ id: "t1", pbItemId: "b1" }, { id: "t2", pbItemId: "b1" }, { id: "t3", pbItemId: "b2" }],
      notes: [{ id: "n1" }],
    })
    vi.mocked(repo.deleteSprint).mockResolvedValue(1)
    await svc.deleteSprint("p1", "s1")
    expect(repo.deleteSprint).toHaveBeenCalledWith(TX, "p1", "s1", undefined)
    expect(tr.purgeIn).toHaveBeenCalledWith(TX, {
      sprint: ["s1"],
      sprint_task: ["t1", "t2", "t3"],
      daily_scrum_note: ["n1"],
    })
    expect(syncPbiStatusFromTasks).toHaveBeenCalledTimes(2)
  })

  it("burndown reverses newest-first rows into chronological order", async () => {
    vi.mocked(repo.findBurndownSprints).mockResolvedValue([])
    const out = await svc.getBurndown("p1")
    expect(out.days).toEqual([])
  })

  it("burndown of one sprint covers only that sprint's days and tasks", async () => {
    vi.mocked(repo.findBurndownSprint).mockResolvedValue({
      id: "s2", sprintName: "S2", status: "active",
      startDate: new Date(2026, 8, 1), endDate: new Date(2026, 8, 3),
      items: [{ taskName: "a", status: "done", completedAt: new Date(2026, 8, 2) }, { taskName: "b", status: "todo", completedAt: null }],
    } as never)
    const out = await svc.getBurndown("p1", "s2", new Date(2026, 8, 2))
    expect(repo.findBurndownSprint).toHaveBeenCalledWith(expect.anything(), "p1", "s2")
    expect(repo.findBurndownSprints).not.toHaveBeenCalled()
    expect(out.days).toEqual(["2026-09-01", "2026-09-02", "2026-09-03"])
    expect(out.totalTasks).toBe(2)
    expect(out.sprintMarkers.map((m) => m.id)).toEqual(["s2"])
    expect(tr.getI18nFor).toHaveBeenCalledWith("sprint", ["s2"])
    expect(out.sprintMarkers[0].i18n).toEqual({})
  })

  it("burndown of an unknown (or planning) sprint 404s", async () => {
    vi.mocked(repo.findBurndownSprint).mockResolvedValue(null)
    await expect(svc.getBurndown("p1", "nope")).rejects.toMatchObject({ status: 404 })
  })
})

describe("A3-02: partial updates keep translations", () => {
  beforeEach(() => vi.clearAllMocks())

  it("a status-only update (text keys undefined) touches no FieldTranslation row", async () => {
    vi.mocked(repo.updateSprint).mockResolvedValue({ id: "s1", sprintName: "S1" } as never)
    await svc.updateSprint("p1", "s1", { status: "active", sprintName: undefined, sprintGoal: undefined }, ACTOR)
    expect(touchedTranslationFields(tr.enqueueIn)).toEqual([])
  })
})
