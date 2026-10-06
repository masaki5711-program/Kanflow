import { beforeEach, describe, expect, it, vi } from "vitest"
import { ACTOR, PROJECT_ID, asRole, ctx, read, req, signedOut } from "./route-harness"

vi.mock("@/lib/auth", async () => (await import("./route-harness")).authModule)
vi.mock("@/lib/prisma", async () => (await import("./route-harness")).prismaModule)
vi.mock("@/lib/logger", async () => (await import("./route-harness")).loggerModule)
vi.mock("@/services/git/git.service", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/git/git.service")>()
  return { ...actual, addRepository: vi.fn(), updateRepository: vi.fn(), removeRepository: vi.fn() }
})

const svc = await import("@/services/git/git.service")
const listRoute = await import("@/app/api/projects/[projectId]/git/repositories/route")
const oneRoute = await import("@/app/api/projects/[projectId]/git/repositories/[repoId]/route")
const { ValidationError, NotFoundError } = await import("@/services/_shared/errors")

const REPO_ID = "repo-1"
const KNOWLEDGE_OFF = { aiKnowledge: false, aiPathFilter: null, indexedAt: null, indexedFiles: 0, indexError: null, indexErrorAt: null, indexing: false, indexPending: false }
const REPO_DTO = { id: REPO_ID, name: "API", webUrl: "https://g/x", repoPath: "x", hasOwnToken: false, tokenHint: null, syncedAt: null, lastError: null, lastErrorAt: null, ...KNOWLEDGE_OFF }

beforeEach(() => {
  vi.mocked(svc.addRepository).mockReset().mockResolvedValue(REPO_DTO)
  vi.mocked(svc.updateRepository).mockReset().mockResolvedValue({ ...REPO_DTO, reindex: false })
  vi.mocked(svc.removeRepository).mockReset().mockResolvedValue(undefined)
})

describe("POST /git/repositories", () => {
  const body = { name: "API", url: "https://gitlab.scm.service.infosys.yamaha.com/group/repo", token: "glpat-12345678" }

  it("PO / SM may add a repository (git.configure)", async () => {
    asRole("po")
    const res = await listRoute.POST(req("POST", body), ctx())
    expect(res.status).toBe(201)
    expect(await read(res)).toEqual({ status: 201, body: REPO_DTO })
    expect(svc.addRepository).toHaveBeenCalledWith(PROJECT_ID, body, ACTOR)
  })

  it("401 without a session, 404 for a non-member, 403 for a developer", async () => {
    signedOut()
    expect((await listRoute.POST(req("POST", body), ctx())).status).toBe(401)
    asRole(null)
    expect((await listRoute.POST(req("POST", body), ctx())).status).toBe(404)
    asRole("dev")
    expect((await listRoute.POST(req("POST", body), ctx())).status).toBe(403)
    expect(svc.addRepository).not.toHaveBeenCalled()
  })

  it("400 for a body failing schema (missing url)", async () => {
    asRole("po")
    expect((await listRoute.POST(req("POST", { name: "API" }), ctx())).status).toBe(400)
    expect(svc.addRepository).not.toHaveBeenCalled()
  })

  it("400 when the service refuses the URL / connection test", async () => {
    asRole("po")
    vi.mocked(svc.addRepository).mockRejectedValue(new ValidationError("リポジトリの URL を認識できません"))
    const res = await listRoute.POST(req("POST", body), ctx())
    expect(res.status).toBe(400)
  })

  it("never echoes the submitted token back in the response", async () => {
    asRole("po")
    const res = await listRoute.POST(req("POST", body), ctx())
    const text = JSON.stringify(await res.clone().json())
    expect(text).not.toContain("glpat-12345678")
  })
})

describe("PATCH /git/repositories/[repoId]", () => {
  const PI = ctx({ repoId: REPO_ID })

  it("PO / SM may rename or replace the token", async () => {
    asRole("sm")
    const res = await oneRoute.PATCH(req("PATCH", { name: "New" }), PI)
    expect(res.status).toBe(200)
    expect(svc.updateRepository).toHaveBeenCalledWith(PROJECT_ID, REPO_ID, { name: "New" }, ACTOR)
  })

  it("403 for a developer", async () => {
    asRole("dev")
    expect((await oneRoute.PATCH(req("PATCH", { name: "New" }), PI)).status).toBe(403)
    expect(svc.updateRepository).not.toHaveBeenCalled()
  })

  it("404 when the repository does not exist", async () => {
    asRole("po")
    vi.mocked(svc.updateRepository).mockRejectedValue(new NotFoundError("Repository not found"))
    expect((await oneRoute.PATCH(req("PATCH", { name: "New" }), PI)).status).toBe(404)
  })

  it("400 for a disallowed field (schema is .strict())", async () => {
    asRole("po")
    expect((await oneRoute.PATCH(req("PATCH", { url: "https://x" }), PI)).status).toBe(400)
  })
})

describe("DELETE /git/repositories/[repoId]", () => {
  const PI = ctx({ repoId: REPO_ID })

  it("PO / SM may remove a repository", async () => {
    asRole("po")
    const res = await oneRoute.DELETE(req("DELETE"), PI)
    expect(res.status).toBe(200)
    expect(svc.removeRepository).toHaveBeenCalledWith(PROJECT_ID, REPO_ID, ACTOR)
  })

  it("403 for a developer, 404 for a non-member", async () => {
    asRole("dev")
    expect((await oneRoute.DELETE(req("DELETE"), PI)).status).toBe(403)
    asRole(null)
    expect((await oneRoute.DELETE(req("DELETE"), PI)).status).toBe(404)
    expect(svc.removeRepository).not.toHaveBeenCalled()
  })

  it("404 when the repository is already gone", async () => {
    asRole("po")
    vi.mocked(svc.removeRepository).mockRejectedValue(new NotFoundError("Repository not found"))
    expect((await oneRoute.DELETE(req("DELETE"), PI)).status).toBe(404)
  })
})
