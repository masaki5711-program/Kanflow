import { beforeEach, describe, expect, it, vi } from "vitest"
import type { DevChanges, DevCursor, DevSource, DevSourceKind } from "../dev-source"

/**
 * The sync talks to its DevSource only: it stores the source's opaque cursor
 * through the source's codec and hands it back unchanged, without parsing it.
 * A fake source with deliberately un-parsable cursors proves it.
 */
const gitRepositoryFindUnique = vi.fn()
const gitRepositoryUpdate = vi.fn()
const gitRepositoryUpdateMany = vi.fn()
const productBacklogItemFindMany = vi.fn()
const gitLinkFindUnique = vi.fn()
const gitLinkUpsert = vi.fn()
const gitLinkFindMany = vi.fn()
const gitLinkUpdateMany = vi.fn()
const gitReleaseFindMany = vi.fn()
const gitLinkFindFirst = vi.fn()
const workClaimFindMany = vi.fn()
const noopLog = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), child: () => noopLog }

vi.mock("@/lib/prisma", () => ({
  prisma: {
    gitRepository: {
      findUnique: (...a: unknown[]) => gitRepositoryFindUnique(...a),
      update: (...a: unknown[]) => gitRepositoryUpdate(...a),
      updateMany: (...a: unknown[]) => gitRepositoryUpdateMany(...a),
    },
    productBacklogItem: { findMany: (...a: unknown[]) => productBacklogItemFindMany(...a) },
    gitLink: {
      findUnique: (...a: unknown[]) => gitLinkFindUnique(...a),
      upsert: (...a: unknown[]) => gitLinkUpsert(...a),
      findMany: (...a: unknown[]) => gitLinkFindMany(...a),
      updateMany: (...a: unknown[]) => gitLinkUpdateMany(...a),
      findFirst: (...a: unknown[]) => gitLinkFindFirst(...a),
    },
    workClaim: { findMany: (...a: unknown[]) => workClaimFindMany(...a) },
    gitRelease: { findMany: (...a: unknown[]) => gitReleaseFindMany(...a), upsert: vi.fn(), deleteMany: vi.fn() },
  },
}))
vi.mock("@/lib/secret-box", () => ({ open: (sealed: string | null) => (sealed ? "token" : null) }))
vi.mock("@/lib/logger", () => ({ logger: noopLog }))
vi.mock("@/services/sprint-backlog/sprint-backlog.service", () => ({ updateTask: vi.fn() }))
vi.mock("@/services/_shared/notifications", () => ({ notify: vi.fn() }))
vi.mock("@/lib/realtime/after-commit", () => ({ publishAfterCommit: vi.fn() }))

const START = "\u0000opaque:start{not json" as DevCursor
const NEXT = "\u0000opaque:next" as DevCursor
const NOW = new Date("2026-10-01T00:00:00.000Z")

const fromRow = vi.fn(() => START)
const toRow = vi.fn((cursor: DevCursor) => ({ fakeCursorColumn: `stored(${cursor})` }))
const readChanges = vi.fn<(cursor: DevCursor, now: Date) => Promise<DevChanges>>()
const listBranches = vi.fn()
const pipelineStatus = vi.fn()
const changedPaths = vi.fn()
const connect = vi.fn()

function fakeSource(): DevSource {
  return {
    provider: "gitlab",
    locate: async () => 99,
    readChanges,
    listBranches,
    pipelineStatus,
    changedPaths,
    listReleaseTags: async () => ({ drafts: [], complete: false }),
    describeError: () => ({ kind: "fake", expected: true, message: "fake failure" }),
  }
}

const fakeKind: DevSourceKind = { provider: "gitlab", cursors: { fromRow, toRow, restart: vi.fn() }, connect }
const devSourceFor = vi.fn((provider: unknown) => {
  if (provider !== "gitlab") throw new Error(`unexpected provider ${String(provider)}`)
  return fakeKind
})
vi.mock("../dev-source", () => ({ devSourceFor: (p: unknown) => devSourceFor(p) }))

const { syncRepository } = await import("../git-sync")

const ROW = {
  id: "r1",
  projectId: "p1",
  apiBase: "https://source.example",
  repoPath: "g/r",
  externalId: null,
  tokenCipher: null,
  webUrl: "https://source.example/g/r",
  syncGeneration: 0,
  project: { deletedAt: null, gitIntegration: { enabled: true, provider: "gitlab", tokenCipher: "sealed", autoCompleteOnMerge: false } },
}

beforeEach(() => {
  vi.clearAllMocks()
  gitRepositoryFindUnique.mockResolvedValue(ROW)
  gitRepositoryUpdateMany.mockResolvedValue({ count: 1 })
  gitRepositoryUpdate.mockResolvedValue({})
  productBacklogItemFindMany.mockImplementation(async (args: { where: { displayId: { in: number[] } } }) => args.where.displayId.in.map((n) => ({ id: `b-${n}`, displayId: n })))
  gitLinkFindUnique.mockResolvedValue(null)
  gitLinkUpsert.mockResolvedValue({})
  gitLinkFindMany.mockResolvedValue([])
  gitReleaseFindMany.mockResolvedValue([])
  connect.mockImplementation(() => fakeSource())
  listBranches.mockResolvedValue({ items: [{ name: "feature/PBI-4-x", url: "https://source.example/b", headTitle: null, headAuthor: null, headCommittedAt: null }], complete: true })
  pipelineStatus.mockResolvedValue("success")
  workClaimFindMany.mockResolvedValue([])
  gitLinkFindFirst.mockResolvedValue({ outsideScopeCount: null, outsideScopePaths: null })
  changedPaths.mockResolvedValue({ paths: ["app/in/a.ts", "app/out/b.ts"], complete: true })
  readChanges.mockResolvedValue({
    mergeRequests: [{ ref: "12", title: "PBI-3 login", state: "opened", url: "https://source.example/mr/12", sourceBranch: "feature/PBI-3", author: "Dev", updatedAt: "2026-09-30T00:00:00Z", mergedAt: null }],
    freshMergeRequestRefs: new Set(["12"]),
    commits: [{ sha: "a".repeat(40), title: "PBI-5 fix", message: "PBI-5 fix", url: "https://source.example/c", author: "Dev", committedAt: "2026-09-30T00:00:00Z" }],
    cursor: NEXT,
    failures: [],
  })
})

describe("syncRepository through a DevSource", () => {
  it("connects the project's provider and hands the stored cursor to the source unchanged", async () => {
    const result = await syncRepository("r1", undefined, NOW)
    expect(result).toMatchObject({ ok: true, links: 3 })
    expect(devSourceFor).toHaveBeenCalledWith("gitlab")
    expect(connect).toHaveBeenCalledWith({ repositoryId: "r1", apiBase: "https://source.example", repoPath: "g/r", externalId: null, token: "token" }, expect.objectContaining({ gitlab: expect.any(Function) }))
    expect(fromRow).toHaveBeenCalledWith(ROW, NOW)
    expect(readChanges).toHaveBeenCalledWith(START, NOW)
  })

  it("stores exactly what the source's codec makes of the returned cursor (and the located id)", async () => {
    await syncRepository("r1", undefined, NOW)
    expect(toRow).toHaveBeenCalledTimes(1)
    expect(toRow).toHaveBeenCalledWith(NEXT)
    expect(gitRepositoryUpdateMany).toHaveBeenCalledWith({
      where: { id: "r1", syncGeneration: 0 },
      data: { externalId: 99, fakeCursorColumn: `stored(${NEXT})`, syncedAt: NOW, lastError: null, lastErrorAt: null },
    })
  })

  it("links normalized records of every listing and looks pipelines up by the source's merge request ref", async () => {
    await syncRepository("r1", undefined, NOW)
    const written = gitLinkUpsert.mock.calls.map((c) => `${c[0].create.kind}:${c[0].create.ref}:${c[0].create.backlogItemId}`)
    expect(written.sort()).toEqual(["branch:feature/PBI-4-x:b-4", `commit:${"a".repeat(40)}:b-5`, "mr:12:b-3"])
    expect(pipelineStatus).toHaveBeenCalledWith("12")
  })

  it("a failed listing reported by the source is logged once, stored with the source's message, and the cursor still saved", async () => {
    readChanges.mockResolvedValueOnce({ mergeRequests: [], freshMergeRequestRefs: new Set(), commits: [], cursor: NEXT, failures: [{ kind: "commit", error: new Error("boom") }] })
    const result = await syncRepository("r1", undefined, NOW)
    expect(result).toMatchObject({ ok: false, error: "fake" })
    expect(noopLog.warn).toHaveBeenCalledWith("git sync listing failed", { repositoryId: "r1", kind: "commit", errorKind: "fake", status: undefined })
    expect(gitRepositoryUpdateMany.mock.calls[0][0].data).toMatchObject({ fakeCursorColumn: `stored(${NEXT})`, lastError: "コミット: fake failure" })
  })

  it("W4: an open MR read in this sync is compared with the PBI's declared scope; the outside files go on its link", async () => {
    workClaimFindMany.mockResolvedValue([{ backlogItemId: "b-3", branch: "feature/PBI-3", scopes: [{ kind: "path", value: "app/in" }] }])
    const result = await syncRepository("r1", undefined, NOW)
    expect(result.ok).toBe(true)
    expect(workClaimFindMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ backlogItemId: { in: ["b-3"] } }) }))
    expect(changedPaths).toHaveBeenCalledWith("12")
    expect(gitLinkUpdateMany).toHaveBeenCalledWith({
      where: { repositoryId: "r1", kind: "mr", ref: "12", backlogItemId: "b-3" },
      data: { scopeCheckedAt: NOW, outsideScopeCount: 1, outsideScopePaths: ["app/out/b.ts"] },
    })
  })

  it("W4: no scoped claim → no changed-files request", async () => {
    await syncRepository("r1", undefined, NOW)
    expect(workClaimFindMany).toHaveBeenCalledTimes(1)
    expect(changedPaths).not.toHaveBeenCalled()
  })

  it("W4: a failed MR listing → no scope check at all (like the pipeline lookups)", async () => {
    workClaimFindMany.mockResolvedValue([{ backlogItemId: "b-3", branch: null, scopes: [{ kind: "path", value: "app/in" }] }])
    const changes = await readChanges(START, NOW)
    readChanges.mockResolvedValueOnce({ ...changes, failures: [{ kind: "mr", error: new Error("listing failed") }] })
    await syncRepository("r1", undefined, NOW)
    expect(workClaimFindMany).not.toHaveBeenCalled()
    expect(changedPaths).not.toHaveBeenCalled()
  })
})
