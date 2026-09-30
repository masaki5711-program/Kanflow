import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/services/_shared/activity", async () => (await import("@/services/__tests__/support")).activityMock())
vi.mock("@/services/_shared/notifications", async () => (await import("@/services/__tests__/support")).notificationsMock())
vi.mock("@/services/_shared/db", async () => (await import("@/services/__tests__/support")).dbMock())
vi.mock("@/services/_shared/translations", async () => (await import("@/services/__tests__/support")).translationMock())
vi.mock("@/lib/pbi-status-sync", () => ({
  syncPbiStatusFromTasks: vi.fn(async () => undefined),
  isRealTask: (t: { taskName: string | null }) => !!t.taskName?.trim(),
}))
vi.mock("../sprint-completion-review", () => ({ launchSprintCompletionReview: vi.fn() }))
vi.mock("../sprints.repository")

const repo = await import("../sprints.repository")
const tr = await import("@/services/_shared/translations")
const { syncPbiStatusFromTasks } = await import("@/lib/pbi-status-sync")
const { launchSprintCompletionReview } = await import("../sprint-completion-review")
const { ACTOR, TX } = await import("@/services/__tests__/support")
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
    expect(launchSprintCompletionReview).toHaveBeenCalledWith("p1", "s1", "S1")
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
})
