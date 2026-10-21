import { beforeEach, describe, expect, it, vi } from "vitest"
import { PROJECT_ID, asRole, ctx, read, req, signedOut } from "./route-harness"

vi.mock("@/lib/auth", async () => (await import("./route-harness")).authModule)
vi.mock("@/lib/prisma", async () => (await import("./route-harness")).prismaModule)
vi.mock("@/lib/logger", async () => (await import("./route-harness")).loggerModule)
vi.mock("@/services/git/git.service", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/git/git.service")>()
  return { ...actual, getPbiGitPanel: vi.fn(), getGitOverview: vi.fn(), getGitSummaries: vi.fn(), getNewMrCount: vi.fn() }
})

const svc = await import("@/services/git/git.service")
const linksRoute = await import("@/app/api/projects/[projectId]/git/links/route")
const overviewRoute = await import("@/app/api/projects/[projectId]/git/overview/route")
const summaryRoute = await import("@/app/api/projects/[projectId]/git/summary/route")

function urlReq(path: string) {
  return new Request(`http://localhost/api/projects/${PROJECT_ID}${path}`)
}

beforeEach(() => {
  vi.mocked(svc.getPbiGitPanel).mockReset().mockResolvedValue({ enabled: true, pbiKey: "PBI-1", links: [] })
  vi.mocked(svc.getGitOverview).mockReset().mockResolvedValue({ enabled: true, repositories: [], recent: [], pollIntervalSec: 180 })
  vi.mocked(svc.getGitSummaries).mockReset().mockResolvedValue({ enabled: true, summaries: {} })
})

describe("GET /git/links", () => {
  it("any member may read a PBI's development panel", async () => {
    asRole("dev")
    const res = await linksRoute.GET(urlReq("/git/links?pbiId=b1"), ctx())
    expect(res.status).toBe(200)
    expect(svc.getPbiGitPanel).toHaveBeenCalledWith(PROJECT_ID, "b1")
  })

  it("400 when pbiId is missing", async () => {
    asRole("dev")
    const res = await linksRoute.GET(urlReq("/git/links"), ctx())
    expect(res.status).toBe(400)
    expect(svc.getPbiGitPanel).not.toHaveBeenCalled()
  })

  it("401 without a session, 404 for a non-member", async () => {
    signedOut()
    expect((await linksRoute.GET(urlReq("/git/links?pbiId=b1"), ctx())).status).toBe(401)
    asRole(null)
    expect((await linksRoute.GET(urlReq("/git/links?pbiId=b1"), ctx())).status).toBe(404)
    expect(svc.getPbiGitPanel).not.toHaveBeenCalled()
  })

  it("propagates a 404 from the service (unknown PBI)", async () => {
    asRole("dev")
    const { NotFoundError } = await import("@/services/_shared/errors")
    vi.mocked(svc.getPbiGitPanel).mockRejectedValue(new NotFoundError("PBI not found"))
    expect((await linksRoute.GET(urlReq("/git/links?pbiId=missing"), ctx())).status).toBe(404)
  })
})

describe("GET /git/overview", () => {
  it("any member may read the project's Git overview", async () => {
    asRole("dev")
    const res = await overviewRoute.GET(req("GET"), ctx())
    expect(await read(res)).toEqual({ status: 200, body: { enabled: true, repositories: [], recent: [], pollIntervalSec: 180 } })
    expect(svc.getGitOverview).toHaveBeenCalledWith(PROJECT_ID)
  })

  it("401 without a session, 404 for a non-member", async () => {
    signedOut()
    expect((await overviewRoute.GET(req("GET"), ctx())).status).toBe(401)
    asRole(null)
    expect((await overviewRoute.GET(req("GET"), ctx())).status).toBe(404)
    expect(svc.getGitOverview).not.toHaveBeenCalled()
  })
})

describe("GET /git/new-mrs", () => {
  it("passes the last-visit time to the count, and null when absent or garbled", async () => {
    asRole("dev")
    vi.mocked(svc.getNewMrCount).mockResolvedValue({ enabled: true, count: 3 })
    const route = await import("@/app/api/projects/[projectId]/git/new-mrs/route")
    const res = await route.GET(urlReq("/git/new-mrs?since=2026-10-20T00:00:00.000Z"), ctx())
    expect(await read(res)).toEqual({ status: 200, body: { enabled: true, count: 3 } })
    expect(svc.getNewMrCount).toHaveBeenLastCalledWith(PROJECT_ID, new Date("2026-10-20T00:00:00.000Z"))
    await route.GET(urlReq("/git/new-mrs"), ctx())
    expect(svc.getNewMrCount).toHaveBeenLastCalledWith(PROJECT_ID, null)
    await route.GET(urlReq("/git/new-mrs?since=nonsense"), ctx())
    expect(svc.getNewMrCount).toHaveBeenLastCalledWith(PROJECT_ID, null)
  })

  it("404 for a non-member", async () => {
    asRole(null)
    const route = await import("@/app/api/projects/[projectId]/git/new-mrs/route")
    expect((await route.GET(urlReq("/git/new-mrs"), ctx())).status).toBe(404)
  })
})

describe("GET /git/summary", () => {
  it("parses a comma-separated pbiIds list, trimming blanks", async () => {
    asRole("dev")
    const res = await summaryRoute.GET(urlReq("/git/summary?pbiIds=b1, b2,, b3"), ctx())
    expect(res.status).toBe(200)
    expect(svc.getGitSummaries).toHaveBeenCalledWith(PROJECT_ID, ["b1", "b2", "b3"])
  })

  it("defaults to an empty list when pbiIds is missing", async () => {
    asRole("dev")
    await summaryRoute.GET(urlReq("/git/summary"), ctx())
    expect(svc.getGitSummaries).toHaveBeenCalledWith(PROJECT_ID, [])
  })

  it("401 without a session, 404 for a non-member", async () => {
    signedOut()
    expect((await summaryRoute.GET(urlReq("/git/summary?pbiIds=b1"), ctx())).status).toBe(401)
    asRole(null)
    expect((await summaryRoute.GET(urlReq("/git/summary?pbiIds=b1"), ctx())).status).toBe(404)
    expect(svc.getGitSummaries).not.toHaveBeenCalled()
  })
})
