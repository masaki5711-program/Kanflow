import { beforeEach, describe, expect, it, vi } from "vitest"

/** REST surface of 受入基準 (W5): authz allow AND deny, request/response shape, get_pbi shape. */
const m = vi.hoisted(() => ({
  memberFindFirst: vi.fn(),
  projectFindFirst: vi.fn(),
  projectSectionFindFirst: vi.fn(),
  loadUserAuthState: vi.fn(),
}))

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }))
vi.mock("@/lib/prisma", () => ({
  prisma: {
    projectMember: { findFirst: m.memberFindFirst },
    project: { findFirst: m.projectFindFirst },
    projectSection: { findFirst: m.projectSectionFindFirst },
  },
}))
vi.mock("@/lib/logger", () => ({ logger: { child: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }) } }))
vi.mock("@/lib/authz/session-validity", async (orig) => ({
  ...(await orig<typeof import("@/lib/authz/session-validity")>()),
  loadUserAuthState: m.loadUserAuthState,
}))
vi.mock("@/services/api-tokens/api-tokens.repository")
vi.mock("@/services/api-v1/api-v1.service")
vi.mock("@/services/api-v1/api-v1.confidential", async (orig) => ({
  ...(await orig<typeof import("@/services/api-v1/api-v1.confidential")>()),
  ...(await import("@/services/api-v1/__tests__/confidential-passthrough")).confidentialPassthrough,
}))
vi.mock("@/services/acceptance-criteria/acceptance-criteria.service")

const repo = await import("@/services/api-tokens/api-tokens.repository")
const v1 = await import("@/services/api-v1/api-v1.service")
const ac = await import("@/services/acceptance-criteria/acceptance-criteria.service")
const { generateApiToken } = await import("@/lib/api-tokens/token")
const { resetApiTokenTouchCache } = await import("@/services/api-tokens/api-token-auth")
const { resetIdempotencyStore } = await import("@/app/api/v1/_lib/v1-write")

const listRoute = await import("@/app/api/v1/projects/[projectId]/backlog/[itemId]/acceptance-criteria/route")
const itemRoute = await import("@/app/api/v1/projects/[projectId]/backlog/[itemId]/acceptance-criteria/[acRef]/route")

const token = generateApiToken()
const BASE = "http://localhost/api/v1/projects/p1/backlog/12/acceptance-criteria"
const API_ACTOR = { userId: "u1", userName: "Dev One", systemRole: "member", via: "api" as const }
const DTO = { id: "PBI-12/AC-2", seq: 2, given: null, when: null, then: null, text: "x", evidenceKind: "test" }

function send(method: string, path = "", body?: unknown, scopes = '["read","backlog:write"]'): Request {
  vi.mocked(repo.findTokenByHash).mockResolvedValue({
    id: "t1", userId: "u1", prefix: token.prefix, scopes, projectIds: null, userTokenVersion: 0, expiresAt: null, revokedAt: null, lastUsedAt: null,
  } as never)
  return new Request(`${BASE}${path}`, {
    method,
    headers: { authorization: `Bearer ${token.token}`, "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
}
const listSeg = { params: Promise.resolve({ projectId: "p1", itemId: "12" }) }
const itemSeg = { params: Promise.resolve({ projectId: "p1", itemId: "12", acRef: "AC-2" }) }
const asRole = (role: string) => m.memberFindFirst.mockResolvedValue({ role })

beforeEach(() => {
  vi.clearAllMocks()
  delete (globalThis as { __kanflowRateLimiters?: unknown }).__kanflowRateLimiters
  resetApiTokenTouchCache()
  resetIdempotencyStore()
  vi.mocked(repo.touchLastUsed).mockResolvedValue({ count: 1 })
  m.loadUserAuthState.mockResolvedValue({ isActive: true, role: "member", tokenVersion: 0 })
  m.projectFindFirst.mockResolvedValue({ id: "p1" })
  m.projectSectionFindFirst.mockResolvedValue(null)
  asRole("po")
  vi.mocked(v1.loadApiActor).mockResolvedValue(API_ACTOR)
  vi.mocked(ac.listAcceptanceCriteria).mockResolvedValue({ data: [DTO] })
  vi.mocked(ac.createAcceptanceCriterion).mockResolvedValue(DTO)
  vi.mocked(ac.updateAcceptanceCriterion).mockResolvedValue(DTO)
  vi.mocked(ac.deleteAcceptanceCriterion).mockResolvedValue({ id: "PBI-12/AC-2" })
})

describe("GET .../acceptance-criteria", () => {
  it("any project viewer reads the items (a dev too)", async () => {
    asRole("dev")
    const res = await listRoute.GET(send("GET", "", undefined, '["read"]'), listSeg)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ data: [DTO] })
    expect(ac.listAcceptanceCriteria).toHaveBeenCalledWith("p1", "12")
  })
})

describe("writes need backlog:write (scope) AND PO / SM (role)", () => {
  it.each(["po", "sm"])("%s adds (201), edits and deletes through the service with a via:api actor", async (role) => {
    asRole(role)
    const created = await listRoute.POST(send("POST", "", { given: "g", when: "w", then: "t", evidenceKind: "test" }), listSeg)
    expect(created.status).toBe(201)
    expect(await created.json()).toEqual({ data: DTO })
    expect(ac.createAcceptanceCriterion).toHaveBeenCalledWith("p1", "12", { given: "g", when: "w", then: "t", evidenceKind: "test" }, API_ACTOR)

    const edited = await itemRoute.PATCH(send("PATCH", "/AC-2", { text: "y", evidenceKind: null }), itemSeg)
    expect(edited.status).toBe(200)
    expect(ac.updateAcceptanceCriterion).toHaveBeenCalledWith("p1", "12", "AC-2", { text: "y", evidenceKind: null }, API_ACTOR)

    const deleted = await itemRoute.DELETE(send("DELETE", "/AC-2"), itemSeg)
    expect(deleted.status).toBe(200)
    expect(await deleted.json()).toEqual({ data: { id: "PBI-12/AC-2" } })
    expect(ac.deleteAcceptanceCriterion).toHaveBeenCalledWith("p1", "12", "AC-2", API_ACTOR)
  })

  it("a dev (role) is refused 403 FORBIDDEN on add / edit / delete, even with the scope", async () => {
    asRole("dev")
    for (const res of [
      await listRoute.POST(send("POST", "", { text: "x" }), listSeg),
      await itemRoute.PATCH(send("PATCH", "/AC-2", { text: "x" }), itemSeg),
      await itemRoute.DELETE(send("DELETE", "/AC-2"), itemSeg),
    ]) {
      expect(res.status).toBe(403)
      expect(await res.json()).toEqual({ error: "Forbidden", code: "FORBIDDEN" })
    }
    expect(ac.createAcceptanceCriterion).not.toHaveBeenCalled()
    expect(ac.updateAcceptanceCriterion).not.toHaveBeenCalled()
    expect(ac.deleteAcceptanceCriterion).not.toHaveBeenCalled()
  })

  it("a PO whose token lacks backlog:write is refused 403 INSUFFICIENT_SCOPE", async () => {
    const res = await listRoute.POST(send("POST", "", { text: "x" }, '["read"]'), listSeg)
    expect(res.status).toBe(403)
    expect(await res.json()).toMatchObject({ code: "INSUFFICIENT_SCOPE", requiredScope: "backlog:write" })
    expect(ac.createAcceptanceCriterion).not.toHaveBeenCalled()
  })

  it("rejects an unknown evidenceKind with 400 before the service", async () => {
    const res = await listRoute.POST(send("POST", "", { text: "x", evidenceKind: "vibes" }), listSeg)
    expect(res.status).toBe(400)
    expect(ac.createAcceptanceCriterion).not.toHaveBeenCalled()
  })

  it("an identical add retried with the same Idempotency-Key is created once", async () => {
    const withKey = () => {
      const r = send("POST", "", { text: "x" })
      r.headers.set("idempotency-key", "k-1")
      return r
    }
    expect((await listRoute.POST(withKey(), listSeg)).status).toBe(201)
    const second = await listRoute.POST(withKey(), listSeg)
    expect(second.headers.get("Idempotent-Replayed")).toBe("true")
    expect(ac.createAcceptanceCriterion).toHaveBeenCalledTimes(1)
  })
})
