import { beforeEach, describe, expect, it, vi } from "vitest"
import { asRole, ctx, read, req, signedOut } from "./route-harness"

vi.mock("@/lib/auth", async () => (await import("./route-harness")).authModule)
vi.mock("@/lib/prisma", async () => (await import("./route-harness")).prismaModule)
vi.mock("@/lib/logger", async () => (await import("./route-harness")).loggerModule)
vi.mock("@/services/git/git.service", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/git/git.service")>()
  return { ...actual, isGitEnabled: vi.fn(), resyncRepository: vi.fn() }
})
vi.mock("@/services/git/git-sync", () => ({ syncRepository: vi.fn() }))

const svc = await import("@/services/git/git.service")
const gitSync = await import("@/services/git/git-sync")
const route = await import("@/app/api/projects/[projectId]/git/repositories/[repoId]/resync/route")
const { NotFoundError } = await import("@/services/_shared/errors")

beforeEach(() => {
  vi.mocked(svc.isGitEnabled).mockReset().mockResolvedValue(true)
  vi.mocked(svc.resyncRepository).mockReset().mockResolvedValue(undefined)
  vi.mocked(gitSync.syncRepository).mockReset().mockResolvedValue({ repositoryId: "r", ok: true, links: 3 })
})

/** The rate limit is a module-level Map keyed by repository: each test uses its own id. */
let nextRepo = 0
const freshCtx = () => ctx({ repoId: `resync-repo-${nextRepo++}` })

describe("POST /git/repositories/[repoId]/resync (過去分を再同期)", () => {
  it("PO resets the cursors, then syncs once now", async () => {
    asRole("po")
    const c = freshCtx()
    const { repoId } = await c.params
    const res = await route.POST(req("POST"), c)
    expect(await read(res)).toEqual({ status: 200, body: { result: { repositoryId: "r", ok: true, links: 3 } } })
    expect(svc.resyncRepository).toHaveBeenCalledWith(expect.any(String), repoId, expect.objectContaining({ userId: expect.any(String) }), expect.any(Date))
    expect(gitSync.syncRepository).toHaveBeenCalledWith(repoId)
  })

  it("is for PO / SM only (git.configure): a developer gets 403", async () => {
    asRole("dev")
    expect((await route.POST(req("POST"), freshCtx())).status).toBe(403)
    expect(svc.resyncRepository).not.toHaveBeenCalled()
  })

  it("401 without a session, 404 for a non-member", async () => {
    signedOut()
    expect((await route.POST(req("POST"), freshCtx())).status).toBe(401)
    asRole(null)
    expect((await route.POST(req("POST"), freshCtx())).status).toBe(404)
    expect(svc.resyncRepository).not.toHaveBeenCalled()
  })

  it("409 when the integration is off", async () => {
    asRole("sm")
    vi.mocked(svc.isGitEnabled).mockResolvedValue(false)
    expect((await route.POST(req("POST"), freshCtx())).status).toBe(409)
    expect(svc.resyncRepository).not.toHaveBeenCalled()
  })

  it("429 when pressed again for the same repository within the gap; another repository is not affected", async () => {
    asRole("po")
    const c = freshCtx()
    expect((await route.POST(req("POST"), c)).status).toBe(200)
    expect((await route.POST(req("POST"), c)).status).toBe(429)
    expect((await route.POST(req("POST"), freshCtx())).status).toBe(200)
    expect(svc.resyncRepository).toHaveBeenCalledTimes(2)
  })

  it("404 for a repository of another project, without starting the rate-limit window", async () => {
    asRole("po")
    vi.mocked(svc.resyncRepository).mockRejectedValueOnce(new NotFoundError("Repository not found"))
    const c = freshCtx()
    expect((await route.POST(req("POST"), c)).status).toBe(404)
    expect(gitSync.syncRepository).not.toHaveBeenCalled()
    expect((await route.POST(req("POST"), c)).status).toBe(200)
  })
})
