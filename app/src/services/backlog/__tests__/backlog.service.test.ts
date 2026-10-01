import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/services/_shared/activity", async () => (await import("@/services/__tests__/support")).activityMock())
vi.mock("@/services/_shared/notifications", async () => (await import("@/services/__tests__/support")).notificationsMock())
vi.mock("@/services/_shared/db", async () => (await import("@/services/__tests__/support")).dbMock())
vi.mock("@/services/_shared/translations", async () => (await import("@/services/__tests__/support")).translationMock())
vi.mock("@/lib/sprint-score", () => ({ recalcSprintActualScore: vi.fn(async () => 0) }))
vi.mock("../backlog.repository")
vi.mock("../backlog.dependencies.repository", () => ({ findDependencyRows: vi.fn(async () => []) }))

const repo = await import("../backlog.repository")
const depRepo = await import("../backlog.dependencies.repository")
const tr = await import("@/services/_shared/translations")
const { ACTOR, TX, prismaError, touchedTranslationFields } = await import("@/services/__tests__/support")
const { withTransaction } = await import("@/services/_shared/db")
const svc = await import("../backlog.service")

describe("backlog.service", () => {
  beforeEach(() => vi.clearAllMocks())

  it("groups the list by status with linked i18n and ready workload", async () => {
    vi.mocked(repo.findBacklogItems).mockResolvedValue([
      { id: "a", status: "ready", workloadScore: 3, iceboxItem: { id: "i1" }, productGoal: null },
      { id: "b", status: "ready", workloadScore: 5, iceboxItem: null, productGoal: { id: "g1" } },
      { id: "c", status: "not_ready", workloadScore: 8, iceboxItem: null, productGoal: null },
      { id: "d", status: "completed", workloadScore: 1, iceboxItem: null, productGoal: null },
    ] as never)
    vi.mocked(tr.getI18nFor).mockResolvedValue(new Map([["i1", { request: { ja: "x" } }]]) as never)
    const out = await svc.listBacklog("p1")
    expect(out.readyItems.map((i) => i.id)).toEqual(["a", "b"])
    expect(out.notReadyItems.map((i) => i.id)).toEqual(["c"])
    expect(out.completedItems.map((i) => i.id)).toEqual(["d"])
    expect(out.totalWorkload).toBe(8)
    expect(out.readyItems[0].iceboxItem).toEqual({ id: "i1", i18n: { request: { ja: "x" } } })
    expect(out.readyItems[1].productGoal).toMatchObject({ id: "g1" })
  })

  it("passes the status filter to the repository and keeps the grouped shape", async () => {
    vi.mocked(repo.findBacklogItems).mockResolvedValue([
      { id: "a", status: "ready", workloadScore: 2, iceboxItem: null, productGoal: null },
    ] as never)
    vi.mocked(tr.getI18nFor).mockResolvedValue(new Map() as never)
    const out = await svc.listBacklog("p1", { status: "ready" })
    expect(repo.findBacklogItems).toHaveBeenCalledWith(expect.anything(), "p1", "ready", undefined)
    expect(out.readyItems.map((i) => i.id)).toEqual(["a"])
    expect(out.notReadyItems).toEqual([])
    expect(out.totalWorkload).toBe(2)
  })

  it("loads every status when no filter is given", async () => {
    vi.mocked(repo.findBacklogItems).mockResolvedValue([] as never)
    vi.mocked(tr.getI18nFor).mockResolvedValue(new Map() as never)
    await svc.listBacklog("p1")
    expect(repo.findBacklogItems).toHaveBeenCalledWith(expect.anything(), "p1", undefined, undefined)
  })

  it("attaches blockedBy / blocking to list rows from the dependency repository", async () => {
    vi.mocked(repo.findBacklogItems).mockResolvedValue([
      { id: "a", status: "ready", workloadScore: 3, iceboxItem: null, productGoal: null },
      { id: "b", status: "ready", workloadScore: 5, iceboxItem: null, productGoal: null },
    ] as never)
    vi.mocked(tr.getI18nFor).mockResolvedValue(new Map() as never)
    vi.mocked(depRepo.findDependencyRows).mockResolvedValueOnce([
      {
        id: "d1",
        predecessorId: "a",
        successorId: "b",
        predecessor: { id: "a", displayId: 1, initiative: "A", userStory: null, status: "ready" },
        successor: { id: "b", displayId: 2, initiative: "B", userStory: null, status: "ready" },
      },
    ] as never)
    const out = await svc.listBacklog("p1")
    const a = out.readyItems.find((i) => i.id === "a")!
    const b = out.readyItems.find((i) => i.id === "b")!
    expect(a.blockedBy).toEqual([])
    expect(a.blocking).toMatchObject([{ dependencyId: "d1", id: "b" }])
    expect(b.blockedBy).toMatchObject([{ dependencyId: "d1", id: "a" }])
    expect(b.blocking).toEqual([])
  })

  it("getBacklogItem 404s and otherwise attaches i18n", async () => {
    vi.mocked(repo.findBacklogItem).mockResolvedValueOnce(null)
    await expect(svc.getBacklogItem("p1", "x")).rejects.toMatchObject({ status: 404 })
    vi.mocked(repo.findBacklogItem).mockResolvedValueOnce({ id: "a", iceboxItem: null, productGoal: null } as never)
    await expect(svc.getBacklogItem("p1", "a")).resolves.toMatchObject({ id: "a", i18n: {}, iceboxItem: null, blockedBy: [], blocking: [] })
  })

  it("retries the whole create transaction when the displayId collides (P2002)", async () => {
    vi.mocked(repo.nextBacklogNumbers)
      .mockResolvedValueOnce({ displayId: 7, sortOrder: 4 })
      .mockResolvedValueOnce({ displayId: 8, sortOrder: 5 })
    vi.mocked(repo.insertBacklogItem).mockRejectedValueOnce(prismaError("P2002")).mockResolvedValueOnce({ id: "n" } as never)
    await expect(svc.createBacklogItem("p1", { userStory: "US" }, ACTOR)).resolves.toEqual({ id: "n" })
    expect(withTransaction).toHaveBeenCalledTimes(2)
    expect(repo.insertBacklogItem).toHaveBeenLastCalledWith(TX, expect.objectContaining({ displayId: 8, sortOrder: 5 }))
    expect(tr.enqueueIn).toHaveBeenCalledTimes(1)
  })

  it.each([{}, { initiative: "  ", userStory: " \t" }, { epic: "E", acceptanceCriteria: "AC" }])(
    "refuses an untitled PBI (no initiative / user story) with 400 PBI_CONTENT_REQUIRED: %o",
    async (input) => {
      await expect(svc.createBacklogItem("p1", input, ACTOR)).rejects.toMatchObject({ status: 400, code: "PBI_CONTENT_REQUIRED" })
      expect(repo.insertBacklogItem).not.toHaveBeenCalled()
    },
  )

  it("accepts an initiative alone as the PBI title", async () => {
    vi.mocked(repo.nextBacklogNumbers).mockResolvedValue({ displayId: 1, sortOrder: 1 })
    vi.mocked(repo.insertBacklogItem).mockResolvedValue({ id: "n" } as never)
    await expect(svc.createBacklogItem("p1", { initiative: "Login" }, ACTOR)).resolves.toEqual({ id: "n" })
  })

  it("surfaces a 409 when the displayId keeps colliding", async () => {
    vi.mocked(repo.nextBacklogNumbers).mockResolvedValue({ displayId: 7, sortOrder: 4 })
    vi.mocked(repo.insertBacklogItem)
      .mockRejectedValueOnce(prismaError("P2002"))
      .mockRejectedValueOnce(prismaError("P2002"))
      .mockRejectedValueOnce(prismaError("P2002"))
    await expect(svc.createBacklogItem("p1", { userStory: "US" }, ACTOR)).rejects.toMatchObject({ status: 409 })
    expect(repo.insertBacklogItem).toHaveBeenCalledTimes(3)
  })

  it("creates with next display id / sort order and enqueues in the tx", async () => {
    vi.mocked(repo.nextBacklogNumbers).mockResolvedValue({ displayId: 7, sortOrder: 4 })
    vi.mocked(repo.insertBacklogItem).mockResolvedValue({ id: "n" } as never)
    await svc.createBacklogItem("p1", { userStory: "US", productGoalId: "", iceboxItemId: "" }, ACTOR)
    expect(repo.insertBacklogItem).toHaveBeenCalledWith(TX, expect.objectContaining({
      projectId: "p1",
      displayId: 7,
      sortOrder: 4,
      status: "not_ready",
      workloadScore: 0,
      productGoalId: null,
      iceboxItemId: null,
    }))
    expect(tr.enqueueIn).toHaveBeenCalledWith(TX, "backlog_item", "n", { id: "n" })
  })

  it("completionPatch follows the status", () => {
    expect(svc.completionPatch("completed").completedAt).toBeInstanceOf(Date)
    expect(svc.completionPatch("ready")).toEqual({ completedAt: null })
    expect(svc.completionPatch(undefined)).toEqual({})
  })

  it("updates, normalizes an empty goal id and enqueues the changed fields", async () => {
    vi.mocked(repo.updateBacklogItem).mockResolvedValue({ id: "a" } as never)
    await svc.updateBacklogItem("p1", "a", { status: "ready", productGoalId: "" }, ACTOR)
    expect(repo.updateBacklogItem).toHaveBeenCalledWith(TX, "p1", "a", {
      status: "ready",
      productGoalId: null,
      completedAt: null,
    }, undefined)
    expect(tr.enqueueIn).toHaveBeenCalledWith(TX, "backlog_item", "a", { status: "ready", productGoalId: null })
  })

  it("unlinks the IceBox request when iceboxItemId is empty (and skips the cross-project check)", async () => {
    vi.mocked(repo.updateBacklogItem).mockResolvedValue({ id: "a" } as never)
    await svc.updateBacklogItem("p1", "a", { iceboxItemId: "" }, ACTOR)
    expect(repo.findProjectIceboxItemId).not.toHaveBeenCalled()
    expect(repo.updateBacklogItem).toHaveBeenCalledWith(TX, "p1", "a", { iceboxItemId: null }, undefined)
  })

  it("emptyLinksToNull returns a new object and leaves real ids alone", () => {
    const input = { productGoalId: "g1", iceboxItemId: "" }
    const out = svc.emptyLinksToNull(input)
    expect(out).toEqual({ productGoalId: "g1", iceboxItemId: null })
    expect(input.iceboxItemId).toBe("")
  })

  // delete (trash) / restore / purge: see backlog.trash.test.ts

  it("create rejects an icebox item of another project before inserting", async () => {
    vi.mocked(repo.findProjectIceboxItemId).mockResolvedValueOnce(null)
    await expect(svc.createBacklogItem("p1", { userStory: "US", iceboxItemId: "foreign" }, ACTOR))
      .rejects.toMatchObject({ status: 404, code: "ICEBOX_ITEM_NOT_FOUND" })
    expect(repo.findProjectIceboxItemId).toHaveBeenCalledWith(TX, "p1", "foreign")
    expect(repo.insertBacklogItem).not.toHaveBeenCalled()
  })

  it("create rejects a product goal of another project before inserting", async () => {
    vi.mocked(repo.findProjectGoalId).mockResolvedValueOnce(null)
    await expect(svc.createBacklogItem("p1", { userStory: "US", productGoalId: "foreign" }, ACTOR))
      .rejects.toMatchObject({ status: 404, code: "PRODUCT_GOAL_NOT_FOUND" })
    expect(repo.insertBacklogItem).not.toHaveBeenCalled()
  })

  it("create accepts links inside the project", async () => {
    vi.mocked(repo.findProjectIceboxItemId).mockResolvedValueOnce({ id: "i1" })
    vi.mocked(repo.findProjectGoalId).mockResolvedValueOnce({ id: "g1" })
    vi.mocked(repo.nextBacklogNumbers).mockResolvedValueOnce({ displayId: 1, sortOrder: 1 })
    vi.mocked(repo.insertBacklogItem).mockResolvedValueOnce({ id: "n" } as never)
    await svc.createBacklogItem("p1", { userStory: "US", iceboxItemId: "i1", productGoalId: "g1" }, ACTOR)
    expect(repo.insertBacklogItem).toHaveBeenCalledWith(TX, expect.objectContaining({ iceboxItemId: "i1", productGoalId: "g1" }))
  })

  it("update rejects a product goal of another project and does not write", async () => {
    vi.mocked(repo.findProjectGoalId).mockResolvedValueOnce(null)
    await expect(svc.updateBacklogItem("p1", "a", { productGoalId: "foreign" }, ACTOR))
      .rejects.toMatchObject({ status: 404, code: "PRODUCT_GOAL_NOT_FOUND" })
    expect(repo.findProjectGoalId).toHaveBeenCalledWith(TX, "p1", "foreign")
    expect(repo.updateBacklogItem).not.toHaveBeenCalled()
  })

  it("update skips the goal check when unlinking", async () => {
    vi.mocked(repo.updateBacklogItem).mockResolvedValueOnce({ id: "a" } as never)
    await svc.updateBacklogItem("p1", "a", { productGoalId: null }, ACTOR)
    expect(repo.findProjectGoalId).not.toHaveBeenCalled()
  })

  it("reorders inside one transaction", async () => {
    await svc.reorderBacklog("p1", ["x", "y"])
    expect(repo.setBacklogSortOrder).toHaveBeenNthCalledWith(1, TX, "p1", "x", 0)
    expect(repo.setBacklogSortOrder).toHaveBeenNthCalledWith(2, TX, "p1", "y", 1)
  })
  describe("update keeps the PBI titled (N-01)", () => {
    it("refuses (400 PBI_CONTENT_REQUIRED) a PATCH that leaves neither initiative nor user story", async () => {
      vi.mocked(repo.updateBacklogItem).mockResolvedValueOnce({ id: "b1", displayId: 7, initiative: "", userStory: "  " } as never)
      await expect(svc.updateBacklogItem("p1", "b1", { initiative: "", userStory: "", version: 0 }, ACTOR)).rejects.toMatchObject({
        status: 400,
        code: "PBI_CONTENT_REQUIRED",
      })
      expect(tr.enqueueIn).not.toHaveBeenCalled()
    })

    it("refuses clearing the only remaining title field", async () => {
      vi.mocked(repo.updateBacklogItem).mockResolvedValueOnce({ id: "b1", displayId: 7, initiative: null, userStory: "" } as never)
      await expect(svc.updateBacklogItem("p1", "b1", { userStory: "" }, ACTOR)).rejects.toMatchObject({ code: "PBI_CONTENT_REQUIRED" })
    })

    it("accepts clearing one field while the other keeps text", async () => {
      vi.mocked(repo.updateBacklogItem).mockResolvedValueOnce({ id: "b1", displayId: 7, initiative: "", userStory: "US" } as never)
      await expect(svc.updateBacklogItem("p1", "b1", { initiative: "" }, ACTOR)).resolves.toMatchObject({ id: "b1" })
    })

    it("does not re-check untouched title fields (status change of a legacy untitled PBI)", async () => {
      vi.mocked(repo.updateBacklogItem).mockResolvedValueOnce({ id: "b1", displayId: 7, initiative: null, userStory: "", status: "ready" } as never)
      await expect(svc.updateBacklogItem("p1", "b1", { status: "ready" }, ACTOR)).resolves.toMatchObject({ id: "b1" })
    })
  })
})

describe("A3-02: partial updates keep translations", () => {
  beforeEach(() => vi.clearAllMocks())

  it("a status-only update (text keys undefined) touches no FieldTranslation row", async () => {
    vi.mocked(repo.updateBacklogItem).mockResolvedValue({ id: "a", displayId: 1 } as never)
    await svc.updateBacklogItem("p1", "a", { status: "completed", userStory: undefined, initiative: undefined }, ACTOR)
    expect(touchedTranslationFields(tr.enqueueIn)).toEqual([])
  })
})
