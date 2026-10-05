import { beforeEach, describe, expect, it, vi } from "vitest"

const gitRepositoryFindUnique = vi.fn()
const gitRepositoryUpdate = vi.fn()
const gitRepositoryFindMany = vi.fn()
const productBacklogItemFindMany = vi.fn()
const gitLinkFindUnique = vi.fn()
const gitLinkUpsert = vi.fn()
const gitLinkFindMany = vi.fn()
const gitLinkDeleteMany = vi.fn()
const sprintBacklogItemFindMany = vi.fn()
const openMock = vi.fn()
const updateTaskMock = vi.fn()
const noopLog = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), child: () => noopLog }

vi.mock("@/lib/prisma", () => ({
  prisma: {
    gitRepository: {
      findUnique: (...a: unknown[]) => gitRepositoryFindUnique(...a),
      update: (...a: unknown[]) => gitRepositoryUpdate(...a),
      findMany: (...a: unknown[]) => gitRepositoryFindMany(...a),
    },
    productBacklogItem: { findMany: (...a: unknown[]) => productBacklogItemFindMany(...a) },
    gitLink: {
      findUnique: (...a: unknown[]) => gitLinkFindUnique(...a),
      upsert: (...a: unknown[]) => gitLinkUpsert(...a),
      findMany: (...a: unknown[]) => gitLinkFindMany(...a),
      deleteMany: (...a: unknown[]) => gitLinkDeleteMany(...a),
    },
    sprintBacklogItem: { findMany: (...a: unknown[]) => sprintBacklogItemFindMany(...a) },
  },
}))
vi.mock("@/lib/secret-box", () => ({ open: (...a: unknown[]) => openMock(...a) }))
vi.mock("@/lib/logger", () => ({ logger: noopLog }))
vi.mock("@/services/sprint-backlog/sprint-backlog.service", () => ({ updateTask: (...a: unknown[]) => updateTaskMock(...a) }))

const { syncRepository, syncProject, syncErrorMessage, GIT_ACTOR } = await import("../git-sync")
const { GitLabError } = await import("@/lib/git/gitlab-client")

const NOW = new Date("2026-10-01T00:00:00.000Z")

function repoRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "r1",
    projectId: "p1",
    apiBase: "https://gitlab.example",
    repoPath: "g/r",
    externalId: null,
    tokenCipher: null,
    syncCursor: null,
    project: { deletedAt: null, gitIntegration: { enabled: true, tokenCipher: "sealed-integration-token", autoCompleteOnMerge: false } },
    ...overrides,
  }
}

function emptyClient(overrides: Record<string, unknown> = {}) {
  return {
    getProject: vi.fn(),
    listMergeRequests: vi.fn().mockResolvedValue([]),
    listCommits: vi.fn().mockResolvedValue([]),
    listBranches: vi.fn().mockResolvedValue([]),
    getMergeRequestPipeline: vi.fn().mockResolvedValue(null),
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  openMock.mockImplementation((sealed: string | null) => (sealed ? `plain(${sealed})` : null))
  gitRepositoryUpdate.mockResolvedValue({})
  productBacklogItemFindMany.mockResolvedValue([])
  gitLinkFindUnique.mockResolvedValue(null)
  gitLinkUpsert.mockResolvedValue({})
  gitLinkFindMany.mockResolvedValue([])
  gitLinkDeleteMany.mockResolvedValue({ count: 0 })
  sprintBacklogItemFindMany.mockResolvedValue([])
  updateTaskMock.mockResolvedValue({})
})

describe("syncRepository — disabled paths", () => {
  it("returns disabled when the repository does not exist", async () => {
    gitRepositoryFindUnique.mockResolvedValue(null)
    const result = await syncRepository("missing", vi.fn())
    expect(result).toEqual({ repositoryId: "missing", ok: false, links: 0, error: "disabled" })
    expect(gitRepositoryUpdate).not.toHaveBeenCalled()
  })

  it("returns disabled when the project is in the trash", async () => {
    gitRepositoryFindUnique.mockResolvedValue(repoRow({ project: { deletedAt: NOW, gitIntegration: { enabled: true } } }))
    expect(await syncRepository("r1", vi.fn())).toEqual({ repositoryId: "r1", ok: false, links: 0, error: "disabled" })
  })

  it("returns disabled when the integration is switched off", async () => {
    gitRepositoryFindUnique.mockResolvedValue(repoRow({ project: { deletedAt: null, gitIntegration: { enabled: false } } }))
    expect(await syncRepository("r1", vi.fn())).toEqual({ repositoryId: "r1", ok: false, links: 0, error: "disabled" })
  })
})

describe("syncRepository — token resolution", () => {
  it("fails with kind 'token' when neither the repository nor the integration has a sealed token", async () => {
    gitRepositoryFindUnique.mockResolvedValue(repoRow({ tokenCipher: null, project: { deletedAt: null, gitIntegration: { enabled: true, tokenCipher: null } } }))
    const result = await syncRepository("r1", vi.fn())
    expect(result).toEqual({ repositoryId: "r1", ok: false, links: 0, error: "token" })
    expect(openMock).not.toHaveBeenCalled()
    expect(gitRepositoryUpdate).toHaveBeenCalledWith({
      where: { id: "r1" },
      data: { lastError: expect.stringContaining("アクセストークン"), lastErrorAt: expect.any(Date) },
    })
  })

  it("fails with kind 'token' when the sealed token cannot be opened (tampered / wrong key)", async () => {
    gitRepositoryFindUnique.mockResolvedValue(repoRow())
    openMock.mockReturnValue(null)
    expect((await syncRepository("r1", vi.fn())).error).toBe("token")
  })

  it("prefers the repository's own token over the integration token", async () => {
    gitRepositoryFindUnique.mockResolvedValue(repoRow({ tokenCipher: "sealed-repo-token" }))
    const factory = vi.fn().mockReturnValue(emptyClient())
    await syncRepository("r1", factory, NOW)
    expect(openMock).toHaveBeenCalledWith("sealed-repo-token")
    expect(factory).toHaveBeenCalledWith("https://gitlab.example", "plain(sealed-repo-token)")
  })

  it("falls back to the integration token when the repository has none", async () => {
    gitRepositoryFindUnique.mockResolvedValue(repoRow({ tokenCipher: null }))
    const factory = vi.fn().mockReturnValue(emptyClient())
    await syncRepository("r1", factory, NOW)
    expect(openMock).toHaveBeenCalledWith("sealed-integration-token")
  })
})

describe("syncRepository — externalId and watermark", () => {
  it("reuses a known externalId without calling getProject", async () => {
    gitRepositoryFindUnique.mockResolvedValue(repoRow({ externalId: 999 }))
    const client = emptyClient()
    await syncRepository("r1", () => client, NOW)
    expect(client.getProject).not.toHaveBeenCalled()
    expect(gitRepositoryUpdate).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ externalId: 999 }) }))
  })

  it("resolves externalId via getProject(repoPath) when unknown, and persists it", async () => {
    gitRepositoryFindUnique.mockResolvedValue(repoRow({ externalId: null }))
    const client = emptyClient({ getProject: vi.fn().mockResolvedValue({ id: 555, web_url: "u", path_with_namespace: "g/r", default_branch: "main" }) })
    await syncRepository("r1", () => client, NOW)
    expect(client.getProject).toHaveBeenCalledWith("g/r")
    expect(gitRepositoryUpdate).toHaveBeenCalledWith({
      where: { id: "r1" },
      data: { externalId: 555, syncedAt: NOW, syncCursor: NOW, lastError: null, lastErrorAt: null },
    })
  })

  it("first sync looks back 30 days; a later sync looks back from the stored cursor (both minus the overlap window)", async () => {
    gitRepositoryFindUnique.mockResolvedValue(repoRow({ externalId: 1, syncCursor: null }))
    const client = emptyClient()
    await syncRepository("r1", () => client, NOW)
    const sinceArg = (client.listMergeRequests as ReturnType<typeof vi.fn>).mock.calls[0][1] as Date
    const expected = new Date(NOW.getTime() - 30 * 86_400_000 - 5 * 60_000)
    expect(sinceArg).toEqual(expected)

    vi.clearAllMocks()
    openMock.mockImplementation((sealed: string | null) => (sealed ? `plain(${sealed})` : null))
    const cursor = new Date("2026-09-20T00:00:00.000Z")
    gitRepositoryFindUnique.mockResolvedValue(repoRow({ externalId: 1, syncCursor: cursor }))
    const client2 = emptyClient()
    await syncRepository("r1", () => client2, NOW)
    const sinceArg2 = (client2.listMergeRequests as ReturnType<typeof vi.fn>).mock.calls[0][1] as Date
    expect(sinceArg2).toEqual(new Date(cursor.getTime() - 5 * 60_000))
  })

  it("queries merge requests, commits, and 'pbi'-named branches for the same externalId", async () => {
    gitRepositoryFindUnique.mockResolvedValue(repoRow({ externalId: 7 }))
    const client = emptyClient()
    await syncRepository("r1", () => client, NOW)
    expect(client.listMergeRequests).toHaveBeenCalledWith(7, expect.any(Date))
    expect(client.listCommits).toHaveBeenCalledWith(7, expect.any(Date))
    expect(client.listBranches).toHaveBeenCalledWith(7, "pbi")
  })
})

describe("syncRepository — full success: links, pipelines, pruning, auto-complete", () => {
  function buildMr(iid: number, displayId: number, state = "opened") {
    return {
      iid,
      title: `PBI-${displayId} work`,
      description: null,
      state,
      web_url: `https://gitlab/mr/${iid}`,
      source_branch: `feature/PBI-${displayId}-x`,
      updated_at: NOW.toISOString(),
      merged_at: state === "merged" ? NOW.toISOString() : null,
      author: { name: "Dev" },
    }
  }

  it("resolves only PBIs that exist live in this project, writes links, and attaches pipeline status to resolved MRs", async () => {
    gitRepositoryFindUnique.mockResolvedValue(repoRow({ externalId: 7 }))
    productBacklogItemFindMany.mockResolvedValue([{ id: "b-42", displayId: 42 }])
    const client = emptyClient({
      listMergeRequests: vi.fn().mockResolvedValue([buildMr(1, 42, "merged"), buildMr(2, 999, "opened")]),
      getMergeRequestPipeline: vi.fn().mockResolvedValue("success"),
    })
    const result = await syncRepository("r1", () => client, NOW)

    // Only PBI-42 is a live PBI of the project; PBI-999 is dropped silently.
    expect(productBacklogItemFindMany).toHaveBeenCalledWith({
      where: { projectId: "p1", deletedAt: null, displayId: { in: [42, 999] } },
      select: { id: true, displayId: true },
    })
    expect(client.getMergeRequestPipeline).toHaveBeenCalledTimes(1)
    expect(client.getMergeRequestPipeline).toHaveBeenCalledWith(7, 1)
    expect(gitLinkUpsert).toHaveBeenCalledTimes(1)
    const upsertArg = gitLinkUpsert.mock.calls[0][0]
    expect(upsertArg.create).toMatchObject({ projectId: "p1", repositoryId: "r1", kind: "mr", ref: "1", backlogItemId: "b-42", pipeline: "success" })
    expect(result).toEqual({ repositoryId: "r1", ok: true, links: 1, completedTasks: 0 })
  })

  it("keeps the previous pipeline status when this sync's lookup fails", async () => {
    gitRepositoryFindUnique.mockResolvedValue(repoRow({ externalId: 7 }))
    productBacklogItemFindMany.mockResolvedValue([{ id: "b-42", displayId: 42 }])
    gitLinkFindUnique.mockResolvedValue({ state: "opened", pipeline: "running" })
    const client = emptyClient({
      listMergeRequests: vi.fn().mockResolvedValue([buildMr(1, 42, "opened")]),
      getMergeRequestPipeline: vi.fn().mockRejectedValue(new Error("pipeline lookup failed")),
    })
    await syncRepository("r1", () => client, NOW)
    expect(gitLinkUpsert.mock.calls[0][0].create.pipeline).toBe("running")
  })

  it("detects a merge request newly turning 'merged' and triggers auto-complete when enabled", async () => {
    gitRepositoryFindUnique.mockResolvedValue(
      repoRow({ externalId: 7, project: { deletedAt: null, gitIntegration: { enabled: true, tokenCipher: "sealed-integration-token", autoCompleteOnMerge: true } } }),
    )
    productBacklogItemFindMany.mockResolvedValue([{ id: "b-42", displayId: 42 }])
    gitLinkFindUnique.mockResolvedValue(null) // was not merged before
    gitLinkFindMany.mockImplementation(async (args: { where: { kind: string } }) => (args.where.kind === "mr" ? [{ state: "merged" }] : []))
    sprintBacklogItemFindMany.mockResolvedValue([{ id: "t1", sprintId: "s1" }])
    const client = emptyClient({ listMergeRequests: vi.fn().mockResolvedValue([buildMr(1, 42, "merged")]) })

    const result = await syncRepository("r1", () => client, NOW)

    expect(sprintBacklogItemFindMany).toHaveBeenCalledWith({
      where: { pbItemId: "b-42", status: "in_progress", sprint: { projectId: "p1", status: "active" } },
      select: { id: true, sprintId: true },
    })
    expect(updateTaskMock).toHaveBeenCalledWith("p1", "s1", "t1", { status: "done" }, GIT_ACTOR)
    expect(result.completedTasks).toBe(1)
  })

  it("does not auto-complete when the option is off, even if a merge request is newly merged", async () => {
    gitRepositoryFindUnique.mockResolvedValue(repoRow({ externalId: 7 })) // autoCompleteOnMerge: false
    productBacklogItemFindMany.mockResolvedValue([{ id: "b-42", displayId: 42 }])
    const client = emptyClient({ listMergeRequests: vi.fn().mockResolvedValue([buildMr(1, 42, "merged")]) })
    const result = await syncRepository("r1", () => client, NOW)
    expect(updateTaskMock).not.toHaveBeenCalled()
    expect(result.completedTasks).toBe(0)
  })

  it("does not re-trigger auto-complete for a PBI whose MR was already merged before this sync", async () => {
    gitRepositoryFindUnique.mockResolvedValue(
      repoRow({ externalId: 7, project: { deletedAt: null, gitIntegration: { enabled: true, tokenCipher: "sealed-integration-token", autoCompleteOnMerge: true } } }),
    )
    productBacklogItemFindMany.mockResolvedValue([{ id: "b-42", displayId: 42 }])
    gitLinkFindUnique.mockResolvedValue({ state: "merged", pipeline: null }) // already merged before
    const client = emptyClient({ listMergeRequests: vi.fn().mockResolvedValue([buildMr(1, 42, "merged")]) })
    await syncRepository("r1", () => client, NOW)
    expect(sprintBacklogItemFindMany).not.toHaveBeenCalled()
  })

  it("skips a task auto-complete failure and continues with the rest", async () => {
    gitRepositoryFindUnique.mockResolvedValue(
      repoRow({ externalId: 7, project: { deletedAt: null, gitIntegration: { enabled: true, tokenCipher: "sealed-integration-token", autoCompleteOnMerge: true } } }),
    )
    productBacklogItemFindMany.mockResolvedValue([{ id: "b-42", displayId: 42 }])
    gitLinkFindMany.mockImplementation(async (args: { where: { kind: string } }) => (args.where.kind === "mr" ? [{ state: "merged" }] : []))
    sprintBacklogItemFindMany.mockResolvedValue([
      { id: "t1", sprintId: "s1" },
      { id: "t2", sprintId: "s1" },
    ])
    updateTaskMock.mockRejectedValueOnce(new Error("version conflict")).mockResolvedValueOnce({})
    const client = emptyClient({ listMergeRequests: vi.fn().mockResolvedValue([buildMr(1, 42, "merged")]) })
    const result = await syncRepository("r1", () => client, NOW)
    expect(updateTaskMock).toHaveBeenCalledTimes(2)
    expect(result.completedTasks).toBe(1)
  })

  it("attaches pipelines for at most the last 25 distinct merge requests of this sync", async () => {
    gitRepositoryFindUnique.mockResolvedValue(repoRow({ externalId: 7 }))
    const mrs = Array.from({ length: 30 }, (_, i) => buildMr(i + 1, i + 1))
    productBacklogItemFindMany.mockResolvedValue(Array.from({ length: 30 }, (_, i) => ({ id: `b${i + 1}`, displayId: i + 1 })))
    const pipeline = vi.fn().mockResolvedValue("success")
    const client = emptyClient({ listMergeRequests: vi.fn().mockResolvedValue(mrs), getMergeRequestPipeline: pipeline })
    await syncRepository("r1", () => client, NOW)
    expect(pipeline).toHaveBeenCalledTimes(25)
    expect(pipeline).not.toHaveBeenCalledWith(7, 1)
    expect(pipeline).not.toHaveBeenCalledWith(7, 5)
    expect(pipeline).toHaveBeenCalledWith(7, 6)
    expect(pipeline).toHaveBeenCalledWith(7, 30)
  })

  it("prunes branch links whose branch no longer resolves to a live PBI, and keeps the rest", async () => {
    gitRepositoryFindUnique.mockResolvedValue(repoRow({ externalId: 7 }))
    productBacklogItemFindMany.mockResolvedValue([{ id: "b-42", displayId: 42 }])
    gitLinkFindMany.mockImplementation(async (args: { where: { kind: string } }) =>
      args.where.kind === "branch"
        ? [
            { id: "link-keep", ref: "feature/PBI-42-x", backlogItemId: "b-42" },
            { id: "link-stale", ref: "feature/PBI-999-gone", backlogItemId: "b-999" },
          ]
        : [],
    )
    const client = emptyClient({ listBranches: vi.fn().mockResolvedValue([{ name: "feature/PBI-42-x", web_url: "u", commit: null }]) })
    await syncRepository("r1", () => client, NOW)
    expect(gitLinkDeleteMany).toHaveBeenCalledWith({ where: { id: { in: ["link-stale"] } } })
  })

  it("does not call deleteMany when nothing is stale", async () => {
    gitRepositoryFindUnique.mockResolvedValue(repoRow({ externalId: 7 }))
    const client = emptyClient()
    await syncRepository("r1", () => client, NOW)
    expect(gitLinkDeleteMany).not.toHaveBeenCalled()
  })

  it("skips the gitLink.findUnique 'before' lookup for branch and commit links (only merge requests need it)", async () => {
    gitRepositoryFindUnique.mockResolvedValue(repoRow({ externalId: 7 }))
    productBacklogItemFindMany.mockResolvedValue([{ id: "b-42", displayId: 42 }])
    const client = emptyClient({ listBranches: vi.fn().mockResolvedValue([{ name: "feature/PBI-42-x", web_url: "u", commit: null }]) })
    await syncRepository("r1", () => client, NOW)
    expect(gitLinkFindUnique).not.toHaveBeenCalled()
    expect(gitLinkUpsert).toHaveBeenCalledTimes(1)
  })
})

describe("syncRepository — error handling", () => {
  it("maps a GitLabError to its kind and the Japanese explanation, and records lastError", async () => {
    gitRepositoryFindUnique.mockResolvedValue(repoRow({ externalId: 7 }))
    const client = emptyClient({ listMergeRequests: vi.fn().mockRejectedValue(new GitLabError("auth", "nope", 401)) })
    const result = await syncRepository("r1", () => client, NOW)
    expect(result.ok).toBe(false)
    expect(result.error).toBe("auth")
    expect(gitRepositoryUpdate).toHaveBeenCalledWith({
      where: { id: "r1" },
      data: { lastError: expect.stringContaining("read_api"), lastErrorAt: expect.any(Date) },
    })
    expect(noopLog.error).not.toHaveBeenCalled()
  })

  it("maps any other thrown error to kind 'http' and logs it", async () => {
    gitRepositoryFindUnique.mockResolvedValue(repoRow({ externalId: 7 }))
    const client = emptyClient({ listMergeRequests: vi.fn().mockRejectedValue(new Error("boom")) })
    const result = await syncRepository("r1", () => client, NOW)
    expect(result.error).toBe("http")
    expect(noopLog.error).toHaveBeenCalledWith("git sync failed", { repositoryId: "r1", error: "boom" })
  })

  it("does not propagate a failure to persist lastError (best effort)", async () => {
    gitRepositoryFindUnique.mockResolvedValue(repoRow({ externalId: 7 }))
    gitRepositoryUpdate.mockRejectedValue(new Error("db write failed"))
    const client = emptyClient({ listMergeRequests: vi.fn().mockRejectedValue(new GitLabError("network", "down")) })
    await expect(syncRepository("r1", () => client, NOW)).resolves.toMatchObject({ ok: false, error: "network" })
  })
})

describe("syncErrorMessage", () => {
  it.each([
    ["auth", /read_api/],
    ["not_found", /URL とトークン/],
    ["rate_limited", /利用制限/],
    ["network", /接続できません/],
  ] as const)("explains kind %s in Japanese", (kind, pattern) => {
    expect(syncErrorMessage(new GitLabError(kind, "x", 1))).toMatch(pattern)
  })

  it("falls back to a generic message including the HTTP status for an unknown kind", () => {
    expect(syncErrorMessage(new GitLabError("http", "x", 503))).toContain("503")
  })

  it("falls back to a generic message for a non-GitLabError", () => {
    expect(syncErrorMessage(new Error("whatever"))).toBe("同期中にエラーが発生しました")
  })
})

describe("syncProject", () => {
  it("syncs every repository of the project, in sortOrder, and returns the results in the same order", async () => {
    gitRepositoryFindMany.mockResolvedValue([{ id: "r1" }, { id: "r2" }])
    gitRepositoryFindUnique.mockResolvedValue(null) // each repo sync resolves "disabled" (simplest end-to-end path)
    const results = await syncProject("p1", vi.fn())
    expect(gitRepositoryFindMany).toHaveBeenCalledWith({ where: { projectId: "p1" }, select: { id: true }, orderBy: { sortOrder: "asc" } })
    expect(results).toEqual([
      { repositoryId: "r1", ok: false, links: 0, error: "disabled" },
      { repositoryId: "r2", ok: false, links: 0, error: "disabled" },
    ])
  })

  it("returns an empty array when the project has no repositories", async () => {
    gitRepositoryFindMany.mockResolvedValue([])
    expect(await syncProject("p1", vi.fn())).toEqual([])
  })
})
