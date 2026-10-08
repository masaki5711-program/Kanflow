import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/services/_shared/activity", async () => (await import("@/services/__tests__/support")).activityMock())
vi.mock("@/services/_shared/db", async () => (await import("@/services/__tests__/support")).dbMock())
vi.mock("@/services/_shared/translations", async () => (await import("@/services/__tests__/support")).translationMock())
vi.mock("@/services/releases/releases.service", () => ({ deleteReleaseItem: vi.fn(async () => undefined) }))
vi.mock("@/lib/upload/stored-files", () => ({ deleteUploadedFile: vi.fn(async () => undefined) }))
vi.mock("../improvements.repository")
vi.mock("../improvements.checks", () => ({ scheduleAutoChecks: vi.fn(async () => ({ created: 2, moved: 0 })) }))

const repo = await import("../improvements.repository")
const checks = await import("../improvements.checks")
const releases = await import("@/services/releases/releases.service")
const files = await import("@/lib/upload/stored-files")
const { ACTOR, TX, DEFAULT_DB } = await import("@/services/__tests__/support")
const svc = await import("../improvements.service")

const STATE = {
  id: "r1",
  userStory: "U",
  initiative: null,
  manualLink: null as string | null,
  releaseDate: null as Date | null,
  kaizenStage: "measuring",
  standardizedAt: null as Date | null,
  direction: "decrease",
  baselineValue: null as number | null,
  targetValue: null as number | null,
}

const row = (over: Record<string, unknown> = {}) => ({ id: "r1", pbItem: null, rollouts: [], checks: [], photos: [], kaizenStage: "measuring", annualEffectUsd: null, direction: "decrease", baselineValue: null, targetValue: null, resultValue: null, ...over })

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(repo.findItemState).mockResolvedValue({ ...STATE })
  vi.mocked(repo.findProjectType).mockResolvedValue({ projectType: "process_improvement", name: "K" })
  vi.mocked(repo.updateItem).mockResolvedValue({ id: "r1" } as never)
  vi.mocked(repo.findBoardItem).mockResolvedValue(row() as never)
  vi.mocked(repo.countSustainedChecks).mockResolvedValue(0)
})

describe("getBoard", () => {
  it("returns items with summary and rollout suggestions; a trashed source PBI is hidden", async () => {
    vi.mocked(repo.findBoardItems).mockResolvedValue([
      row({ id: "a", kaizenStage: "standardized", annualEffectUsd: 1000, pbItem: { id: "b1", deletedAt: new Date() } }),
      row({ id: "b", pbItem: { id: "b2", deletedAt: null } }),
    ] as never)
    vi.mocked(repo.findRolloutNames).mockResolvedValue(["Line 2"])
    const board = await svc.getBoard("p1")
    expect(board.items[0].pbItem).toBeNull()
    expect(board.items[1].pbItem).toMatchObject({ id: "b2", i18n: {} })
    expect(board.summary).toMatchObject({ totalAnnualEffectUsd: 1000, standardizedCount: 1, itemCount: 2 })
    expect(board.rolloutNames).toEqual(["Line 2"])
  })
})

describe("updateImprovement", () => {
  it("404s for an item outside the project", async () => {
    vi.mocked(repo.findItemState).mockResolvedValue(null)
    await expect(svc.updateImprovement("p1", "x", { metricName: "m" }, ACTOR)).rejects.toThrow("Not found")
  })

  it("writes effect fields and converts the date strings", async () => {
    await svc.updateImprovement("p1", "r1", { baselineValue: 60, targetValue: 30, resultValue: 40, standardizedAt: "", metricUnit: "分" }, ACTOR)
    expect(repo.updateItem).toHaveBeenCalledWith(TX, "p1", "r1", { baselineValue: 60, targetValue: 30, resultValue: 40, metricUnit: "分", standardizedAt: null })
  })

  it("rejects a target that is worse than the baseline (merged with the stored values)", async () => {
    vi.mocked(repo.findItemState).mockResolvedValue({ ...STATE, baselineValue: 10 })
    await expect(svc.updateImprovement("p1", "r1", { targetValue: 12 }, ACTOR)).rejects.toMatchObject({ code: "IMPROVEMENT_TARGET_DIRECTION" })
    await expect(svc.updateImprovement("p1", "r1", { targetValue: 12, direction: "increase" }, ACTOR)).resolves.toBeDefined()
  })

  it("standardized needs a 標準書リンク (stored or in the same request) and stamps today", async () => {
    await expect(svc.updateImprovement("p1", "r1", { kaizenStage: "standardized" }, ACTOR)).rejects.toMatchObject({ code: "IMPROVEMENT_NEEDS_STANDARD" })
    const now = new Date(2026, 9, 2, 10)
    await svc.updateImprovement("p1", "r1", { kaizenStage: "standardized", manualLink: "https://std/1" }, ACTOR, now)
    expect(repo.updateItem).toHaveBeenLastCalledWith(TX, "p1", "r1", expect.objectContaining({ kaizenStage: "standardized", standardizedAt: new Date(Date.UTC(2026, 9, 2)) }))
  })

  it("keeps an existing 標準化日 when re-entering standardized", async () => {
    vi.mocked(repo.findItemState).mockResolvedValue({ ...STATE, kaizenStage: "deploying", manualLink: "x", standardizedAt: new Date("2026-01-01") })
    await svc.updateImprovement("p1", "r1", { kaizenStage: "standardized" }, ACTOR)
    expect(vi.mocked(repo.updateItem).mock.calls[0][3]).not.toHaveProperty("standardizedAt")
  })

  it("sustained needs a sustained check; going back is always allowed", async () => {
    await expect(svc.updateImprovement("p1", "r1", { kaizenStage: "sustained" }, ACTOR)).rejects.toMatchObject({ code: "IMPROVEMENT_NEEDS_SUSTAINED_CHECK" })
    vi.mocked(repo.countSustainedChecks).mockResolvedValue(1)
    await expect(svc.updateImprovement("p1", "r1", { kaizenStage: "sustained" }, ACTOR)).resolves.toBeDefined()
    vi.mocked(repo.findItemState).mockResolvedValue({ ...STATE, kaizenStage: "sustained" })
    await expect(svc.updateImprovement("p1", "r1", { kaizenStage: "measuring" }, ACTOR)).resolves.toBeDefined()
    await expect(svc.updateImprovement("p1", "r1", { kaizenStage: "deferred" }, ACTOR)).resolves.toBeDefined()
  })

  it("a new or changed 展開日 schedules the 定着確認; an unchanged one does not", async () => {
    await svc.updateImprovement("p1", "r1", { releaseDate: "2026-10-01" }, ACTOR)
    expect(checks.scheduleAutoChecks).toHaveBeenCalledWith(TX, "r1", new Date("2026-10-01"))
    vi.mocked(checks.scheduleAutoChecks).mockClear()
    vi.mocked(repo.findItemState).mockResolvedValue({ ...STATE, releaseDate: new Date("2026-10-01") })
    await svc.updateImprovement("p1", "r1", { releaseDate: "2026-10-01" }, ACTOR)
    await svc.updateImprovement("p1", "r1", { releaseDate: "" }, ACTOR)
    expect(checks.scheduleAutoChecks).not.toHaveBeenCalled()
  })
})

describe("deleteImprovement", () => {
  it("deletes through the release service, then removes the stored photo files", async () => {
    vi.mocked(repo.findPhotoFileNames).mockResolvedValue([{ fileName: "a.jpg" }, { fileName: "b.png" }])
    await svc.deleteImprovement("p1", "r1", ACTOR)
    expect(releases.deleteReleaseItem).toHaveBeenCalledWith("p1", "r1", ACTOR)
    expect(files.deleteUploadedFile).toHaveBeenCalledWith("p1", "a.jpg")
    expect(files.deleteUploadedFile).toHaveBeenCalledWith("p1", "b.png")
    expect(repo.findPhotoFileNames).toHaveBeenCalledWith(DEFAULT_DB, "r1")
  })

  it("404s without touching anything for an unknown item", async () => {
    vi.mocked(repo.findItemState).mockResolvedValue(null)
    await expect(svc.deleteImprovement("p1", "nope")).rejects.toThrow("Not found")
    expect(releases.deleteReleaseItem).not.toHaveBeenCalled()
  })
})

describe("createImprovement", () => {
  it("writes a staged item with the title as its story and the metric fields, then enqueues translation", async () => {
    vi.mocked(repo.insertItem).mockResolvedValue({ id: "n1", userStory: "Cut changeover" } as never)
    vi.mocked(repo.findBoardItem).mockResolvedValue(row({ id: "n1" }) as never)
    const dto = await svc.createImprovement("p1", { title: "Cut changeover", metricName: "Changeover", baselineValue: 60, targetValue: 30 }, ACTOR)
    expect(repo.insertItem).toHaveBeenCalledWith(TX, { projectId: "p1", userStory: "Cut changeover", status: "staged", metricName: "Changeover", baselineValue: 60, targetValue: 30 })
    expect(dto.id).toBe("n1")
  })

  it("rejects a target worse than the baseline before writing", async () => {
    await expect(svc.createImprovement("p1", { title: "x", baselineValue: 10, targetValue: 12 }, ACTOR)).rejects.toMatchObject({ code: "IMPROVEMENT_TARGET_DIRECTION" })
    expect(repo.insertItem).not.toHaveBeenCalled()
  })
})

describe("importFromRequests", () => {
  const req = (id: string, n: number) => ({ id, displayId: n, request: `req ${n}`, background: n === 1 ? "why" : null, assignedPo: null })

  it("creates items for requests not yet on the board and counts the skipped ones", async () => {
    vi.mocked(repo.findIceboxForImport).mockResolvedValue([req("i1", 1), req("i2", 2)] as never)
    vi.mocked(repo.findLinkedIceboxIds).mockResolvedValue(["i2"])
    vi.mocked(repo.insertItem).mockResolvedValue({ id: "n1" } as never)
    const result = await svc.importFromRequests("p1", { iceboxIds: ["i1", "i2", "i1"] }, ACTOR)
    expect(result).toEqual({ created: 1, skipped: 1 })
    expect(repo.insertItem).toHaveBeenCalledTimes(1)
    expect(repo.insertItem).toHaveBeenCalledWith(TX, { projectId: "p1", iceboxId: "i1", userStory: "req 1", poNote: "why", assignedPo: null, status: "staged" })
  })

  it("404s when none of the ids is a live request of the project", async () => {
    vi.mocked(repo.findIceboxForImport).mockResolvedValue([])
    vi.mocked(repo.findLinkedIceboxIds).mockResolvedValue([])
    await expect(svc.importFromRequests("p1", { iceboxIds: ["x"] }, ACTOR)).rejects.toMatchObject({ code: "IMPROVEMENT_NO_REQUEST" })
  })
})

describe("board project guard", () => {
  it("creating or importing on a non-improvement project is a 404", async () => {
    vi.mocked(repo.findProjectType).mockResolvedValue({ projectType: "software", name: "S" })
    await expect(svc.createImprovement("p1", { title: "x" }, ACTOR)).rejects.toMatchObject({ code: "NOT_FOUND" })
    await expect(svc.importFromRequests("p1", { iceboxIds: ["i1"] }, ACTOR)).rejects.toMatchObject({ code: "NOT_FOUND" })
  })
})
