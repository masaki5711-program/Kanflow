import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/services/_shared/activity", async () => (await import("@/services/__tests__/support")).activityMock())
vi.mock("@/services/_shared/db", async () => (await import("@/services/__tests__/support")).dbMock())
vi.mock("@/services/_shared/translations", async () => (await import("@/services/__tests__/support")).translationMock())
vi.mock("@/lib/prisma", () => ({ prisma: {} }))
vi.mock("@/lib/plan-progress", async () => ({
  ...(await vi.importActual<typeof import("@/lib/plan-progress")>("@/lib/plan-progress")),
  recalcPlanProgress: vi.fn(async () => []),
}))
vi.mock("../plan-templates.repository")
vi.mock("@/services/plan/plan.repository")

const repo = await import("../plan-templates.repository")
const planRepo = await import("@/services/plan/plan.repository")
const act = await import("@/services/_shared/activity")
const tr = await import("@/services/_shared/translations")
const { recalcPlanProgress } = await import("@/lib/plan-progress")
const { ACTOR, TX } = await import("@/services/__tests__/support")
const { planRow, day } = await import("@/services/plan/__tests__/plan-fixtures")
const apply = await import("../plan-templates.apply")

const CONTENT = {
  stages: [
    { name: "仕様決定", durationDays: 10, checklist: ["承認"], children: [{ name: "見積", durationDays: 4 }, { name: "確定", durationDays: 2 }] },
    { name: "発注", durationDays: 5 },
    { name: "検収", isMilestone: true, durationDays: 1 },
  ],
  checkLabel: "検収",
  checks: [{ name: "安全" }],
}
const template = (over = {}) => ({
  id: "t1",
  builtinKey: "equipment",
  name: "設備導入",
  description: null,
  visibility: "public",
  ownerId: null,
  ownerName: null,
  content: JSON.stringify(CONTENT),
  version: 4,
  createdAt: day("2026-10-01"),
  updatedAt: day("2026-10-01"),
  updatedById: null,
  updatedByName: null,
  deletedAt: null,
  ...over,
})

describe("plan-templates.apply", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    let n = 0
    vi.mocked(planRepo.insertPlanItem).mockImplementation((async (_db: unknown, data: { builtinKey?: string | null }) => ({ ...planRow(), ...(data as object), id: `n${++n}` })) as never)
    vi.mocked(planRepo.nextPlanSortOrder).mockResolvedValue(7)
    vi.mocked(planRepo.findPlanItem).mockResolvedValue(planRow({ id: "parent" }) as never)
    vi.mocked(repo.findTemplate).mockResolvedValue(template() as never)
    vi.mocked(repo.countApplications).mockResolvedValue(0)
    vi.mocked(repo.insertApplication).mockResolvedValue({ id: "app1" })
    vi.mocked(repo.setApplicationRoots).mockResolvedValue({ id: "app1" })
  })

  it("inserts undated rows (parents first) in one transaction and records the load", async () => {
    const out = await apply.applyTemplate("p1", { templateId: "t1" }, ACTOR)
    const inserted = vi.mocked(planRepo.insertPlanItem).mock.calls.map((c) => c[1])
    expect(inserted.map((r) => [r.name, r.parentId, r.sortOrder])).toEqual([
      ["仕様決定", null, 7],
      ["見積", "n1", 1],
      ["確定", "n1", 2],
      ["発注", null, 8],
      ["検収", null, 9],
    ])
    expect(inserted.every((r) => r.plannedStart === null && r.plannedEnd === null && r.templateApplicationId === "app1" && r.projectId === "p1")).toBe(true)
    expect(inserted[0]).toMatchObject({ durationDays: 10, notes: "完了条件:\n- 承認", isMilestone: false })
    expect(inserted[4]).toMatchObject({ isMilestone: true })
    expect(repo.insertApplication).toHaveBeenCalledWith(TX, expect.objectContaining({ projectId: "p1", templateId: "t1", templateVersion: 4, content: JSON.stringify(CONTENT) }))
    expect(repo.setApplicationRoots).toHaveBeenCalledWith(TX, "app1", ["n1", "n4", "n5"])
    expect(recalcPlanProgress).toHaveBeenCalledWith("p1", expect.arrayContaining(["n1", "n5", null]), TX)
    expect(tr.enqueueIn).toHaveBeenCalledTimes(5)
    expect(act.logCreate).toHaveBeenCalledTimes(3)
    expect(act.logActivity).toHaveBeenCalledWith(TX, expect.objectContaining({ entityType: "project", diff: expect.objectContaining({ changes: { planTemplate: { from: null, to: "設備導入" } } }) }))
    expect(out).toEqual({ applicationId: "app1", createdRootIds: ["n1", "n4", "n5"], createdCount: 5, alreadyApplied: false, hasDurations: true, scheduled: 0 })
  })

  it("excludePaths + parentId: inserts the rest under that item; reports a previous load", async () => {
    vi.mocked(repo.countApplications).mockResolvedValue(1)
    const out = await apply.applyTemplate("p1", { templateId: "t1", excludePaths: ["0.0", "2"], parentId: "parent" }, ACTOR)
    const inserted = vi.mocked(planRepo.insertPlanItem).mock.calls.map((c) => c[1])
    expect(inserted.map((r) => [r.name, r.parentId, r.sortOrder])).toEqual([
      ["仕様決定", "parent", 7],
      ["確定", "n1", 1],
      ["発注", "parent", 8],
    ])
    expect(planRepo.nextPlanSortOrder).toHaveBeenCalledWith(TX, "p1", "parent")
    expect(out.alreadyApplied).toBe(true)
  })

  it("with a start date the inserted stages get dates in the same transaction (weekends counted)", async () => {
    // The rows as the insert left them: all undated; the load is scheduled from them.
    vi.mocked(planRepo.findPlanItems).mockImplementation((async () =>
      vi.mocked(planRepo.insertPlanItem).mock.calls.map((c, i) => ({ ...planRow(), ...(c[1] as object), id: `n${i + 1}` }))) as never)
    // Leaves only: 見積 4 + 確定 2 + 発注 5 (+ 検収 milestone 1) from Fri 2026-10-30.
    const out = await apply.applyTemplate("p1", { templateId: "t1", startDate: "2026-10-30" }, ACTOR)
    const dates = Object.fromEntries(vi.mocked(planRepo.updatePlanItem).mock.calls.map((c) => [c[1], [c[2].plannedStart, c[2].plannedEnd]]))
    expect(dates.n2).toEqual([day("2026-10-30"), day("2026-11-02")])
    expect(dates.n3).toEqual([day("2026-11-03"), day("2026-11-04")])
    expect(out.scheduled).toBe(4)
  })

  it("with skipWeekends the durations count weekdays only", async () => {
    vi.mocked(planRepo.findPlanItems).mockImplementation((async () =>
      vi.mocked(planRepo.insertPlanItem).mock.calls.map((c, i) => ({ ...planRow(), ...(c[1] as object), id: `n${i + 1}` }))) as never)
    await apply.applyTemplate("p1", { templateId: "t1", startDate: "2026-10-30", skipWeekends: true }, ACTOR)
    const dates = Object.fromEntries(vi.mocked(planRepo.updatePlanItem).mock.calls.map((c) => [c[1], [c[2].plannedStart, c[2].plannedEnd]]))
    // 見積 4 weekdays from Fri: Fri, Mon, Tue, Wed.
    expect(dates.n2).toEqual([day("2026-10-30"), day("2026-11-04")])
    // 発注 5 weekdays never ends on a weekend.
    expect([6, 0]).not.toContain((dates.n4[1] as Date).getUTCDay())
  })

  it("without a start date nothing is dated", async () => {
    const out = await apply.applyTemplate("p1", { templateId: "t1" }, ACTOR)
    expect(planRepo.updatePlanItem).not.toHaveBeenCalled()
    expect(out.scheduled).toBe(0)
  })

  it("refuses an unknown insert parent, an empty selection and hidden templates", async () => {
    vi.mocked(planRepo.findPlanItem).mockResolvedValue(null)
    await expect(apply.applyTemplate("p1", { templateId: "t1", parentId: "gone" }, ACTOR)).rejects.toMatchObject({ code: "PLAN_PARENT_NOT_FOUND" })
    await expect(apply.applyTemplate("p1", { templateId: "t1", excludePaths: ["0", "1", "2"] }, ACTOR)).rejects.toMatchObject({ code: "PLAN_TEMPLATE_EMPTY" })
    vi.mocked(repo.findTemplate).mockResolvedValue(template({ visibility: "private", ownerId: "someone" }) as never)
    await expect(apply.applyTemplate("p1", { templateId: "t1" }, ACTOR)).rejects.toMatchObject({ status: 404 })
    expect(planRepo.insertPlanItem).not.toHaveBeenCalled()
  })

  it("schedule-from writes dates only for the placed undated leaves, bumps versions and recalcs", async () => {
    vi.mocked(planRepo.findPlanItems).mockResolvedValue([
      planRow({ id: "r", plannedStart: null, plannedEnd: null, durationDays: 10, sortOrder: 1 }),
      planRow({ id: "c1", parentId: "r", plannedStart: null, plannedEnd: null, durationDays: 3, sortOrder: 1 }),
      planRow({ id: "c2", parentId: "r", plannedStart: day("2026-11-01"), plannedEnd: day("2026-11-02"), sortOrder: 2 }),
      planRow({ id: "other", plannedStart: null, plannedEnd: null, sortOrder: 2 }),
    ] as never)
    const out = await apply.scheduleFromStart("p1", { rootIds: ["r"], startDate: "2026-10-26" }, ACTOR)
    expect(out).toEqual({ updated: 1, items: [{ id: "c1", plannedStart: "2026-10-26", plannedEnd: "2026-10-28" }] })
    expect(planRepo.updatePlanItem).toHaveBeenCalledWith(TX, "c1", { plannedStart: day("2026-10-26"), plannedEnd: day("2026-10-28"), version: { increment: 1 } })
    expect(recalcPlanProgress).toHaveBeenCalledWith("p1", ["c1"], TX)
    await expect(apply.scheduleFromStart("p1", { startDate: "2026-02-30" }, ACTOR)).rejects.toMatchObject({ code: "INVALID_DATE" })
  })

  it("save-as-template turns the plan into stages (durations from dates) owned by the caller", async () => {
    vi.mocked(planRepo.findPlanItems).mockResolvedValue([
      planRow({ id: "a", name: "準備", plannedStart: day("2026-10-01"), plannedEnd: day("2026-10-05") }),
      planRow({ id: "b", name: "本番", isMilestone: true, plannedStart: day("2026-10-06"), plannedEnd: day("2026-10-06"), sortOrder: 2 }),
    ] as never)
    vi.mocked(repo.insertTemplate).mockImplementation((async (_db: unknown, data: { builtinKey?: string | null }) => ({ ...template({ builtinKey: null }), ...(data as object), id: "new" })) as never)
    vi.mocked(repo.insertRevision).mockResolvedValue({ id: "r" })
    const out = await apply.savePlanAsTemplate("p1", { name: "イベント（社内）", visibility: "public" }, ACTOR)
    expect(out.content).toEqual({ stages: [{ name: "準備", durationDays: 5 }, { name: "本番", isMilestone: true }] })
    expect(out).toMatchObject({ id: "new", isMine: true, owner: { id: "u1", name: "Alice" } })
    vi.mocked(planRepo.findPlanItems).mockResolvedValue([])
    await expect(apply.savePlanAsTemplate("p1", { name: "x", visibility: "public" }, ACTOR)).rejects.toMatchObject({ code: "PLAN_TEMPLATE_EMPTY" })
  })

  it("save-as-template keeps the plan's dependencies as links between keyed stages", async () => {
    vi.mocked(planRepo.findPlanItems).mockResolvedValue([planRow({ id: "a", name: "準備" }), planRow({ id: "b", name: "本番", sortOrder: 2 })] as never)
    vi.mocked(planRepo.findDependencies).mockResolvedValue([{ id: "d1", predecessorId: "a", successorId: "b" }] as never)
    vi.mocked(repo.insertTemplate).mockImplementation((async (_db: unknown, data: object) => ({ ...template({ builtinKey: null }), ...data, id: "new" })) as never)
    vi.mocked(repo.insertRevision).mockResolvedValue({ id: "r" })
    const out = await apply.savePlanAsTemplate("p1", { name: "依存あり", visibility: "public" }, ACTOR)
    // durationDays 10 is the fixture row's default.
    expect(out.content).toEqual({ stages: [{ key: "s1", name: "準備", durationDays: 10 }, { key: "s2", name: "本番", durationDays: 10 }], links: [{ from: "s1", to: "s2" }] })
  })

  it("a load creates the template's dependencies between the new stages and skips links to excluded ones", async () => {
    const linked = { stages: [{ key: "s1", name: "A" }, { key: "s2", name: "B" }, { key: "s3", name: "C" }], links: [{ from: "s1", to: "s2" }, { from: "s2", to: "s3" }] }
    vi.mocked(repo.findTemplate).mockResolvedValue(template({ content: JSON.stringify(linked) }) as never)
    vi.mocked(planRepo.insertDependency).mockResolvedValue({ id: "d", predecessorId: "x", successorId: "y" })
    await apply.applyTemplate("p1", { templateId: "t1" }, ACTOR)
    expect(vi.mocked(planRepo.insertDependency).mock.calls.map((c) => c[1])).toEqual([
      { projectId: "p1", predecessorId: "n1", successorId: "n2" },
      { projectId: "p1", predecessorId: "n2", successorId: "n3" },
    ])

    vi.mocked(planRepo.insertDependency).mockClear()
    await apply.applyTemplate("p1", { templateId: "t1", excludePaths: ["2"] }, ACTOR)
    expect(vi.mocked(planRepo.insertDependency)).toHaveBeenCalledTimes(1)
  })

  it("lists the loads and exposes the content snapshot of one load (for the 検収 board)", async () => {
    vi.mocked(repo.findApplications).mockResolvedValue([
      { id: "app1", templateId: "t1", templateName: "設備導入", templateVersion: 4, createdRootIds: '["n1","n4"]', appliedById: "u1", appliedByName: "Alice", appliedAt: day("2026-10-02") },
    ] as never)
    expect(await apply.listApplications("p1")).toEqual([
      { id: "app1", templateId: "t1", templateName: "設備導入", templateVersion: 4, createdRootIds: ["n1", "n4"], appliedBy: { id: "u1", name: "Alice" }, appliedAt: "2026-10-02T00:00:00.000Z" },
    ])
    vi.mocked(repo.findApplication).mockResolvedValue({ content: JSON.stringify(CONTENT) } as never)
    expect(await apply.getApplicationContent("p1", "app1")).toMatchObject({ checkLabel: "検収", checks: [{ name: "安全" }] })
  })
})
