import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const projectFindFirst = vi.fn()
const gitIntegrationFindUnique = vi.fn()
const gitIntegrationUpsert = vi.fn()
const gitRepositoryFindMany = vi.fn()
const gitRepositoryCount = vi.fn()
const gitRepositoryFindFirst = vi.fn()
const gitRepositoryCreate = vi.fn()
const gitRepositoryUpdate = vi.fn()
const gitRepositoryDelete = vi.fn()
const gitLinkFindMany = vi.fn()
const productBacklogItemFindFirst = vi.fn()
const logActivityMock = vi.fn()
const repoChunkDeleteMany = vi.fn((...a: unknown[]) => ({ op: "deleteChunks", args: a }))
const transactionMock = vi.fn(async (ops: unknown[]) => Promise.all(ops))
const getProjectMock = vi.fn()
const canReadRepositoryMock = vi.fn()
const createGitLabClientMock = vi.fn((...args: unknown[]) => {
  void args // signature only; call args are asserted separately via toHaveBeenCalledWith
  return { getProject: getProjectMock, canReadRepository: canReadRepositoryMock }
})

vi.mock("@/lib/prisma", () => ({
  prisma: {
    project: { findFirst: (...a: unknown[]) => projectFindFirst(...a) },
    gitIntegration: { findUnique: (...a: unknown[]) => gitIntegrationFindUnique(...a), upsert: (...a: unknown[]) => gitIntegrationUpsert(...a) },
    gitRepository: {
      findMany: (...a: unknown[]) => gitRepositoryFindMany(...a),
      count: (...a: unknown[]) => gitRepositoryCount(...a),
      findFirst: (...a: unknown[]) => gitRepositoryFindFirst(...a),
      create: (...a: unknown[]) => gitRepositoryCreate(...a),
      update: (...a: unknown[]) => gitRepositoryUpdate(...a),
      delete: (...a: unknown[]) => gitRepositoryDelete(...a),
    },
    gitLink: { findMany: (...a: unknown[]) => gitLinkFindMany(...a) },
    repoChunk: { deleteMany: (...a: unknown[]) => repoChunkDeleteMany(...a) },
    $transaction: (ops: unknown[]) => transactionMock(ops),
    productBacklogItem: { findFirst: (...a: unknown[]) => productBacklogItemFindFirst(...a) },
  },
}))
vi.mock("@/services/_shared/activity", () => ({ logActivity: (...a: unknown[]) => logActivityMock(...a) }))
vi.mock("@/lib/git/gitlab-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/git/gitlab-client")>()
  return { ...actual, createGitLabClient: (...a: unknown[]) => createGitLabClientMock(...a) }
})

const svc = await import("../git.service")
const { open: realOpen } = await import("@/lib/secret-box")
const { GitLabError } = await import("@/lib/git/gitlab-client")

/** Partial env objects are enough for pure functions under test; NodeJS.ProcessEnv's typing requires NODE_ENV. */
const fakeEnv = (vars: Record<string, string>) => vars as unknown as NodeJS.ProcessEnv

const PROJECT_ID = "p1"
const ACTOR = { userId: "u1", userName: "Alice", systemRole: "member" }
const HOST = "gitlab.scm.service.infosys.yamaha.com"
const REPO_URL = `https://${HOST}/group/repo`

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubEnv("INTEGRATION_SECRET_KEY", "test-secret-for-git-service")
  projectFindFirst.mockResolvedValue({ id: PROJECT_ID })
  gitIntegrationFindUnique.mockResolvedValue(null)
  gitIntegrationUpsert.mockResolvedValue({})
  gitRepositoryFindMany.mockResolvedValue([])
  gitRepositoryCount.mockResolvedValue(0)
  gitRepositoryFindFirst.mockResolvedValue(null)
  gitRepositoryCreate.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ id: "repo-new", syncedAt: null, lastError: null, lastErrorAt: null, ...data }))
  gitRepositoryUpdate.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ id: "repo-1", name: "API", webUrl: REPO_URL, repoPath: "group/repo", syncedAt: null, lastError: null, lastErrorAt: null, tokenCipher: null, tokenHint: null, ...data }))
  gitLinkFindMany.mockResolvedValue([])
  productBacklogItemFindFirst.mockResolvedValue(null)
  getProjectMock.mockResolvedValue({ id: 555, web_url: REPO_URL, path_with_namespace: "group/repo", default_branch: "main" })
  canReadRepositoryMock.mockResolvedValue(true)
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe("pollIntervalSec", () => {
  it("defaults to 180 seconds when unset", () => {
    expect(svc.pollIntervalSec(fakeEnv({}))).toBe(180)
  })

  it("defaults to 180 when the value is below the 60s floor or not a number", () => {
    expect(svc.pollIntervalSec(fakeEnv({ GIT_SYNC_INTERVAL_SEC: "30" }))).toBe(180)
    expect(svc.pollIntervalSec(fakeEnv({ GIT_SYNC_INTERVAL_SEC: "nope" }))).toBe(180)
  })

  it("floors a valid value at or above 60", () => {
    expect(svc.pollIntervalSec(fakeEnv({ GIT_SYNC_INTERVAL_SEC: "90.7" }))).toBe(90)
    expect(svc.pollIntervalSec(fakeEnv({ GIT_SYNC_INTERVAL_SEC: "60" }))).toBe(60)
  })
})

describe("getGitSettings", () => {
  it("404 when the project is missing or trashed", async () => {
    projectFindFirst.mockResolvedValue(null)
    await expect(svc.getGitSettings(PROJECT_ID)).rejects.toMatchObject({ status: 404 })
  })

  it("returns disabled defaults with no token when nothing is configured", async () => {
    const settings = await svc.getGitSettings(PROJECT_ID)
    expect(settings).toMatchObject({ enabled: false, hasToken: false, tokenHint: null, autoCompleteOnMerge: false, repositories: [], pollIntervalSec: 180 })
  })

  it("never includes the token itself anywhere in the DTO", async () => {
    gitIntegrationFindUnique.mockResolvedValue({ enabled: true, tokenCipher: "v1:a:b:c", tokenHint: "ab12", autoCompleteOnMerge: true })
    const settings = await svc.getGitSettings(PROJECT_ID)
    expect(settings).toMatchObject({ enabled: true, hasToken: true, tokenHint: "ab12" })
    expect(JSON.stringify(settings)).not.toContain("v1:a:b:c")
  })

  it("maps repositories, including their own-token flag and hint, never the token", async () => {
    gitRepositoryFindMany.mockResolvedValue([
      {
        id: "r1", name: "API", webUrl: REPO_URL, repoPath: "group/repo", tokenCipher: "v1:x:y:z", tokenHint: "wxyz", syncedAt: new Date("2026-09-01T00:00:00Z"), lastError: null, lastErrorAt: null,
        aiKnowledge: true, aiPathFilter: "docs/", indexedSha: "abc", indexedAt: new Date("2026-09-02T00:00:00Z"), indexedFiles: 12, indexError: null, indexErrorAt: null, indexTargetSha: null,
      },
    ])
    const settings = await svc.getGitSettings(PROJECT_ID)
    expect(settings.repositories).toEqual([
      {
        id: "r1", name: "API", webUrl: REPO_URL, repoPath: "group/repo", hasOwnToken: true, tokenHint: "wxyz", syncedAt: "2026-09-01T00:00:00.000Z", lastError: null, lastErrorAt: null,
        aiKnowledge: true, aiPathFilter: "docs/", indexedAt: "2026-09-02T00:00:00.000Z", indexedFiles: 12, indexError: null, indexErrorAt: null, indexing: false, indexPending: false,
      },
    ])
    expect(JSON.stringify(settings)).not.toContain("v1:x:y:z")
  })
})

describe("updateGitSettings", () => {
  it("404 when the project is missing", async () => {
    projectFindFirst.mockResolvedValue(null)
    await expect(svc.updateGitSettings(PROJECT_ID, { enabled: true }, ACTOR)).rejects.toMatchObject({ status: 404 })
    expect(gitIntegrationUpsert).not.toHaveBeenCalled()
  })

  it("flips enabled and logs the boolean change (no token involved)", async () => {
    gitIntegrationFindUnique
      .mockResolvedValueOnce({ enabled: false, autoCompleteOnMerge: false }) // read for diffing
      .mockResolvedValueOnce(null) // getGitSettings() re-read at the end
    await svc.updateGitSettings(PROJECT_ID, { enabled: true }, ACTOR)
    expect(gitIntegrationUpsert).toHaveBeenCalledWith({ where: { projectId: PROJECT_ID }, create: { projectId: PROJECT_ID, enabled: true }, update: { enabled: true } })
    expect(logActivityMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ projectId: PROJECT_ID, entityType: "project", entityId: PROJECT_ID, action: "update", actor: ACTOR, diff: { changes: { "git.enabled": { from: false, to: true } } } }),
    )
  })

  it("does not log when the new value equals the old one", async () => {
    gitIntegrationFindUnique.mockResolvedValueOnce({ enabled: true, autoCompleteOnMerge: false }).mockResolvedValueOnce(null)
    await svc.updateGitSettings(PROJECT_ID, { enabled: true }, ACTOR)
    expect(logActivityMock).not.toHaveBeenCalled()
  })

  it("seals a new token, stores only its hint, and never logs or returns the plaintext", async () => {
    gitIntegrationFindUnique.mockResolvedValueOnce({ enabled: false, autoCompleteOnMerge: false }).mockResolvedValueOnce(null)
    await svc.updateGitSettings(PROJECT_ID, { token: "glpat-SuperSecretValue1234" }, ACTOR)
    const patch = gitIntegrationUpsert.mock.calls[0][0].update as { tokenCipher: string; tokenHint: string }
    expect(patch.tokenHint).toBe("1234")
    expect(realOpen(patch.tokenCipher)).toBe("glpat-SuperSecretValue1234")
    expect(logActivityMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ diff: { changes: { "git.token": { from: "•••", to: "•••" } } } }),
    )
    const loggedText = JSON.stringify(logActivityMock.mock.calls[0][1])
    expect(loggedText).not.toContain("glpat-SuperSecretValue1234")
  })

  it("removing the token (null) clears tokenCipher/tokenHint and logs 'to: null', never the old value", async () => {
    gitIntegrationFindUnique.mockResolvedValueOnce({ enabled: true, autoCompleteOnMerge: false }).mockResolvedValueOnce(null)
    await svc.updateGitSettings(PROJECT_ID, { token: null }, ACTOR)
    expect(gitIntegrationUpsert.mock.calls[0][0].update).toMatchObject({ tokenCipher: null, tokenHint: null })
    expect(logActivityMock).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ diff: { changes: { "git.token": { from: "•••", to: null } } } }))
  })

  it("omitting token leaves it untouched (no tokenCipher key in the patch)", async () => {
    gitIntegrationFindUnique.mockResolvedValueOnce({ enabled: true, autoCompleteOnMerge: false }).mockResolvedValueOnce(null)
    await svc.updateGitSettings(PROJECT_ID, { enabled: true }, ACTOR)
    expect(gitIntegrationUpsert.mock.calls[0][0].update).not.toHaveProperty("tokenCipher")
  })
})

describe("testConnection", () => {
  it("rejects a URL that is not a recognizable repository URL (no client call)", async () => {
    const result = await svc.testConnection(PROJECT_ID, "https://evil.example/group/repo", "tok")
    expect(result.ok).toBe(false)
    expect(createGitLabClientMock).not.toHaveBeenCalled()
  })

  it("fails without a usable token (none given, none saved)", async () => {
    const result = await svc.testConnection(PROJECT_ID, REPO_URL)
    expect(result).toEqual({ ok: false, error: "アクセストークンが設定されていません。" })
    expect(createGitLabClientMock).not.toHaveBeenCalled()
  })

  it("refuses a token whose owner is only a Guest, naming the role", async () => {
    getProjectMock.mockResolvedValue({ id: 555, web_url: REPO_URL, path_with_namespace: "group/repo", default_branch: "main", permissions: { project_access: null, group_access: { access_level: 10 } } })
    const result = await svc.testConnection(PROJECT_ID, REPO_URL, "given-token")
    expect(result.ok).toBe(false)
    expect(result.error).toContain("レポーター以上")
    expect(result.error).toContain("現在のロール: ゲスト")
  })

  it("refuses when the repository contents are not readable even though the project is visible", async () => {
    canReadRepositoryMock.mockResolvedValue(false)
    const result = await svc.testConnection(PROJECT_ID, REPO_URL, "given-token")
    expect(result.ok).toBe(false)
    expect(result.error).toContain("レポーター以上")
  })

  it("uses the given token over the saved integration token", async () => {
    gitIntegrationFindUnique.mockResolvedValue({ tokenCipher: "v1:should:not:be-used" })
    await svc.testConnection(PROJECT_ID, REPO_URL, "given-token")
    expect(createGitLabClientMock).toHaveBeenCalledWith(expect.objectContaining({ apiBase: `https://${HOST}`, token: "given-token" }))
  })

  it("falls back to the saved integration token when none is given", async () => {
    const sealed = (await import("@/lib/secret-box")).seal("integration-token")
    gitIntegrationFindUnique.mockResolvedValue({ tokenCipher: sealed })
    await svc.testConnection(PROJECT_ID, REPO_URL)
    expect(createGitLabClientMock).toHaveBeenCalledWith(expect.objectContaining({ token: "integration-token" }))
  })

  it("succeeds and reports the GitLab-side facts", async () => {
    const result = await svc.testConnection(PROJECT_ID, REPO_URL, "tok")
    expect(result).toEqual({ ok: true, repository: { path: "group/repo", webUrl: REPO_URL, defaultBranch: "main", externalId: 555 } })
  })

  it("maps a GitLabError to its Japanese explanation", async () => {
    getProjectMock.mockRejectedValue(new GitLabError("auth", "nope", 401))
    const result = await svc.testConnection(PROJECT_ID, REPO_URL, "tok")
    expect(result.ok).toBe(false)
    expect(result.error).toMatch(/read_api/)
  })

  it("gives a generic failure message for a non-GitLabError", async () => {
    getProjectMock.mockRejectedValue(new Error("boom"))
    const result = await svc.testConnection(PROJECT_ID, REPO_URL, "tok")
    expect(result).toEqual({ ok: false, error: "接続テストに失敗しました" })
  })
})

describe("addRepository", () => {
  const input = { name: "API", url: REPO_URL, token: "glpat-xyz" }

  it("404 when the project is missing", async () => {
    projectFindFirst.mockResolvedValue(null)
    await expect(svc.addRepository(PROJECT_ID, input, ACTOR)).rejects.toMatchObject({ status: 404 })
  })

  it("rejects an unrecognized / disallowed-host URL before touching the database", async () => {
    await expect(svc.addRepository(PROJECT_ID, { name: "X", url: "https://evil.example/g/r" }, ACTOR)).rejects.toMatchObject({ status: 400 })
    expect(gitRepositoryCount).not.toHaveBeenCalled()
  })

  it("refuses a 21st repository", async () => {
    gitRepositoryCount.mockResolvedValue(20)
    await expect(svc.addRepository(PROJECT_ID, input, ACTOR)).rejects.toMatchObject({ status: 400 })
    expect(gitRepositoryFindFirst).not.toHaveBeenCalled()
  })

  it("refuses a duplicate (same apiBase + repoPath) repository", async () => {
    gitRepositoryFindFirst.mockResolvedValue({ id: "existing" })
    await expect(svc.addRepository(PROJECT_ID, input, ACTOR)).rejects.toMatchObject({ status: 400 })
    expect(getProjectMock).not.toHaveBeenCalled()
  })

  it("refuses to save a repository the token cannot see (failed connection test)", async () => {
    getProjectMock.mockRejectedValue(new GitLabError("not_found", "nope", 404))
    await expect(svc.addRepository(PROJECT_ID, input, ACTOR)).rejects.toMatchObject({ status: 400 })
    expect(gitRepositoryCreate).not.toHaveBeenCalled()
  })

  it("creates the repository with a sealed per-repo token and logs the change without the token", async () => {
    const row = await svc.addRepository(PROJECT_ID, input, ACTOR)
    const createData = gitRepositoryCreate.mock.calls[0][0].data as Record<string, unknown>
    expect(createData).toMatchObject({ projectId: PROJECT_ID, name: "API", apiBase: `https://${HOST}`, repoPath: "group/repo", externalId: 555, sortOrder: 0 })
    expect(realOpen(createData.tokenCipher as string)).toBe("glpat-xyz")
    expect(row.hasOwnToken).toBe(true)
    const loggedText = JSON.stringify(logActivityMock.mock.calls[0][1])
    expect(loggedText).not.toContain("glpat-xyz")
    expect(logActivityMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ diff: { changes: { "git.repository": { from: null, to: "API (group/repo)" } } } }),
    )
  })

  it("creates the repository without a tokenCipher when no per-repo token is given (integration token used for the test)", async () => {
    const sealed = (await import("@/lib/secret-box")).seal("integration-token")
    gitIntegrationFindUnique.mockResolvedValue({ tokenCipher: sealed })
    await svc.addRepository(PROJECT_ID, { name: "API", url: REPO_URL }, ACTOR)
    expect(gitRepositoryCreate.mock.calls[0][0].data).not.toHaveProperty("tokenCipher")
  })

  it("sortOrder follows the current repository count", async () => {
    gitRepositoryCount.mockResolvedValue(3)
    await svc.addRepository(PROJECT_ID, input, ACTOR)
    expect(gitRepositoryCreate.mock.calls[0][0].data).toMatchObject({ sortOrder: 3 })
  })
})

describe("updateRepository", () => {
  it("404 when the repository is not found in this project", async () => {
    gitRepositoryFindFirst.mockResolvedValue(null)
    await expect(svc.updateRepository(PROJECT_ID, "r1", { name: "New" })).rejects.toMatchObject({ status: 404 })
  })

  it("renames without touching the token", async () => {
    gitRepositoryFindFirst.mockResolvedValue({ id: "r1" })
    await svc.updateRepository(PROJECT_ID, "r1", { name: "New name" })
    const data = gitRepositoryUpdate.mock.calls[0][0].data
    expect(data).toEqual({ name: "New name" })
  })

  it("replaces the token (sealed) and clears any previous error", async () => {
    gitRepositoryFindFirst.mockResolvedValue({ id: "r1" })
    await svc.updateRepository(PROJECT_ID, "r1", { token: "new-token-value" })
    const data = gitRepositoryUpdate.mock.calls[0][0].data as Record<string, unknown>
    expect(realOpen(data.tokenCipher as string)).toBe("new-token-value")
    expect(data.lastError).toBeNull()
    expect(data.lastErrorAt).toBeNull()
  })

  it("removes the token (null) and also clears the previous error", async () => {
    gitRepositoryFindFirst.mockResolvedValue({ id: "r1" })
    await svc.updateRepository(PROJECT_ID, "r1", { token: null })
    expect(gitRepositoryUpdate.mock.calls[0][0].data).toMatchObject({ tokenCipher: null, tokenHint: null, lastError: null, lastErrorAt: null })
  })
  it("switching AI knowledge on resets the index, logs who did it and asks for an import", async () => {
    gitRepositoryFindFirst.mockResolvedValue({ id: "r1", aiKnowledge: false, aiPathFilter: null })
    const result = await svc.updateRepository(PROJECT_ID, "r1", { aiKnowledge: true }, ACTOR)
    expect(gitRepositoryUpdate.mock.calls[0][0].data).toMatchObject({ aiKnowledge: true, indexedSha: null, indexedFiles: 0 })
    expect(transactionMock).not.toHaveBeenCalled()
    expect(result.reindex).toBe(true)
    expect(logActivityMock.mock.calls[0][1].diff).toEqual({ changes: { "git.aiKnowledge": { from: false, to: true } } })
  })

  it("switching it off deletes the stored passages in the same transaction", async () => {
    gitRepositoryFindFirst.mockResolvedValue({ id: "r1", aiKnowledge: true, aiPathFilter: "docs/" })
    const result = await svc.updateRepository(PROJECT_ID, "r1", { aiKnowledge: false }, ACTOR)
    expect(transactionMock).toHaveBeenCalledTimes(1)
    expect(repoChunkDeleteMany).toHaveBeenCalledWith({ where: { repositoryId: "r1" } })
    expect(result.reindex).toBe(false)
  })
})

describe("removeRepository", () => {
  it("404 when the repository is not found in this project", async () => {
    gitRepositoryFindFirst.mockResolvedValue(null)
    await expect(svc.removeRepository(PROJECT_ID, "r1", ACTOR)).rejects.toMatchObject({ status: 404 })
    expect(gitRepositoryDelete).not.toHaveBeenCalled()
  })

  it("deletes the repository and logs the removal (name + path, never a token)", async () => {
    gitRepositoryFindFirst.mockResolvedValue({ id: "r1", name: "API", repoPath: "group/repo" })
    await svc.removeRepository(PROJECT_ID, "r1", ACTOR)
    expect(gitRepositoryDelete).toHaveBeenCalledWith({ where: { id: "r1" } })
    expect(logActivityMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ diff: { changes: { "git.repository": { from: "API (group/repo)", to: null } } } }),
    )
  })
})

describe("getPbiGitPanel", () => {
  it("enabled: false when the integration is off (no PBI lookup at all)", async () => {
    expect(await svc.getPbiGitPanel(PROJECT_ID, "b1")).toEqual({ enabled: false })
    expect(productBacklogItemFindFirst).not.toHaveBeenCalled()
  })

  it("404 when the PBI is not live in this project", async () => {
    gitIntegrationFindUnique.mockResolvedValue({ enabled: true })
    productBacklogItemFindFirst.mockResolvedValue(null)
    await expect(svc.getPbiGitPanel(PROJECT_ID, "b1")).rejects.toMatchObject({ status: 404 })
  })

  it("returns the PBI key, a branch suggestion, and its links", async () => {
    gitIntegrationFindUnique.mockResolvedValue({ enabled: true })
    productBacklogItemFindFirst.mockResolvedValue({ displayId: 7, initiative: "Login form", epic: null })
    gitRepositoryFindMany.mockResolvedValue([])
    gitRepositoryCount.mockResolvedValue(2)
    gitLinkFindMany.mockResolvedValue([
      {
        id: "l1",
        kind: "mr",
        ref: "1",
        title: "t",
        url: "u",
        state: "opened",
        pipeline: null,
        author: "a",
        sourceBranch: "b",
        occurredAt: new Date("2026-09-01T00:00:00Z"),
        mergedAt: null,
        repository: { id: "r1", name: "API" },
      },
    ])
    const panel = await svc.getPbiGitPanel(PROJECT_ID, "b1")
    expect(panel.enabled).toBe(true)
    expect(panel.pbiKey).toBe("PBI-7")
    expect(panel.branchSuggestion).toBe("feature/PBI-7-login-form")
    expect(panel.hasRepositories).toBe(true)
    expect(panel.links).toHaveLength(1)
    expect(panel.links![0].occurredAt).toBe("2026-09-01T00:00:00.000Z")
  })
})

describe("summarize", () => {
  const link = (over: Partial<{ kind: string; state: string | null; pipeline: string | null; occurredAt: string }>) => ({
    kind: "mr",
    state: null,
    pipeline: null,
    occurredAt: "2026-01-01T00:00:00.000Z",
    ...over,
  })

  it("counts open and merged MRs, and branches, separately", () => {
    const result = svc.summarize([link({ state: "opened" }), link({ state: "merged" }), link({ kind: "branch" })])
    expect(result).toEqual({ openMrs: 1, mergedMrs: 1, branches: 1, pipeline: null })
  })

  it("treats 'locked' as open", () => {
    expect(svc.summarize([link({ state: "locked" })]).openMrs).toBe(1)
  })

  it("prefers the open MRs' pipeline over merged ones when both exist", () => {
    const result = svc.summarize([link({ state: "opened", pipeline: "running" }), link({ state: "merged", pipeline: "failed" })])
    expect(result.pipeline).toBe("running")
  })

  it("falls back to the most recently occurred merged MR's pipeline when nothing is open", () => {
    const result = svc.summarize([
      link({ state: "merged", pipeline: "success", occurredAt: "2026-01-01T00:00:00.000Z" }),
      link({ state: "merged", pipeline: "failed", occurredAt: "2026-02-01T00:00:00.000Z" }),
    ])
    expect(result.pipeline).toBe("failed")
  })

  it("ranks failed > running > pending-like > success among several open pipelines", () => {
    const result = svc.summarize([
      link({ state: "opened", pipeline: "success" }),
      link({ state: "opened", pipeline: "pending" }),
      link({ state: "opened", pipeline: "failed" }),
      link({ state: "opened", pipeline: "running" }),
    ])
    expect(result.pipeline).toBe("failed")
  })

  it("is null when there is no pipeline information at all", () => {
    expect(svc.summarize([link({ state: "opened", pipeline: null })]).pipeline).toBeNull()
  })
})

describe("getGitSummaries", () => {
  it("enabled: false short-circuits before any gitLink query", async () => {
    expect(await svc.getGitSummaries(PROJECT_ID, ["b1"])).toEqual({ enabled: false, summaries: {} })
    expect(gitLinkFindMany).not.toHaveBeenCalled()
  })

  it("returns no summaries (but enabled: true) for an empty id list, without querying", async () => {
    gitIntegrationFindUnique.mockResolvedValue({ enabled: true })
    expect(await svc.getGitSummaries(PROJECT_ID, [])).toEqual({ enabled: true, summaries: {} })
    expect(gitLinkFindMany).not.toHaveBeenCalled()
  })

  it("dedupes ids and caps the list at 500", async () => {
    gitIntegrationFindUnique.mockResolvedValue({ enabled: true })
    const many = Array.from({ length: 600 }, (_, i) => `b${i}`)
    await svc.getGitSummaries(PROJECT_ID, [...many, "b0"])
    const where = gitLinkFindMany.mock.calls[0][0].where
    expect(where.backlogItemId.in).toHaveLength(500)
  })

  it("groups links per PBI and summarizes each group", async () => {
    gitIntegrationFindUnique.mockResolvedValue({ enabled: true })
    gitLinkFindMany.mockResolvedValue([
      { backlogItemId: "b1", kind: "mr", state: "opened", pipeline: null, occurredAt: new Date("2026-01-01T00:00:00Z") },
      { backlogItemId: "b1", kind: "branch", state: null, pipeline: null, occurredAt: new Date("2026-01-01T00:00:00Z") },
      { backlogItemId: "b2", kind: "mr", state: "merged", pipeline: null, occurredAt: new Date("2026-01-01T00:00:00Z") },
    ])
    const { summaries } = await svc.getGitSummaries(PROJECT_ID, ["b1", "b2"])
    expect(summaries.b1).toEqual({ openMrs: 1, mergedMrs: 0, branches: 1, pipeline: null })
    expect(summaries.b2).toEqual({ openMrs: 0, mergedMrs: 1, branches: 0, pipeline: null })
  })
})

describe("getNewMrCount", () => {
  it("is off without querying while the integration is off", async () => {
    expect(await svc.getNewMrCount(PROJECT_ID, null)).toEqual({ enabled: false, count: 0 })
    expect(gitLinkFindMany).not.toHaveBeenCalled()
  })

  it("counts open MRs that were linked after the last visit, once per MR", async () => {
    gitIntegrationFindUnique.mockResolvedValue({ enabled: true })
    gitLinkFindMany.mockResolvedValue([{ repositoryId: "r1", ref: "4" }, { repositoryId: "r1", ref: "7" }])
    const since = new Date("2026-10-20T00:00:00Z")
    expect(await svc.getNewMrCount(PROJECT_ID, since)).toEqual({ enabled: true, count: 2 })
    expect(gitLinkFindMany.mock.calls[0][0]).toMatchObject({
      where: { projectId: PROJECT_ID, kind: "mr", state: { in: ["opened", "locked"] }, createdAt: { gt: since } },
      distinct: ["repositoryId", "ref"],
    })
  })

  it("counts every open MR when the viewer never visited", async () => {
    gitIntegrationFindUnique.mockResolvedValue({ enabled: true })
    await svc.getNewMrCount(PROJECT_ID, null)
    expect(gitLinkFindMany.mock.calls[0][0].where).not.toHaveProperty("createdAt")
  })
})

describe("getGitOverview", () => {
  it("enabled: false short-circuits before reading links", async () => {
    const overview = await svc.getGitOverview(PROJECT_ID)
    expect(overview).toEqual({ enabled: false, repositories: [], recent: [], pollIntervalSec: 180 })
    expect(gitLinkFindMany).not.toHaveBeenCalled()
  })

  it("lists repositories and recent activity with the owning PBI's title (initiative first)", async () => {
    gitIntegrationFindUnique.mockResolvedValue({ enabled: true })
    gitLinkFindMany.mockResolvedValue([
      {
        id: "l1",
        kind: "mr",
        ref: "1",
        title: "t",
        url: "u",
        state: "opened",
        pipeline: null,
        author: null,
        sourceBranch: null,
        occurredAt: new Date("2026-09-01T00:00:00Z"),
        mergedAt: null,
        repository: { id: "r1", name: "API" },
        backlogItem: { id: "b1", displayId: 9, initiative: "Login", userStory: "As a user..." },
      },
    ])
    const overview = await svc.getGitOverview(PROJECT_ID)
    expect(overview.enabled).toBe(true)
    expect(overview.recent[0].pbi).toEqual({ id: "b1", displayId: 9, title: "Login" })
  })

  it("falls back to the user story, then the PBI key, when there is no initiative", async () => {
    gitIntegrationFindUnique.mockResolvedValue({ enabled: true })
    gitLinkFindMany.mockResolvedValue([
      {
        id: "l1",
        kind: "mr",
        ref: "1",
        title: "t",
        url: "u",
        state: "opened",
        pipeline: null,
        author: null,
        sourceBranch: null,
        occurredAt: new Date("2026-09-01T00:00:00Z"),
        mergedAt: null,
        repository: { id: "r1", name: "API" },
        backlogItem: { id: "b1", displayId: 9, initiative: null, userStory: null },
      },
    ])
    const overview = await svc.getGitOverview(PROJECT_ID)
    expect(overview.recent[0].pbi.title).toBe("PBI-9")
  })
})
