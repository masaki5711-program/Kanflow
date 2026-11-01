import { beforeEach, describe, expect, it, vi } from "vitest"

/**
 * 触る範囲 at push time (W4): the sync compares a merge request's changed files (from the
 * DevSource — mocked here) with the scope of the PBI's active claims and records the
 * outside ones on the link. A warning only; failures never fail the sync. Synthetic paths.
 */
const workClaimFindMany = vi.fn()
const gitLinkFindFirst = vi.fn()
const gitLinkUpdateMany = vi.fn()
const gitLinkFindMany = vi.fn()
const log = vi.hoisted(() => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }))

vi.mock("@/lib/prisma", () => ({
  prisma: {
    workClaim: { findMany: (...a: unknown[]) => workClaimFindMany(...a) },
    gitLink: {
      findFirst: (...a: unknown[]) => gitLinkFindFirst(...a),
      updateMany: (...a: unknown[]) => gitLinkUpdateMany(...a),
      findMany: (...a: unknown[]) => gitLinkFindMany(...a),
    },
  },
}))
vi.mock("@/lib/logger", () => ({ logger: { child: () => log } }))

const { checkMergeRequestScopes, scopeForMergeRequest, MAX_SCOPE_CHECKS, OUTSIDE_PATHS_STORED, SCOPE_CHECK_BUDGET_MS } = await import("../git-scope-check")
const REPO = { id: "r1", projectId: "p1" }

const NOW = new Date("2026-11-01T12:00:00.000Z")
const HOUR = 3_600_000
const DECLARED = new Date(NOW.getTime() - HOUR)
const changedPaths = vi.fn<(ref: string) => Promise<{ paths: string[]; complete: boolean }>>()
const source = { changedPaths }
const scoped = (backlogItemId: string, branch: string | null, values: string[]) => ({
  backlogItemId,
  branch,
  scopes: values.map((value) => ({ kind: value.startsWith("mod:") ? "module" : "path", value: value.replace(/^mod:/, ""), createdAt: DECLARED })),
})

beforeEach(() => {
  vi.clearAllMocks()
  vi.unstubAllEnvs()
  workClaimFindMany.mockResolvedValue([scoped("b1", "feat/x", ["app/src/services/dev-work"])])
  gitLinkFindFirst.mockResolvedValue({ outsideScopeCount: null, outsideScopePaths: null })
  gitLinkUpdateMany.mockResolvedValue({ count: 1 })
  gitLinkFindMany.mockResolvedValue([])
  changedPaths.mockResolvedValue({ paths: ["app/src/services/dev-work/a.ts", "app/src/services/git/git-sync.ts"], complete: true })
})

describe("checkMergeRequestScopes", () => {
  it("records the changed files outside the scope on the MR link (count, first paths, checkedAt)", async () => {
    const changed = await checkMergeRequestScopes(source, REPO, [{ ref: "7", sourceBranch: "feat/x", backlogItemId: "b1" }], NOW)
    expect(changed).toBe(1)
    expect(workClaimFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { projectId: "p1", releasedAt: null, heartbeatAt: { gte: new Date(NOW.getTime() - 4 * HOUR) }, scopes: { some: {} } },
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
    expect(await checkMergeRequestScopes(source, REPO, [{ ref: "7", sourceBranch: "feat/x", backlogItemId: "b1" }], NOW)).toBe(0)
    expect(gitLinkUpdateMany).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ outsideScopeCount: 0, outsideScopePaths: [] }) }))
  })

  it("no scoped active claim on the PBIs → not one changed-files request", async () => {
    workClaimFindMany.mockResolvedValue([])
    expect(await checkMergeRequestScopes(source, REPO, [{ ref: "7", sourceBranch: null, backlogItemId: "b1" }], NOW)).toBe(0)
    expect(changedPaths).not.toHaveBeenCalled()
    expect(gitLinkUpdateMany).not.toHaveBeenCalled()
  })

  it("a source without changedPaths → nothing read at all; no fresh MR and nothing due a recheck → no lookup", async () => {
    expect(await checkMergeRequestScopes({}, REPO, [{ ref: "7", sourceBranch: null, backlogItemId: "b1" }], NOW)).toBe(0)
    expect(workClaimFindMany).not.toHaveBeenCalled()
    expect(await checkMergeRequestScopes(source, REPO, [], NOW)).toBe(0)
    expect(changedPaths).not.toHaveBeenCalled()
  })

  it("a link checked before the PBI's current scope was declared (or never) is rechecked without a push", async () => {
    gitLinkFindMany.mockResolvedValue([{ ref: "5", sourceBranch: "feat/x", backlogItemId: "b1" }])
    changedPaths.mockResolvedValue({ paths: ["other.ts"], complete: true })
    expect(await checkMergeRequestScopes(source, REPO, [], NOW)).toBe(1)
    expect(gitLinkFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ repositoryId: "r1", kind: "mr", OR: [{ backlogItemId: "b1", OR: [{ scopeCheckedAt: null }, { scopeCheckedAt: { lt: DECLARED } }] }] }),
    }))
    expect(changedPaths).toHaveBeenCalledWith("5")
  })

  it("fresh MRs come first; a recheck of the same link is not read twice", async () => {
    gitLinkFindMany.mockResolvedValue([{ ref: "7", sourceBranch: "feat/x", backlogItemId: "b1" }, { ref: "3", sourceBranch: null, backlogItemId: "b1" }])
    await checkMergeRequestScopes(source, REPO, [{ ref: "7", sourceBranch: "feat/x", backlogItemId: "b1" }], NOW)
    expect(changedPaths.mock.calls).toEqual([["7"], ["3"]])
  })

  it(`stops at the time budget (${SCOPE_CHECK_BUDGET_MS} ms) and logs it once`, async () => {
    let t = 0
    changedPaths.mockImplementation(async () => {
      t += SCOPE_CHECK_BUDGET_MS / 2 + 1
      return { paths: ["x"], complete: true }
    })
    const candidates = Array.from({ length: 5 }, (_, i) => ({ ref: String(i + 1), sourceBranch: null, backlogItemId: "b1" }))
    await checkMergeRequestScopes(source, REPO, candidates, NOW, { clock: () => t })
    expect(changedPaths).toHaveBeenCalledTimes(2)
    expect(log.info.mock.calls.filter(([m]) => m === "git scope check bounded")).toHaveLength(1)
  })

  it("a database failure mid-way still answers the links already changed (the realtime refresh still fires)", async () => {
    gitLinkUpdateMany.mockResolvedValueOnce({ count: 1 }).mockRejectedValueOnce(new Error("db gone"))
    changedPaths.mockResolvedValue({ paths: ["other.ts"], complete: true })
    const n = await checkMergeRequestScopes(source, REPO, [{ ref: "7", sourceBranch: null, backlogItemId: "b1" }, { ref: "8", sourceBranch: null, backlogItemId: "b1" }], NOW)
    expect(n).toBe(1)
    expect(log.warn).toHaveBeenCalledWith("git scope check stopped", expect.objectContaining({ linksChanged: 1, error: "db gone" }))
  })

  it("only MRs of PBIs with a scoped claim are read; one read per MR even when it names two PBIs", async () => {
    workClaimFindMany.mockResolvedValue([scoped("b1", null, ["app"]), scoped("b2", null, ["docs"])])
    changedPaths.mockResolvedValue({ paths: ["app/x.ts", "docs/y.md"], complete: true })
    await checkMergeRequestScopes(source, REPO, [
      { ref: "7", sourceBranch: null, backlogItemId: "b1" },
      { ref: "7", sourceBranch: null, backlogItemId: "b2" },
      { ref: "8", sourceBranch: null, backlogItemId: "b3" },
    ], NOW)
    expect(changedPaths.mock.calls).toEqual([["7"]])
    expect(gitLinkUpdateMany.mock.calls.map(([a]) => [a.where.backlogItemId, a.data.outsideScopePaths]).sort()).toEqual([["b1", ["docs/y.md"]], ["b2", ["app/x.ts"]]])
  })

  it(`at most ${MAX_SCOPE_CHECKS} merge requests per sync (the newest ones)`, async () => {
    const candidates = Array.from({ length: MAX_SCOPE_CHECKS + 3 }, (_, i) => ({ ref: String(i + 1), sourceBranch: null, backlogItemId: "b1" }))
    await checkMergeRequestScopes(source, REPO, candidates, NOW)
    expect(changedPaths).toHaveBeenCalledTimes(MAX_SCOPE_CHECKS)
    expect(changedPaths).not.toHaveBeenCalledWith("1")
    expect(changedPaths).toHaveBeenCalledWith(String(MAX_SCOPE_CHECKS + 3))
  })

  it(`stores at most ${OUTSIDE_PATHS_STORED} paths, with the exact count`, async () => {
    changedPaths.mockResolvedValue({ paths: Array.from({ length: 30 }, (_, i) => `other/${i}.ts`), complete: true })
    await checkMergeRequestScopes(source, REPO, [{ ref: "7", sourceBranch: null, backlogItemId: "b1" }], NOW)
    const data = gitLinkUpdateMany.mock.calls[0][0].data
    expect(data.outsideScopeCount).toBe(30)
    expect(data.outsideScopePaths).toHaveLength(OUTSIDE_PATHS_STORED)
  })

  it("a failing lookup clears the link's old result (never shown as current), warned; the other MRs still run", async () => {
    workClaimFindMany.mockResolvedValue([scoped("b1", null, ["app"])])
    gitLinkFindFirst.mockResolvedValue({ outsideScopeCount: 3, outsideScopePaths: ["a"], scopeCheckedAt: DECLARED })
    changedPaths.mockRejectedValueOnce(new Error("GitLab down")).mockResolvedValueOnce({ paths: ["x"], complete: true })
    await checkMergeRequestScopes(source, REPO, [{ ref: "8", sourceBranch: null, backlogItemId: "b1" }, { ref: "7", sourceBranch: null, backlogItemId: "b1" }], NOW)
    expect(log.warn).toHaveBeenCalledWith("git changed-files lookup failed", expect.objectContaining({ mr: "7" }))
    expect(gitLinkUpdateMany.mock.calls.map(([a]) => [a.where.ref, a.data])).toEqual([
      ["7", { scopeCheckedAt: null, outsideScopeCount: null, outsideScopePaths: [] }],
      ["8", { scopeCheckedAt: NOW, outsideScopeCount: 1, outsideScopePaths: ["x"] }],
    ])
  })

  it("unusable changed paths (absolute / ..) are skipped and logged, never counted as outside", async () => {
    changedPaths.mockResolvedValue({ paths: ["/etc/x", "app/src/services/dev-work/a.ts"], complete: true })
    await checkMergeRequestScopes(source, REPO, [{ ref: "7", sourceBranch: null, backlogItemId: "b1" }], NOW)
    expect(gitLinkUpdateMany.mock.calls[0][0].data.outsideScopeCount).toBe(0)
    expect(log.info).toHaveBeenCalledWith("git scope check skipped unusable changed paths", expect.objectContaining({ count: 1 }))
  })

  it("a database failure is logged and answers 0 — the sync goes on", async () => {
    workClaimFindMany.mockRejectedValue(new Error("db down"))
    expect(await checkMergeRequestScopes(source, REPO, [{ ref: "7", sourceBranch: null, backlogItemId: "b1" }], NOW)).toBe(0)
    expect(log.warn).toHaveBeenCalledWith("git scope check stopped", expect.objectContaining({ repositoryId: "r1", error: "db down" }))
  })

  it("a partial listing still records what was found (logged as partial)", async () => {
    changedPaths.mockResolvedValue({ paths: ["other.ts"], complete: false })
    await checkMergeRequestScopes(source, REPO, [{ ref: "7", sourceBranch: null, backlogItemId: "b1" }], NOW)
    expect(log.info).toHaveBeenCalledWith("git scope check read part of the changed files", expect.objectContaining({ mr: "7" }))
    expect(gitLinkUpdateMany).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ outsideScopeCount: 1 }) }))
  })

  it("a link that does not exist (not written) is not touched", async () => {
    gitLinkFindFirst.mockResolvedValue(null)
    expect(await checkMergeRequestScopes(source, REPO, [{ ref: "7", sourceBranch: null, backlogItemId: "b1" }], NOW)).toBe(0)
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
