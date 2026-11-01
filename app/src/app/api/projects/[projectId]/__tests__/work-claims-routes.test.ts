import { beforeEach, describe, expect, it, vi } from "vitest"
import { PROJECT_ID, asRole, ctx, read, signedOut } from "./route-harness"

vi.mock("@/lib/auth", async () => (await import("./route-harness")).authModule)
vi.mock("@/lib/prisma", async () => (await import("./route-harness")).prismaModule)
vi.mock("@/lib/logger", async () => (await import("./route-harness")).loggerModule)
vi.mock("@/services/dev-work/dev-work.service", () => ({ listBoardClaims: vi.fn(), releaseClaim: vi.fn() }))

const svc = await import("@/services/dev-work/dev-work.service")
const listRoute = await import("@/app/api/projects/[projectId]/dev/claims/route")
const releaseRoute = await import("@/app/api/projects/[projectId]/dev/claims/[claimId]/release/route")

const LIST = { data: [], staleAfterHours: 4 }

function urlReq(path: string, method = "GET") {
  return new Request(`http://localhost/api/projects/${PROJECT_ID}${path}`, { method })
}

beforeEach(() => {
  vi.mocked(svc.listBoardClaims).mockReset().mockResolvedValue(LIST)
  vi.mocked(svc.releaseClaim).mockReset().mockResolvedValue({
    claim: { id: "c1", releasedAt: "2026-11-01T00:00:00.000Z", releaseReason: "moderator" } as never,
  })
})

describe("GET /dev/claims (担当中 for the screens)", () => {
  it("any member reads a sprint's claims in one service call; a developer may not moderate", async () => {
    asRole("dev")
    const res = await listRoute.GET(urlReq("/dev/claims?sprintId=s1"), ctx())
    expect(await read(res)).toEqual({ status: 200, body: { ...LIST, canModerate: false } })
    expect(svc.listBoardClaims).toHaveBeenCalledTimes(1)
    expect(svc.listBoardClaims).toHaveBeenCalledWith(PROJECT_ID, { sprintId: "s1" })
  })

  it.each([["po"], ["sm"]] as const)("%s may moderate (sprint.manage)", async (role) => {
    asRole(role)
    const res = await listRoute.GET(urlReq("/dev/claims?pbi=b1"), ctx())
    expect(await read(res)).toEqual({ status: 200, body: { ...LIST, canModerate: true } })
    expect(svc.listBoardClaims).toHaveBeenCalledWith(PROJECT_ID, { pbi: "b1" })
  })

  it("400 unless exactly one of sprintId / pbi", async () => {
    asRole("dev")
    expect((await listRoute.GET(urlReq("/dev/claims"), ctx())).status).toBe(400)
    expect((await listRoute.GET(urlReq("/dev/claims?sprintId=s1&pbi=b1"), ctx())).status).toBe(400)
    expect((await listRoute.GET(urlReq(`/dev/claims?pbi=${"x".repeat(65)}`), ctx())).status).toBe(400)
    expect(svc.listBoardClaims).not.toHaveBeenCalled()
  })

  it("401 without a session, 404 for a non-member (never reaches the service)", async () => {
    signedOut()
    expect((await listRoute.GET(urlReq("/dev/claims?sprintId=s1"), ctx())).status).toBe(401)
    asRole(null)
    expect((await listRoute.GET(urlReq("/dev/claims?sprintId=s1"), ctx())).status).toBe(404)
    expect(svc.listBoardClaims).not.toHaveBeenCalled()
  })

  it("an unknown PBI → 404 from the service", async () => {
    asRole("dev")
    const { NotFoundError } = await import("@/services/_shared/errors")
    vi.mocked(svc.listBoardClaims).mockRejectedValue(new NotFoundError("PBI not found", {}, "PBI_NOT_FOUND"))
    expect((await listRoute.GET(urlReq("/dev/claims?pbi=zzz"), ctx())).status).toBe(404)
  })
})

describe("POST /dev/claims/:claimId/release (moderator)", () => {
  it("a PO releases someone's claim as a moderator (session actor)", async () => {
    asRole("po")
    const res = await releaseRoute.POST(urlReq("/dev/claims/c1/release", "POST"), ctx({ claimId: "c1" }))
    expect(await read(res)).toEqual({ status: 200, body: { claim: { id: "c1", releasedAt: "2026-11-01T00:00:00.000Z", releaseReason: "moderator" } } })
    expect(svc.releaseClaim).toHaveBeenCalledWith(PROJECT_ID, "c1", expect.objectContaining({ userId: "u1" }), { canModerate: true })
  })

  it("a system admin may release too", async () => {
    asRole(null, "admin")
    expect((await releaseRoute.POST(urlReq("/dev/claims/c1/release", "POST"), ctx({ claimId: "c1" }))).status).toBe(200)
  })

  it("a developer is refused (403) before the service", async () => {
    asRole("dev")
    expect((await releaseRoute.POST(urlReq("/dev/claims/c1/release", "POST"), ctx({ claimId: "c1" }))).status).toBe(403)
    expect(svc.releaseClaim).not.toHaveBeenCalled()
  })
})
