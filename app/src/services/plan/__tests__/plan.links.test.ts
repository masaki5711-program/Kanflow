import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/lib/prisma", () => ({ prisma: {} }))
vi.mock("@/services/_shared/activity", async () => (await import("@/services/__tests__/support")).activityMock())
vi.mock("@/services/_shared/db", async () => (await import("@/services/__tests__/support")).dbMock())
vi.mock("@/services/_shared/translations", async () => (await import("@/services/__tests__/support")).translationMock())
vi.mock("@/lib/plan-progress", async () => ({
  ...(await vi.importActual<typeof import("@/lib/plan-progress")>("@/lib/plan-progress")),
  recalcPlanProgress: vi.fn(async () => []),
}))
vi.mock("../plan.repository")

const repo = await import("../plan.repository")
const act = await import("@/services/_shared/activity")
const { recalcPlanProgress } = await import("@/lib/plan-progress")
const { ACTOR, TX, DEFAULT_DB } = await import("@/services/__tests__/support")
const { planRow, day } = await import("./plan-fixtures")
const links = await import("../plan.links")

const sprint = (id: string, status: string, start: string) => ({ sprint: { id, sprintName: id.toUpperCase(), startDate: day(start), endDate: day(start), status } })
const pbiRow = (id: string, over: Record<string, unknown> = {}) => ({
  id,
  displayId: Number(id.replace(/\D/g, "")) || 1,
  initiative: null,
  userStory: `story ${id}`,
  status: "ready",
  workloadScore: 2,
  planItemId: "leaf",
  sprintItems: [],
  ...over,
})

describe("plan.links", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(repo.findPlanItem).mockResolvedValue(planRow({ id: "leaf" }) as never)
    vi.mocked(repo.countPlanChildren).mockResolvedValue(0)
    vi.mocked(repo.findLinkedPbisOfItem).mockResolvedValue([])
  })

  it("currentSprintOf prefers active, then planning, then the most recent", () => {
    expect(links.currentSprintOf([])).toBeNull()
    expect(links.currentSprintOf([sprint("s1", "completed", "2026-09-01"), sprint("s2", "planning", "2026-10-15"), sprint("s3", "active", "2026-10-01")])).toEqual({ id: "s3", name: "S3" })
    expect(links.currentSprintOf([sprint("s1", "completed", "2026-08-01"), sprint("s2", "completed", "2026-09-01")])).toEqual({ id: "s2", name: "S2" })
  })

  it("assertLinkablePlanItem: 404 for missing / trashed, 400 for parents", async () => {
    vi.mocked(repo.findPlanItem).mockResolvedValueOnce(null)
    await expect(links.assertLinkablePlanItem(TX as never, "p1", "x")).rejects.toMatchObject({ status: 404, code: "PLAN_ITEM_NOT_FOUND" })
    vi.mocked(repo.countPlanChildren).mockResolvedValueOnce(2)
    await expect(links.assertLinkablePlanItem(TX as never, "p1", "leaf")).rejects.toMatchObject({ status: 400, code: "PLAN_LINK_REQUIRES_LEAF" })
    await expect(links.assertLinkablePlanItem(TX as never, "p1", "leaf")).resolves.toBeUndefined()
  })

  it("assertLinkablePlanItem: 400 PLAN_LINK_MILESTONE for a milestone (PUT links / PBI PATCH / bulk share it)", async () => {
    vi.mocked(repo.findPlanItem).mockResolvedValue(planRow({ id: "m", isMilestone: true }) as never)
    await expect(links.assertLinkablePlanItem(TX as never, "p1", "m")).rejects.toMatchObject({ status: 400, code: "PLAN_LINK_MILESTONE" })
    await expect(links.setPlanLinks("p1", "m", ["b1"], ACTOR)).rejects.toMatchObject({ status: 400, code: "PLAN_LINK_MILESTONE" })
    expect(repo.setPbiPlanItem).not.toHaveBeenCalled()
  })

  it("getPlanLinks shapes { pbis } with title fallback and current sprint", async () => {
    vi.mocked(repo.findLinkedPbisOfItem).mockResolvedValue([
      pbiRow("b1", { initiative: "Init", sprintItems: [sprint("s1", "active", "2026-10-01")] }),
      pbiRow("b2", { workloadScore: null }),
    ] as never)
    await expect(links.getPlanLinks("p1", "leaf")).resolves.toEqual({
      pbis: [
        { id: "b1", displayId: 1, title: "Init", status: "ready", points: 2, sprint: { id: "s1", name: "S1" } },
        { id: "b2", displayId: 2, title: "story b2", status: "ready", points: 0, sprint: null },
      ],
    })
    expect(repo.findLinkedPbisOfItem).toHaveBeenCalledWith(DEFAULT_DB, "p1", "leaf")
    vi.mocked(repo.findPlanItem).mockResolvedValueOnce(null)
    await expect(links.getPlanLinks("p1", "gone")).rejects.toMatchObject({ status: 404 })
  })

  it("setPlanLinks replaces the set, moves PBIs from other items and recalculates both chains", async () => {
    vi.mocked(repo.findLivePbisByIds).mockResolvedValue([
      { id: "b1", displayId: 1, userStory: "s1", planItemId: "leaf" },
      { id: "b3", displayId: 3, userStory: "s3", planItemId: "other" },
    ])
    vi.mocked(repo.findLinkedPbisOfItem)
      .mockResolvedValueOnce([pbiRow("b1"), pbiRow("b2")] as never)
      .mockResolvedValue([])
    await links.setPlanLinks("p1", "leaf", ["b1", "b3", "b1"], ACTOR)
    expect(repo.findLivePbisByIds).toHaveBeenCalledWith(TX, "p1", ["b1", "b3"])
    expect(repo.setPbiPlanItem).toHaveBeenCalledWith(TX, "p1", ["b2"], null)
    expect(repo.setPbiPlanItem).toHaveBeenCalledWith(TX, "p1", ["b3"], "leaf")
    expect(recalcPlanProgress).toHaveBeenCalledWith("p1", ["leaf", "other"], TX)
    expect(act.logActivity).toHaveBeenCalledWith(TX, expect.objectContaining({ entityType: "pbi", entityId: "b2", diff: expect.objectContaining({ changes: { planItemId: { from: "leaf", to: null } } }) }))
    expect(act.logActivity).toHaveBeenCalledWith(TX, expect.objectContaining({ entityType: "pbi", entityId: "b3", diff: expect.objectContaining({ changes: { planItemId: { from: "other", to: "leaf" } } }) }))
    expect(act.logActivity).toHaveBeenCalledWith(TX, expect.objectContaining({ entityType: "plan_item", entityId: "leaf", diff: { meta: { linkedPbis: { added: 1, removed: 1, total: 2 } } } }))
  })

  it("setPlanLinks rejects foreign / trashed PBIs and parent items", async () => {
    vi.mocked(repo.findLivePbisByIds).mockResolvedValue([])
    await expect(links.setPlanLinks("p1", "leaf", ["foreign"], ACTOR)).rejects.toMatchObject({ status: 400, code: "PLAN_LINK_INVALID_PBI" })
    vi.mocked(repo.countPlanChildren).mockResolvedValue(1)
    await expect(links.setPlanLinks("p1", "leaf", [], ACTOR)).rejects.toMatchObject({ code: "PLAN_LINK_REQUIRES_LEAF" })
    expect(repo.setPbiPlanItem).not.toHaveBeenCalled()
  })

  it("setPlanLinks with an unchanged set writes no activity", async () => {
    vi.mocked(repo.findLivePbisByIds).mockResolvedValue([{ id: "b1", displayId: 1, userStory: "s", planItemId: "leaf" }])
    vi.mocked(repo.findLinkedPbisOfItem).mockResolvedValue([pbiRow("b1")] as never)
    await links.setPlanLinks("p1", "leaf", ["b1"], ACTOR)
    expect(act.logActivity).not.toHaveBeenCalled()
  })

  it("listLinkablePbis parses #id queries and hides trashed plan items", async () => {
    vi.mocked(repo.findLinkablePbis).mockResolvedValue([
      { id: "b1", displayId: 12, initiative: "", userStory: "u", status: "ready", workloadScore: 3, planItem: { id: "pl", name: "Plan", deletedAt: null } },
      { id: "b2", displayId: 13, initiative: "I", userStory: null, status: "completed", workloadScore: 0, planItem: { id: "old", name: "Old", deletedAt: new Date() } },
    ] as never)
    const out = await links.listLinkablePbis("p1", " #12 ")
    expect(repo.findLinkablePbis).toHaveBeenCalledWith(DEFAULT_DB, "p1", "#12", 12)
    expect(out.pbis).toEqual([
      { id: "b1", displayId: 12, title: "u", status: "ready", points: 3, planItem: { id: "pl", name: "Plan" } },
      { id: "b2", displayId: 13, title: "I", status: "completed", points: 0, planItem: null },
    ])
    await links.listLinkablePbis("p1", undefined)
    expect(repo.findLinkablePbis).toHaveBeenLastCalledWith(DEFAULT_DB, "p1", undefined, null)
  })
})
