import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/services/_shared/activity", async () => (await import("@/services/__tests__/support")).activityMock())
vi.mock("@/services/_shared/notifications", async () => (await import("@/services/__tests__/support")).notificationsMock())
vi.mock("@/services/_shared/db", async () => (await import("@/services/__tests__/support")).dbMock())
vi.mock("@/services/_shared/translations", async () => (await import("@/services/__tests__/support")).translationMock())
vi.mock("@/lib/pbi-status-sync", () => ({ syncPbiStatusFromTasks: vi.fn(async () => undefined) }))
vi.mock("@/lib/sprint-score", () => ({ recalcSprintActualScore: vi.fn(async () => 0) }))
vi.mock("../sprint-completion-review", () => ({ launchSprintCompletionReview: vi.fn() }))
vi.mock("../sprints.repository")

const repo = await import("../sprints.repository")
const tr = await import("@/services/_shared/translations")
const { ACTOR, TX } = await import("@/services/__tests__/support")
const { launchSprintCompletionReview } = await import("../sprint-completion-review")
const svc = await import("../sprints.service")

const CURRENT = { id: "s1", version: 9, sprintName: "Theirs", items: [] }

describe("sprint optimistic locking", () => {
  beforeEach(() => vi.clearAllMocks())

  it("passes the expected version and never writes it as a column", async () => {
    vi.mocked(repo.updateSprint).mockResolvedValue({ id: "s1", sprintName: "S", version: 3 } as never)
    await svc.updateSprint("p1", "s1", { sprintGoal: "g", version: 2 }, ACTOR)
    expect(repo.updateSprint).toHaveBeenCalledWith(TX, "p1", "s1", { sprintGoal: "g" }, 2)
    expect(tr.enqueueIn).toHaveBeenCalledWith(TX, "sprint", "s1", { sprintGoal: "g" })
  })

  it("stale version → 409 with the current sprint; the completion review is not launched", async () => {
    vi.mocked(repo.updateSprint).mockResolvedValue(null)
    vi.mocked(repo.findSprintDetail).mockResolvedValue(CURRENT as never)
    const err = await svc.updateSprint("p1", "s1", { status: "done", version: 2 }, ACTOR).catch((e: unknown) => e)
    expect(err).toMatchObject({ status: 409, code: "VERSION_CONFLICT", current: { ...CURRENT, i18n: {} } })
    expect(repo.findSprintDetail).toHaveBeenCalledWith(TX, "p1", "s1")
    expect(launchSprintCompletionReview).not.toHaveBeenCalled()
  })

  it("missing sprint → 404 SPRINT_NOT_FOUND", async () => {
    vi.mocked(repo.updateSprint).mockResolvedValue(null)
    vi.mocked(repo.findSprintDetail).mockResolvedValue(null)
    await expect(svc.updateSprint("p1", "s1", { sprintGoal: "g" }, ACTOR)).rejects.toMatchObject({ status: 404, code: "SPRINT_NOT_FOUND" })
  })

  it("delete with a stale version → 409 and nothing is purged", async () => {
    vi.mocked(repo.findSprintChildren).mockResolvedValue({ tasks: [], notes: [] })
    vi.mocked(repo.deleteSprint).mockResolvedValue(0)
    vi.mocked(repo.findSprintDetail).mockResolvedValue(CURRENT as never)
    await expect(svc.deleteSprint("p1", "s1", ACTOR, 2)).rejects.toMatchObject({ status: 409, code: "VERSION_CONFLICT" })
    expect(repo.deleteSprint).toHaveBeenCalledWith(TX, "p1", "s1", 2)
    expect(tr.purgeIn).not.toHaveBeenCalled()
  })

  it("delete of a missing sprint → 404", async () => {
    vi.mocked(repo.findSprintChildren).mockResolvedValue({ tasks: [], notes: [] })
    vi.mocked(repo.deleteSprint).mockResolvedValue(0)
    vi.mocked(repo.findSprintDetail).mockResolvedValue(null)
    await expect(svc.deleteSprint("p1", "s1", ACTOR)).rejects.toMatchObject({ status: 404, code: "SPRINT_NOT_FOUND" })
  })
})
