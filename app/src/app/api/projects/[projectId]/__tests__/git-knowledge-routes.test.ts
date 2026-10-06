import { beforeEach, describe, expect, it, vi } from "vitest"
import { ACTOR, PROJECT_ID, asRole, ctx, read, req, signedOut } from "./route-harness"

vi.mock("@/lib/auth", async () => (await import("./route-harness")).authModule)
vi.mock("@/lib/prisma", async () => (await import("./route-harness")).prismaModule)
vi.mock("@/lib/logger", async () => (await import("./route-harness")).loggerModule)
vi.mock("@/services/git/git.service", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/git/git.service")>()
  return { ...actual, updateRepository: vi.fn(), isGitEnabled: vi.fn() }
})
vi.mock("@/services/git/repo-knowledge.service", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/git/repo-knowledge.service")>()
  return { ...actual, findKnowledgeRepository: vi.fn() }
})
vi.mock("@/services/git/repo-index-runner", () => ({ startIndexInBackground: vi.fn(), isIndexing: () => false }))
vi.mock("@/services/git/repo-search", () => ({ listKnowledgeRepos: vi.fn() }))

const svc = await import("@/services/git/git.service")
const knowledge = await import("@/services/git/repo-knowledge.service")
const runner = await import("@/services/git/repo-index-runner")
const search = await import("@/services/git/repo-search")
const oneRoute = await import("@/app/api/projects/[projectId]/git/repositories/[repoId]/route")
const indexRoute = await import("@/app/api/projects/[projectId]/git/repositories/[repoId]/index/route")
const knowledgeRoute = await import("@/app/api/projects/[projectId]/git/knowledge/route")

const REPO_ID = "repo-1"
const PI = ctx({ repoId: REPO_ID })
const DTO = {
  id: REPO_ID, name: "仕様書", webUrl: "https://g/x", repoPath: "x", hasOwnToken: false, tokenHint: null, syncedAt: null, lastError: null, lastErrorAt: null,
  aiKnowledge: true, aiPathFilter: null, indexedAt: null, indexedFiles: 0, indexError: null, indexErrorAt: null, indexing: false, indexPending: true,
}

beforeEach(() => {
  vi.mocked(svc.updateRepository).mockReset().mockResolvedValue({ ...DTO, reindex: true })
  vi.mocked(svc.isGitEnabled).mockReset().mockResolvedValue(true)
  vi.mocked(knowledge.findKnowledgeRepository).mockReset().mockResolvedValue({ id: REPO_ID, aiKnowledge: true })
  vi.mocked(runner.startIndexInBackground).mockReset().mockReturnValue(true)
  vi.mocked(search.listKnowledgeRepos).mockReset().mockResolvedValue([])
})

describe("PATCH /git/repositories/[repoId] — AI knowledge switch", () => {
  it("PO / SM may switch it on; the import starts in the background", async () => {
    asRole("po")
    const res = await oneRoute.PATCH(req("PATCH", { aiKnowledge: true }), PI)
    expect(await read(res)).toEqual({ status: 200, body: { ...DTO, indexing: true } })
    expect(svc.updateRepository).toHaveBeenCalledWith(PROJECT_ID, REPO_ID, { aiKnowledge: true }, ACTOR)
    expect(runner.startIndexInBackground).toHaveBeenCalledWith(REPO_ID)
  })

  it("does not start an import when nothing requires one (or another one is running)", async () => {
    asRole("sm")
    vi.mocked(svc.updateRepository).mockResolvedValue({ ...DTO, aiKnowledge: false, reindex: false })
    await oneRoute.PATCH(req("PATCH", { aiKnowledge: false }), PI)
    expect(runner.startIndexInBackground).not.toHaveBeenCalled()
    vi.mocked(svc.updateRepository).mockResolvedValue({ ...DTO, reindex: true })
    vi.mocked(runner.startIndexInBackground).mockReturnValue(false)
    expect((await read(await oneRoute.PATCH(req("PATCH", { aiPathFilter: "docs/" }), PI))).body).toMatchObject({ indexing: false })
  })

  it("403 for a developer: only PO / SM decide what every member can read through the AI", async () => {
    asRole("dev")
    expect((await oneRoute.PATCH(req("PATCH", { aiKnowledge: true }), PI)).status).toBe(403)
    expect(svc.updateRepository).not.toHaveBeenCalled()
  })

  it("400 for a folder filter with traversal", async () => {
    asRole("po")
    expect((await oneRoute.PATCH(req("PATCH", { aiPathFilter: "../etc" }), PI)).status).toBe(400)
    expect(svc.updateRepository).not.toHaveBeenCalled()
  })
})

describe("POST /git/repositories/[repoId]/index (今すぐ取り込む)", () => {
  it("any member may start it (git.sync): 202", async () => {
    asRole("dev")
    const res = await indexRoute.POST(req("POST"), ctx({ repoId: "repo-a" }))
    expect(await read(res)).toEqual({ status: 202, body: { started: true } })
    expect(knowledge.findKnowledgeRepository).toHaveBeenCalledWith(PROJECT_ID, "repo-a")
  })

  it("429 when pressed again within the gap", async () => {
    asRole("po")
    expect((await indexRoute.POST(req("POST"), ctx({ repoId: "repo-b" }))).status).toBe(202)
    expect((await indexRoute.POST(req("POST"), ctx({ repoId: "repo-b" }))).status).toBe(429)
  })

  it("409 when another import is running, the switch is off, or the integration is off", async () => {
    asRole("po")
    vi.mocked(runner.startIndexInBackground).mockReturnValue(false)
    expect((await indexRoute.POST(req("POST"), ctx({ repoId: "repo-c" }))).status).toBe(409)
    vi.mocked(knowledge.findKnowledgeRepository).mockResolvedValue({ id: "repo-d", aiKnowledge: false })
    expect((await indexRoute.POST(req("POST"), ctx({ repoId: "repo-d" }))).status).toBe(409)
    vi.mocked(svc.isGitEnabled).mockResolvedValue(false)
    expect((await indexRoute.POST(req("POST"), ctx({ repoId: "repo-e" }))).status).toBe(409)
  })

  it("404 for a repository of another project (lookup is project scoped)", async () => {
    asRole("po")
    vi.mocked(knowledge.findKnowledgeRepository).mockResolvedValue(null)
    expect((await indexRoute.POST(req("POST"), ctx({ repoId: "foreign" }))).status).toBe(404)
    expect(runner.startIndexInBackground).not.toHaveBeenCalled()
  })

  it("401 without a session, 404 for a non-member", async () => {
    signedOut()
    expect((await indexRoute.POST(req("POST"), PI)).status).toBe(401)
    asRole(null)
    expect((await indexRoute.POST(req("POST"), PI)).status).toBe(404)
  })
})

describe("GET /git/knowledge", () => {
  it("gives members the names of indexed knowledge repositories only (no content, no URL)", async () => {
    asRole("dev")
    vi.mocked(search.listKnowledgeRepos).mockResolvedValue([
      { id: "r1", name: "仕様書", webUrl: "https://g/x", ref: "a", indexedFiles: 137, indexedAt: new Date("2026-10-06T00:00:00Z") },
      { id: "r2", name: "まだ", webUrl: "https://g/y", ref: "HEAD", indexedFiles: 0, indexedAt: null },
    ])
    const res = await knowledgeRoute.GET(req("GET"), ctx())
    expect(await read(res)).toEqual({ status: 200, body: { repositories: [{ name: "仕様書", indexedFiles: 137, indexedAt: "2026-10-06T00:00:00.000Z" }] } })
    expect(search.listKnowledgeRepos).toHaveBeenCalledWith(PROJECT_ID)
  })

  it("401 / 404 for outsiders", async () => {
    signedOut()
    expect((await knowledgeRoute.GET(req("GET"), ctx())).status).toBe(401)
    asRole(null)
    expect((await knowledgeRoute.GET(req("GET"), ctx())).status).toBe(404)
  })
})
