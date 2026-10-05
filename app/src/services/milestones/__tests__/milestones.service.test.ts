import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/services/_shared/activity", async () => (await import("@/services/__tests__/support")).activityMock())
vi.mock("@/services/_shared/db", async () => (await import("@/services/__tests__/support")).dbMock())
vi.mock("@/services/_shared/translations", async () => (await import("@/services/__tests__/support")).translationMock())
vi.mock("@/lib/api-helpers", () => ({ saveUploadedFile: vi.fn(), deleteUploadedFile: vi.fn(async () => undefined) }))
vi.mock("@/services/attachments/storage-quota", () => ({ assertStorageQuota: vi.fn(async () => undefined) }))
vi.mock("../milestones.repository")
vi.mock("../milestones.parts.repository")

const repo = await import("../milestones.repository")
const parts = await import("../milestones.parts.repository")
const { ACTOR, TX } = await import("@/services/__tests__/support")
const svc = await import("../milestones.service")
const { ensureSeeded } = await import("../milestones.seed")

const NOW = new Date("2026-10-02T03:00:00Z") // 12:00 JST

const planRow = (over: Record<string, unknown> = {}) => ({
  id: "s1",
  parentId: null,
  name: "仕様決定",
  status: "not_started",
  progressPct: 0,
  plannedStart: null,
  plannedEnd: null,
  actualStart: null,
  actualEnd: null,
  isMilestone: false,
  notes: null,
  version: 3,
  checklistStates: [],
  ...over,
})

const app = (over: Record<string, unknown> = {}) => ({
  id: "app1",
  templateName: "設備導入",
  content: JSON.stringify({
    stages: [{ name: "仕様決定" }],
    checkLabel: "検収",
    checks: [{ name: "能力", criterion: "CT 30秒以下" }, { name: "安全" }],
    documents: ["図面", "取扱説明書"],
    budgetEnabled: true,
  }),
  template: { builtinKey: "equipment" },
  milestoneSeed: null,
  ...over,
})

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(repo.findApplications).mockResolvedValue([])
  vi.mocked(repo.findPlanRows).mockResolvedValue([] as never)
  vi.mocked(repo.findBoardParts).mockResolvedValue([[], [], [], [], []] as never)
  vi.mocked(repo.findSettings).mockResolvedValue(null)
  vi.mocked(repo.findMembers).mockResolvedValue([{ user: { id: "u1", name: "Alice" } }] as never)
  vi.mocked(parts.findCheckNames).mockResolvedValue([])
  vi.mocked(parts.findDocumentNames).mockResolvedValue([])
})

describe("getBoard", () => {
  it("reads stages straight from the top-level plan items (steps, 完了条件 ticks, late, version)", async () => {
    vi.mocked(repo.findPlanRows).mockResolvedValue([
      planRow({ id: "s1", notes: "完了条件:\n- 仕様書承認済み\n- 予算承認", checklistStates: [{ label: "予算承認", checkedByName: "Bob", checkedAt: NOW }] }),
      planRow({ id: "s1a", parentId: "s1", name: "見積", plannedStart: new Date("2026-09-01T00:00:00Z"), plannedEnd: new Date("2026-09-20T00:00:00Z"), status: "in_progress" }),
      planRow({ id: "s2", name: "立会検収", isMilestone: true, plannedStart: new Date("2026-12-01T00:00:00Z"), plannedEnd: new Date("2026-12-01T00:00:00Z") }),
    ] as never)
    const board = await svc.getBoard("p1", NOW)
    expect(board.stages.map((s) => s.id)).toEqual(["s1", "s2"])
    expect(board.stages[0]).toMatchObject({ hasChildren: true, version: 3, plannedEnd: null, conditions: [{ label: "仕様書承認済み", checked: false }, { label: "予算承認", checked: true, checkedByName: "Bob" }] })
    expect(board.stages[0].steps).toEqual([expect.objectContaining({ id: "s1a", depth: 1, scheduleState: "delayed", plannedEnd: "2026-09-20" })])
    expect(board.stages[1]).toMatchObject({ isMilestone: true, plannedEnd: "2026-12-01", scheduleState: "not_started" })
    expect(board.summary.stages).toMatchObject({ total: 2, done: 0, late: 0, undated: 1, next: { stageId: "s2", id: "s2" } })
    expect(board.members).toEqual([{ id: "u1", name: "Alice" }])
    expect(board.todayKey).toBe("2026-10-02")
  })

  it("converts check / punch days to keys and applies the budget switch to the summary", async () => {
    vi.mocked(repo.findSettings).mockResolvedValue({ projectId: "p1", checkLabel: "検収", budgetEnabled: true, trendEnabled: false, updatedAt: NOW })
    vi.mocked(repo.findBoardParts).mockResolvedValue([
      [{ id: "c1", result: "passed", checkedAt: new Date("2026-10-01T00:00:00Z") }],
      [{ id: "p1", status: "open", dueDate: new Date("2026-09-30T00:00:00Z"), photos: [] }],
      [{ id: "d1", status: "received", files: [] }],
      [{ id: "b1", plannedYen: 100, actualYen: 150 }],
      [],
    ] as never)
    const board = await svc.getBoard("p1", NOW)
    expect(board.checks[0].checkedAt).toBe("2026-10-01")
    expect(board.punchItems[0].dueDate).toBe("2026-09-30")
    expect(board.summary).toMatchObject({ checks: { complete: true }, punch: { open: 1, overdue: 1 }, documents: { received: 1, total: 1 }, budget: { enabled: true, variance: 50 } })
    expect(board.settings).toEqual({ checkLabel: "検収", budgetEnabled: true, trendEnabled: false })
  })

  it("lists each template name once (header)", async () => {
    vi.mocked(repo.findApplications).mockResolvedValue([app({ milestoneSeed: { applicationId: "app1" } }), app({ id: "app2", milestoneSeed: { applicationId: "app2" } })] as never)
    expect((await svc.getBoard("p1", NOW)).templates).toEqual(["設備導入"])
  })
})

describe("ensureSeeded (lazy, idempotent)", () => {
  it("copies checks, documents, label and budget flag of an unseeded load, marker first", async () => {
    expect(await ensureSeeded("p1", [app()] as never)).toBe(1)
    expect(parts.insertSeedMarker).toHaveBeenCalledWith(TX, "app1", "p1")
    expect(vi.mocked(parts.insertSeedMarker).mock.invocationCallOrder[0]).toBeLessThan(vi.mocked(parts.insertCheck).mock.invocationCallOrder[0])
    expect(parts.insertCheck).toHaveBeenCalledWith(TX, { projectId: "p1", name: "能力", criterion: "CT 30秒以下" })
    expect(parts.insertCheck).toHaveBeenCalledWith(TX, { projectId: "p1", name: "安全", criterion: null })
    expect(parts.insertDocument).toHaveBeenCalledTimes(2)
    expect(repo.upsertSettings).toHaveBeenCalledWith(TX, "p1", { checkLabel: "検収", budgetEnabled: true })
  })

  it("skips loads already seeded and names already on the board", async () => {
    vi.mocked(parts.findCheckNames).mockResolvedValue([{ name: "能力" }])
    vi.mocked(parts.findDocumentNames).mockResolvedValue([{ name: "図面" }, { name: "取扱説明書" }])
    expect(await ensureSeeded("p1", [app({ id: "old", milestoneSeed: { applicationId: "old" } }), app()] as never)).toBe(1)
    expect(parts.insertSeedMarker).toHaveBeenCalledTimes(1)
    expect(parts.insertCheck).toHaveBeenCalledTimes(1)
    expect(parts.insertDocument).not.toHaveBeenCalled()
  })

  it("a concurrent seeder (unique marker violation) is not an error", async () => {
    vi.mocked(parts.insertSeedMarker).mockRejectedValueOnce(Object.assign(new Error("dup"), { code: "P2002" }))
    expect(await ensureSeeded("p1", [app()] as never)).toBe(0)
    expect(parts.insertCheck).not.toHaveBeenCalled()
  })

  it("never switches settings off or overwrites a label; 長期品質改善 turns the trend on", async () => {
    vi.mocked(repo.findSettings).mockResolvedValue({ projectId: "p1", checkLabel: "テスト", budgetEnabled: true, trendEnabled: false, updatedAt: NOW })
    const quality = app({ template: { builtinKey: "quality" }, content: JSON.stringify({ stages: [{ name: "現状把握" }], checkLabel: "効果確認" }) })
    await ensureSeeded("p1", [quality] as never)
    expect(repo.upsertSettings).toHaveBeenCalledWith(TX, "p1", { trendEnabled: true })
  })
})

describe("tickCondition", () => {
  it("ticks / unticks a condition of the item's notes", async () => {
    vi.mocked(repo.findLivePlanItem).mockResolvedValue({ id: "s1", name: "仕様決定", notes: "完了条件:\n- 仕様書承認済み" })
    await svc.tickCondition("p1", "s1", { label: "仕様書承認済み", checked: true }, ACTOR)
    expect(parts.tickCondition).toHaveBeenCalledWith(TX, "s1", "仕様書承認済み", ACTOR)
    await svc.tickCondition("p1", "s1", { label: "仕様書承認済み", checked: false }, ACTOR)
    expect(parts.untickCondition).toHaveBeenCalledWith(TX, "s1", "仕様書承認済み")
  })

  it("404s for an unknown condition or a plan item outside the project", async () => {
    vi.mocked(repo.findLivePlanItem).mockResolvedValue({ id: "s1", name: "x", notes: "完了条件:\n- a" })
    await expect(svc.tickCondition("p1", "s1", { label: "b", checked: true }, ACTOR)).rejects.toMatchObject({ status: 404 })
    vi.mocked(repo.findLivePlanItem).mockResolvedValue(null)
    await expect(svc.tickCondition("p1", "zz", { label: "a", checked: true }, ACTOR)).rejects.toMatchObject({ status: 404 })
  })
})

describe("updateSettings", () => {
  it("stores a blank label as null", async () => {
    vi.mocked(repo.upsertSettings).mockResolvedValue({ projectId: "p1", checkLabel: null, budgetEnabled: false, trendEnabled: false, updatedAt: NOW })
    await svc.updateSettings("p1", { checkLabel: "" }, ACTOR)
    expect(repo.upsertSettings).toHaveBeenCalledWith(TX, "p1", { checkLabel: null })
  })
})
