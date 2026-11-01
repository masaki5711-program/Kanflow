import { beforeEach, describe, expect, it, vi } from "vitest"

/**
 * 触る範囲 at push time (W4): the sync compares a merge request's changed files (from the
 * DevSource — mocked here) with the scope of the PBI's active claims and records the
 * outside ones on the link. A warning only; failures never fail the sync. Synthetic paths.
 */
const workClaimFindMany = vi.fn()
const gitLinkFindFirst = vi.fn()
const gitLinkUpdateMany = vi.fn()
const log = vi.hoisted(() => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }))

vi.mock("@/lib/prisma", () => ({
  prisma: {
    workClaim: { findMany: (...a: unknown[]) => workClaimFindMany(...a) },
    gitLink: { findFirst: (...a: unknown[]) => gitLinkFindFirst(...a), updateMany: (...a: unknown[]) => gitLinkUpdateMany(...a) },
  },
}))
vi.mock("@/lib/logger", () => ({ logger: { child: () => log } }))

const { checkMergeRequestScopes, scopeForMergeRequest, MAX_SCOPE_CHECKS, OUTSIDE_PATHS_STORED } = await import("../git-scope-check")

const NOW = new Date("2026-11-01T12:00:00.000Z")
const HOUR = 3_600_000
const changedPaths = vi.fn<(ref: string) => Promise<{ paths: string[]; complete: boolean }>>()
const source = { changedPaths }
const scoped = (backlogItemId: string, branch: string | null, values: string[]) => ({
  backlogItemId,
  branch,
  scopes: values.map((value) => ({ kind: value.startsWith("mod:") ? "module" : "path", value: value.replace(/^mod:/, "") })),
})

beforeEach(() => {
  vi.clearAllMocks()
  vi.unstubAllEnvs()
  workClaimFindMany.mockResolvedValue([scoped("b1", "feat/x", ["app/src/services/dev-work"])])
  gitLinkFindFirst.mockResolvedValue({ outsideScopeCount: null, outsideScopePaths: null })
  gitLinkUpdateMany.mockResolvedValue({ count: 1 })
  changedPaths.mockResolvedValue({ paths: ["app/src/services/dev-work/a.ts", "app/src/services/git/git-sync.ts"], complete: true })
})

describe("checkMergeRequestScopes", () => {
  it("records the changed files outside the scope on the MR link (count, first paths, checkedAt)", async () => {
    const changed = await checkMergeRequestScopes(source, "r1", [{ ref: "7", sourceBranch: "feat/x", backlogItemId: "b1" }], NOW)
    expect(changed).toBe(1)
    expect(workClaimFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { backlogItemId: { in: ["b1"] }, releasedAt: null, heartbeatAt: { gte: new Date(NOW.getTime() - 4 * HOUR) }, scopes: { some: {} } },
    }))
    expect(changedPaths).toHaveBeenCalledWith("7")
    expect(gitLinkUpdateMany).toHaveBeenCalledWith({
      where: { repositoryId: "r1", kind: "mr", ref: "7", backlogItemId: "b1" },
      data: { scopeCheckedAt: NOW, outsideScopeCount: 1, outsideScopePaths: ["app/src/services/git/git-sync.ts"] },
    })
  })

  it("all files inside: count 0 is recorded (the warning clears); unchanged → not counted as a change", async () => {
    changedPaths.mockResolvedValue({ paths: ["app/src/services/dev-work/a.ts"], complete: true })
    gitLinkFindFirst.mockResolvedValue({ outsideScopeCount: 0, outsideScopePaths: [] })
    expect(await checkMergeRequestScopes(source, "r1", [{ ref: "7", sourceBranch: "feat/x", backlogItemId: "b1" }], NOW)).toBe(0)
    expect(gitLinkUpdateMany).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ outsideScopeCount: 0, outsideScopePaths: [] }) }))
  })

  it("no scoped active claim on the PBIs → not one changed-files request", async () => {
    workClaimFindMany.mockResolvedValue([])
    expect(await checkMergeRequestScopes(source, "r1", [{ ref: "7", sourceBranch: null, backlogItemId: "b1" }], NOW)).toBe(0)
    expect(changedPaths).not.toHaveBeenCalled()
    expect(gitLinkUpdateMany).not.toHaveBeenCalled()
  })

  it("no candidates, or a source without changedPaths → nothing read at all", async () => {
    expect(await checkMergeRequestScopes(source, "r1", [], NOW)).toBe(0)
    expect(await checkMergeRequestScopes({}, "r1", [{ ref: "7", sourceBranch: null, backlogItemId: "b1" }], NOW)).toBe(0)
    expect(workClaimFindMany).not.toHaveBeenCalled()
  })

  it("only MRs of PBIs with a scoped claim are read; one read per MR even when it names two PBIs", async () => {
    workClaimFindMany.mockResolvedValue([scoped("b1", null, ["app"]), scoped("b2", null, ["docs"])])
    changedPaths.mockResolvedValue({ paths: ["app/x.ts", "docs/y.md"], complete: true })
    await checkMergeRequestScopes(source, "r1", [
      { ref: "7", sourceBranch: null, backlogItemId: "b1" },
      { ref: "7", sourceBranch: null, backlogItemId: "b2" },
      { ref: "8", sourceBranch: null, backlogItemId: "b3" },
    ], NOW)
    expect(changedPaths.mock.calls).toEqual([["7"]])
    expect(gitLinkUpdateMany.mock.calls.map(([a]) => [a.where.backlogItemId, a.data.outsideScopePaths])).toEqual([["b1", ["docs/y.md"]], ["b2", ["app/x.ts"]]])
  })

  it(`at most ${MAX_SCOPE_CHECKS} merge requests per sync (the newest ones)`, async () => {
    const candidates = Array.from({ length: MAX_SCOPE_CHECKS + 3 }, (_, i) => ({ ref: String(i + 1), sourceBranch: null, backlogItemId: "b1" }))
    await checkMergeRequestScopes(source, "r1", candidates, NOW)
    expect(changedPaths).toHaveBeenCalledTimes(MAX_SCOPE_CHECKS)
    expect(changedPaths).not.toHaveBeenCalledWith("1")
    expect(changedPaths).toHaveBeenCalledWith(String(MAX_SCOPE_CHECKS + 3))
  })

  it(`stores at most ${OUTSIDE_PATHS_STORED} paths, with the exact count`, async () => {
    changedPaths.mockResolvedValue({ paths: Array.from({ length: 30 }, (_, i) => `other/${i}.ts`), complete: true })
    await checkMergeRequestScopes(source, "r1", [{ ref: "7", sourceBranch: null, backlogItemId: "b1" }], NOW)
    const data = gitLinkUpdateMany.mock.calls[0][0].data
    expect(data.outsideScopeCount).toBe(30)
    expect(data.outsideScopePaths).toHaveLength(OUTSIDE_PATHS_STORED)
  })

  it("a failing changed-files lookup keeps the link's last check (warned) and the other MRs still run", async () => {
    workClaimFindMany.mockResolvedValue([scoped("b1", null, ["app"])])
    changedPaths.mockRejectedValueOnce(new Error("GitLab down")).mockResolvedValueOnce({ paths: ["x"], complete: true })
    await checkMergeRequestScopes(source, "r1", [{ ref: "7", sourceBranch: null, backlogItemId: "b1" }, { ref: "8", sourceBranch: null, backlogItemId: "b1" }], NOW)
    expect(log.warn).toHaveBeenCalledWith("git changed-files lookup failed", expect.objectContaining({ mr: "7" }))
    expect(gitLinkUpdateMany).toHaveBeenCalledTimes(1)
    expect(gitLinkUpdateMany.mock.calls[0][0].where.ref).toBe("8")
  })

  it("a database failure is logged and answers 0 — the sync goes on", async () => {
    workClaimFindMany.mockRejectedValue(new Error("db down"))
    expect(await checkMergeRequestScopes(source, "r1", [{ ref: "7", sourceBranch: null, backlogItemId: "b1" }], NOW)).toBe(0)
    expect(log.warn).toHaveBeenCalledWith("git scope check skipped", expect.objectContaining({ repositoryId: "r1", error: "db down" }))
  })

  it("a partial listing still records what was found (logged as partial)", async () => {
    changedPaths.mockResolvedValue({ paths: ["other.ts"], complete: false })
    await checkMergeRequestScopes(source, "r1", [{ ref: "7", sourceBranch: null, backlogItemId: "b1" }], NOW)
    expect(log.info).toHaveBeenCalledWith("git scope check read part of the changed files", expect.objectContaining({ mr: "7" }))
    expect(gitLinkUpdateMany).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ outsideScopeCount: 1 }) }))
  })

  it("a link that does not exist (not written) is not touched", async () => {
    gitLinkFindFirst.mockResolvedValue(null)
    expect(await checkMergeRequestScopes(source, "r1", [{ ref: "7", sourceBranch: null, backlogItemId: "b1" }], NOW)).toBe(0)
    expect(gitLinkUpdateMany).not.toHaveBeenCalled()
  })
})

describe("scopeForMergeRequest", () => {
  const claims = [scoped("b1", "feat/a", ["app"]), scoped("b1", "feat/b", ["docs"]), scoped("b1", null, ["mod:core"])]

  it("the claims on the MR's source branch when there are any", () => {
    expect(scopeForMergeRequest(claims, "feat/b")).toEqual([{ kind: "path", value: "docs" }])
  })

  it("otherwise every scoped claim of the PBI together", () => {
    expect(scopeForMergeRequest(claims, "feat/zzz")).toEqual([{ kind: "path", value: "app" }, { kind: "path", value: "docs" }, { kind: "module", value: "core" }])
    expect(scopeForMergeRequest(claims, null)).toHaveLength(3)
  })
})
