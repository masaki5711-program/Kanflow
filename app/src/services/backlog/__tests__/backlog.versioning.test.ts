import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/services/_shared/activity", async () => (await import("@/services/__tests__/support")).activityMock())
vi.mock("@/services/_shared/notifications", async () => (await import("@/services/__tests__/support")).notificationsMock())
vi.mock("@/services/_shared/db", async () => (await import("@/services/__tests__/support")).dbMock())
vi.mock("@/services/_shared/translations", async () => (await import("@/services/__tests__/support")).translationMock())
vi.mock("@/lib/sprint-score", () => ({ recalcSprintActualScore: vi.fn(async () => 0) }))
vi.mock("../backlog.repository")

const repo = await import("../backlog.repository")
const tr = await import("@/services/_shared/translations")
const { ACTOR, TX } = await import("@/services/__tests__/support")
const svc = await import("../backlog.service")

const CURRENT = { id: "a", version: 7, userStory: "theirs", iceboxItem: null, productGoal: null }

describe("backlog optimistic locking", () => {
  beforeEach(() => vi.clearAllMocks())

  it("passes the expected version to the repository and never writes it as a column", async () => {
    vi.mocked(repo.updateBacklogItem).mockResolvedValue({ id: "a", version: 4 } as never)
    const out = await svc.updateBacklogItem("p1", "a", { userStory: "x", version: 3 }, ACTOR)
    expect(repo.updateBacklogItem).toHaveBeenCalledWith(TX, "p1", "a", { userStory: "x" }, 3)
    expect(tr.enqueueIn).toHaveBeenCalledWith(TX, "backlog_item", "a", { userStory: "x" })
    expect(out).toMatchObject({ id: "a", version: 4 })
  })

  it("stale version → 409 VERSION_CONFLICT with the current DTO", async () => {
    vi.mocked(repo.updateBacklogItem).mockResolvedValue(null)
    vi.mocked(repo.findBacklogItem).mockResolvedValue(CURRENT as never)
    const err = await svc.updateBacklogItem("p1", "a", { userStory: "mine", version: 3 }, ACTOR).catch((e: unknown) => e)
    expect(err).toMatchObject({ status: 409, code: "VERSION_CONFLICT" })
    expect((err as { current: unknown }).current).toMatchObject({ id: "a", version: 7, userStory: "theirs", i18n: {} })
    expect(repo.findBacklogItem).toHaveBeenCalledWith(TX, "p1", "a")
    expect(tr.enqueueIn).not.toHaveBeenCalled()
  })

  it("no row at all → 404 PBI_NOT_FOUND", async () => {
    vi.mocked(repo.updateBacklogItem).mockResolvedValue(null)
    vi.mocked(repo.findBacklogItem).mockResolvedValue(null)
    await expect(svc.updateBacklogItem("p1", "a", { version: 1 }, ACTOR)).rejects.toMatchObject({ status: 404, code: "PBI_NOT_FOUND" })
  })

  it("without a version: backward-compatible plain update (version undefined)", async () => {
    vi.mocked(repo.updateBacklogItem).mockResolvedValue({ id: "a", version: 1 } as never)
    await svc.updateBacklogItem("p1", "a", { userStory: "x" }, ACTOR)
    expect(repo.updateBacklogItem).toHaveBeenCalledWith(TX, "p1", "a", { userStory: "x" }, undefined)
  })

  it("delete with a stale version → 409 with the current PBI", async () => {
    vi.mocked(repo.softDeleteBacklogItem).mockResolvedValue(false)
    vi.mocked(repo.findBacklogItem).mockResolvedValue(CURRENT as never)
    await expect(svc.deleteBacklogItem("p1", "a", ACTOR, 3)).rejects.toMatchObject({ status: 409, code: "VERSION_CONFLICT" })
    expect(repo.softDeleteBacklogItem).toHaveBeenCalledWith(TX, "p1", "a", ACTOR.userId, 3)
  })

  it("delete of a missing PBI with a version → 404", async () => {
    vi.mocked(repo.softDeleteBacklogItem).mockResolvedValue(false)
    vi.mocked(repo.findBacklogItem).mockResolvedValue(null)
    await expect(svc.deleteBacklogItem("p1", "a", ACTOR, 3)).rejects.toMatchObject({ status: 404, code: "PBI_NOT_FOUND" })
  })
})
