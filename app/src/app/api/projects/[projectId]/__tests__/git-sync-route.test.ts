import { beforeEach, describe, expect, it, vi } from "vitest"
import { asRole, ctx, read, req, signedOut } from "./route-harness"

vi.mock("@/lib/auth", async () => (await import("./route-harness")).authModule)
vi.mock("@/lib/prisma", async () => (await import("./route-harness")).prismaModule)
vi.mock("@/lib/logger", async () => (await import("./route-harness")).loggerModule)
vi.mock("@/services/git/git.service", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/git/git.service")>()
  return { ...actual, isGitEnabled: vi.fn() }
})
vi.mock("@/services/git/git-sync", () => ({ syncProject: vi.fn() }))

const svc = await import("@/services/git/git.service")
const gitSync = await import("@/services/git/git-sync")
const route = await import("@/app/api/projects/[projectId]/git/sync/route")

beforeEach(() => {
  vi.mocked(svc.isGitEnabled).mockReset().mockResolvedValue(true)
  vi.mocked(gitSync.syncProject).mockReset().mockResolvedValue([{ repositoryId: "r1", ok: true, links: 2 }])
})

/**
 * The route keeps its "last manual sync" timestamp in a module-level Map
 * keyed by projectId (real Date.now(), not injectable). Each test that
 * reaches the rate-limit check uses its own project id so a successful call
 * in one test can never make a sibling test's "first" call look rate-limited.
 */
let nextProjectId = 0
function freshCtx() {
  return ctx({ projectId: `sync-test-${nextProjectId++}` })
}

describe("POST /git/sync", () => {
  it("any project member may trigger a sync (git.sync)", async () => {
    asRole("dev")
    const res = await route.POST(req("POST"), freshCtx())
    expect(await read(res)).toEqual({ status: 200, body: { results: [{ repositoryId: "r1", ok: true, links: 2 }] } })
    expect(gitSync.syncProject).toHaveBeenCalledWith(expect.stringMatching(/^sync-test-/))
  })

  it("401 without a session, 404 for a non-member", async () => {
    signedOut()
    expect((await route.POST(req("POST"), freshCtx())).status).toBe(401)
    asRole(null)
    expect((await route.POST(req("POST"), freshCtx())).status).toBe(404)
    expect(gitSync.syncProject).not.toHaveBeenCalled()
  })

  it("409 when the integration is off", async () => {
    asRole("po")
    vi.mocked(svc.isGitEnabled).mockResolvedValue(false)
    const res = await route.POST(req("POST"), freshCtx())
    expect(res.status).toBe(409)
    expect(gitSync.syncProject).not.toHaveBeenCalled()
  })

  it("429 when called again within the minimum gap, for the same project", async () => {
    asRole("po")
    const projectCtx = freshCtx()
    const first = await route.POST(req("POST"), projectCtx)
    expect(first.status).toBe(200)
    const second = await route.POST(req("POST"), projectCtx)
    expect(second.status).toBe(429)
    expect(gitSync.syncProject).toHaveBeenCalledTimes(1)
  })

  it("a different project is not affected by another project's recent sync", async () => {
    asRole("po")
    await route.POST(req("POST"), freshCtx())
    const res = await route.POST(req("POST"), freshCtx())
    expect(res.status).toBe(200)
  })
})
