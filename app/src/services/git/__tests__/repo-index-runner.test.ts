import { beforeEach, describe, expect, it, vi } from "vitest"

const gitRepositoryFindMany = vi.fn()
const noopLog = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), child: () => noopLog }
vi.mock("@/lib/prisma", () => ({ prisma: { gitRepository: { findMany: (...a: unknown[]) => gitRepositoryFindMany(...a) } } }))
vi.mock("@/lib/logger", () => ({ logger: noopLog }))
vi.mock("../repo-index", () => ({ indexRepository: vi.fn() }))

const { runKnowledgeTick, startIndexInBackground, isIndexing, TICK_BUDGET_MS } = await import("../repo-index-runner")
type IndexResult = import("../repo-index").IndexResult
type IndexStatus = import("../repo-index").IndexStatus

const result = (repositoryId: string, status: IndexStatus): IndexResult => ({ repositoryId, status, processed: 0, skipped: 0 })

beforeEach(() => {
  vi.clearAllMocks()
  gitRepositoryFindMany.mockResolvedValue([{ id: "r1" }, { id: "r2" }])
})

describe("runKnowledgeTick", () => {
  it("visits knowledge repositories of live, enabled projects, least recently indexed first", async () => {
    const index = vi.fn(async (id: string) => result(id, "up_to_date"))
    expect(await runKnowledgeTick(index)).toBe(2)
    expect(gitRepositoryFindMany).toHaveBeenCalledWith({
      where: { aiKnowledge: true, project: { deletedAt: null, gitIntegration: { enabled: true, provider: { in: ["gitlab"] } } } },
      select: { id: true },
      orderBy: { indexedAt: { sort: "asc", nulls: "first" } },
    })
    expect(index.mock.calls.map((c) => c[0])).toEqual(["r1", "r2"])
  })

  it("gives each repository the remaining time budget", async () => {
    const index = vi.fn(async (id: string, opts: { deadline: number }) => result(id, opts.deadline > 0 ? "done" : "failed"))
    const before = Date.now()
    await runKnowledgeTick(index)
    const deadline = index.mock.calls[0][1].deadline
    expect(deadline).toBeGreaterThanOrEqual(before)
    expect(deadline).toBeLessThanOrEqual(Date.now() + TICK_BUDGET_MS)
  })

  it("stops after a pass that ran out of time (resumed next tick)", async () => {
    const index = vi.fn(async (id: string) => result(id, "partial"))
    expect(await runKnowledgeTick(index)).toBe(1)
    expect(index).toHaveBeenCalledTimes(1)
  })

  it("does not start when the budget is already used", async () => {
    const index = vi.fn()
    expect(await runKnowledgeTick(index, 0)).toBe(0)
    expect(index).not.toHaveBeenCalled()
  })

  it("survives a database error", async () => {
    gitRepositoryFindMany.mockRejectedValue(new Error("db down"))
    expect(await runKnowledgeTick(vi.fn())).toBe(0)
    expect(noopLog.error).toHaveBeenCalled()
  })
})

describe("startIndexInBackground", () => {
  it("runs one repository at a time and reports it as indexing meanwhile", async () => {
    let finish: () => void = () => undefined
    const index = vi.fn((id: string) => new Promise<IndexResult>((resolve) => (finish = () => resolve(result(id, "done")))))
    expect(startIndexInBackground("r1", index)).toBe(true)
    expect(isIndexing("r1")).toBe(true)
    expect(startIndexInBackground("r2", index)).toBe(false)
    expect(await runKnowledgeTick(index)).toBe(0)
    finish()
    await vi.waitFor(() => expect(isIndexing("r1")).toBe(false))
    expect(startIndexInBackground("r2", vi.fn(async (id: string) => result(id, "done")))).toBe(true)
  })

  it("releases the lock when the run throws", async () => {
    await vi.waitFor(() => expect(isIndexing("r2")).toBe(false))
    expect(startIndexInBackground("r3", vi.fn().mockRejectedValue(new Error("boom")))).toBe(true)
    await vi.waitFor(() => expect(isIndexing("r3")).toBe(false))
    expect(noopLog.error).toHaveBeenCalledWith("background index failed", expect.objectContaining({ repositoryId: "r3" }))
  })
})
