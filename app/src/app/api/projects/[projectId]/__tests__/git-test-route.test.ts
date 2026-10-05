import { beforeEach, describe, expect, it, vi } from "vitest"
import { PROJECT_ID, asRole, ctx, read, req, signedOut } from "./route-harness"

vi.mock("@/lib/auth", async () => (await import("./route-harness")).authModule)
vi.mock("@/lib/prisma", async () => (await import("./route-harness")).prismaModule)
vi.mock("@/lib/logger", async () => (await import("./route-harness")).loggerModule)
vi.mock("@/services/git/git.service", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/git/git.service")>()
  return { ...actual, testConnection: vi.fn() }
})

const svc = await import("@/services/git/git.service")
const route = await import("@/app/api/projects/[projectId]/git/test/route")

const URL = "https://gitlab.scm.service.infosys.yamaha.com/group/repo"

beforeEach(() => {
  vi.mocked(svc.testConnection).mockReset().mockResolvedValue({ ok: true, repository: { path: "group/repo", webUrl: URL, defaultBranch: "main", externalId: 1 } })
})

describe("POST /git/test", () => {
  it("PO / SM may test a connection (git.configure)", async () => {
    asRole("po")
    const res = await route.POST(req("POST", { url: URL, token: "glpat-abcdefgh" }), ctx())
    expect(res.status).toBe(200)
    expect(svc.testConnection).toHaveBeenCalledWith(PROJECT_ID, URL, "glpat-abcdefgh")
  })

  it("accepts a request with no token (uses the saved integration token)", async () => {
    asRole("po")
    const res = await route.POST(req("POST", { url: URL }), ctx())
    expect(res.status).toBe(200)
    expect(svc.testConnection).toHaveBeenCalledWith(PROJECT_ID, URL, undefined)
  })

  it("401 without a session, 404 for a non-member, 403 for a developer", async () => {
    signedOut()
    expect((await route.POST(req("POST", { url: URL }), ctx())).status).toBe(401)
    asRole(null)
    expect((await route.POST(req("POST", { url: URL }), ctx())).status).toBe(404)
    asRole("dev")
    expect((await route.POST(req("POST", { url: URL }), ctx())).status).toBe(403)
    expect(svc.testConnection).not.toHaveBeenCalled()
  })

  it("400 for a missing url", async () => {
    asRole("po")
    expect((await route.POST(req("POST", {}), ctx())).status).toBe(400)
    expect(svc.testConnection).not.toHaveBeenCalled()
  })

  it("surfaces { ok: false, error } from the service as a 200 (not an HTTP error)", async () => {
    asRole("po")
    vi.mocked(svc.testConnection).mockResolvedValue({ ok: false, error: "GitLab がトークンを拒否しました" })
    const res = await route.POST(req("POST", { url: URL, token: "glpat-abcdefgh" }), ctx())
    expect(await read(res)).toEqual({ status: 200, body: { ok: false, error: "GitLab がトークンを拒否しました" } })
  })

  it("never echoes the submitted token back in the response", async () => {
    asRole("po")
    const res = await route.POST(req("POST", { url: URL, token: "glpat-super-secret-token" }), ctx())
    expect(JSON.stringify(await res.clone().json())).not.toContain("glpat-super-secret-token")
  })
})
