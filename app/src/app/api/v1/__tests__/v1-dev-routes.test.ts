import { beforeEach, describe, expect, it, vi } from "vitest"

/**
 * /api/v1/projects/:projectId/dev/* (K5, scope dev:write): the token scope ∩ project role
 * guard (allow and deny), the 409 TASK_CLAIMED shape of a held target (holders), the
 * service errors' codes, idempotency and the write budget. The service is mocked; its
 * rules are tested in services/dev-work.
 */

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
vi.mock("@/lib/logger", () => ({
  logger: { child: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }) },
}))
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
vi.mock("@/services/dev-work/dev-work.service")

const repo = await import("@/services/api-tokens/api-tokens.repository")
const v1 = await import("@/services/api-v1/api-v1.service")
const dev = await import("@/services/dev-work/dev-work.service")
const { generateApiToken } = await import("@/lib/api-tokens/token")
const { resetApiTokenTouchCache } = await import("@/services/api-tokens/api-token-auth")
const { resetIdempotencyStore } = await import("@/app/api/v1/_lib/v1-write")
const { ConflictError, ForbiddenError, ValidationError } = await import("@/services/_shared/errors")

const claimsRoute = await import("@/app/api/v1/projects/[projectId]/dev/claims/route")
const claimRoute = await import("@/app/api/v1/projects/[projectId]/dev/claims/[claimId]/route")
const releaseRoute = await import("@/app/api/v1/projects/[projectId]/dev/claims/[claimId]/release/route")
const scopeRoute = await import("@/app/api/v1/projects/[projectId]/dev/claims/[claimId]/scope/route")
const progressRoute = await import("@/app/api/v1/projects/[projectId]/dev/progress/route")
const mrLinksRoute = await import("@/app/api/v1/projects/[projectId]/dev/mr-links/route")

const token = generateApiToken()
const BASE = "http://localhost/api/v1/projects/p1"
const EVERY_OTHER_SCOPE = '["read","backlog:write","backlog:reorder","sprint:write","task:write","comment:write","icebox:write","daily:write"]'
const DEV_SCOPES = '["read","dev:write"]'
const API_ACTOR = { userId: "u1", userName: "Dev One", systemRole: "member", via: "api" as const }
const MR_URL = "https://gitlab.scm.service.infosys.yamaha.com/grp/api/-/merge_requests/7"
const CLAIM = { id: "c1", projectId: "p1", pbi: { id: "b1", displayId: 12, title: "Login" }, task: null, sessionId: "s-1", active: true }

function send(method: string, path: string, body?: unknown, headers: Record<string, string> = {}): Request {
  return new Request(`${BASE}${path}`, {
    method,
    headers: { authorization: `Bearer ${token.token}`, "content-type": "application/json", ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
}
const seg = <P extends Record<string, string>>(params: P) => ({ params: Promise.resolve({ projectId: "p1", ...params }) })
const asRole = (role: string | null) => m.memberFindFirst.mockResolvedValue(role === null ? null : { role })
const withScopes = (scopes: string) =>
  vi.mocked(repo.findTokenByHash).mockResolvedValue({
    id: "t1", userId: "u1", prefix: token.prefix, scopes, projectIds: null, userTokenVersion: 0, expiresAt: null, revokedAt: null, lastUsedAt: null,
  } as never)

/** Every write of the dev surface, with a body its schema accepts. */
const WRITES = [
  { name: "claim", call: () => claimsRoute.POST(send("POST", "/dev/claims", { pbi: "PBI-12", sessionId: "s-1" }), seg({})) },
  { name: "heartbeat", call: () => claimRoute.PATCH(send("PATCH", "/dev/claims/c1", { branch: "feat/x" }), seg({ claimId: "c1" })) },
  { name: "release", call: () => releaseRoute.POST(send("POST", "/dev/claims/c1/release"), seg({ claimId: "c1" })) },
  { name: "scope", call: () => scopeRoute.PUT(send("PUT", "/dev/claims/c1/scope", { scope: [{ kind: "path", value: "app/src" }] }), seg({ claimId: "c1" })) },
  { name: "progress", call: () => progressRoute.POST(send("POST", "/dev/progress", { entityType: "pbi", entityId: "12", body: "tests green" }), seg({})) },
  { name: "mr-link", call: () => mrLinksRoute.POST(send("POST", "/dev/mr-links", { pbi: "12", url: MR_URL }), seg({})) },
] as const

beforeEach(() => {
  vi.clearAllMocks()
  vi.unstubAllEnvs()
  delete (globalThis as { __kanflowRateLimiters?: unknown }).__kanflowRateLimiters
  resetApiTokenTouchCache()
  resetIdempotencyStore()
  withScopes(DEV_SCOPES)
  vi.mocked(repo.touchLastUsed).mockResolvedValue({ count: 1 })
  m.loadUserAuthState.mockResolvedValue({ isActive: true, role: "member", tokenVersion: 0 })
  m.projectFindFirst.mockResolvedValue({ id: "p1" })
  m.projectSectionFindFirst.mockResolvedValue(null)
  asRole("dev")
  vi.mocked(v1.loadApiActor).mockResolvedValue(API_ACTOR)
  vi.mocked(dev.claimWork).mockResolvedValue({ claim: CLAIM, created: true, takenOver: [] } as never)
  vi.mocked(dev.heartbeatClaim).mockResolvedValue({ claim: CLAIM } as never)
  vi.mocked(dev.releaseClaim).mockResolvedValue({ claim: { ...CLAIM, active: false } } as never)
  vi.mocked(dev.postProgress).mockResolvedValue({ id: "cm1", via: "api" } as never)
  vi.mocked(dev.linkMergeRequest).mockResolvedValue({ link: { id: "l1", ref: "7", declared: true }, created: true } as never)
  vi.mocked(dev.listClaims).mockResolvedValue({ data: [CLAIM], staleAfterHours: 4 } as never)
  vi.mocked(dev.declareScope).mockResolvedValue({ scope: [{ kind: "path", value: "app/src" }], overlaps: [] })
})

describe("scope dev:write ∩ project role", () => {
  it.each(WRITES)("$name: a developer with dev:write may do it (2xx), as the token owner via api", async ({ call }) => {
    const res = await call()
    expect(res.status).toBeLessThan(300)
    expect(v1.loadApiActor).toHaveBeenCalledWith(expect.objectContaining({ userId: "u1" }))
  })

  it.each(WRITES)("$name: 403 INSUFFICIENT_SCOPE (requiredScope dev:write) for a token with every other scope, even as PO", async ({ call }) => {
    withScopes(EVERY_OTHER_SCOPE)
    asRole("po")
    const res = await call()
    expect(res.status).toBe(403)
    expect(await res.json()).toEqual({ error: "Insufficient scope", code: "INSUFFICIENT_SCOPE", requiredScope: "dev:write" })
  })

  it.each(WRITES)("$name: 403 FORBIDDEN for a section manager who is not a project member, despite the scope", async ({ call }) => {
    asRole(null)
    m.projectSectionFindFirst.mockResolvedValue({ id: "ps1" })
    m.loadUserAuthState.mockResolvedValue({ isActive: true, role: "section_manager", tokenVersion: 0 })
    vi.mocked(repo.findTokenByHash).mockResolvedValue({
      id: "t1", userId: "u1", prefix: token.prefix, scopes: DEV_SCOPES, projectIds: null, userTokenVersion: 0, expiresAt: null, revokedAt: null, lastUsedAt: null,
    } as never)
    const res = await call()
    expect(res.status).toBe(403)
    expect(((await res.json()) as { code: string }).code).toBe("FORBIDDEN")
  })

  it.each(WRITES)("$name: 404 for a project outside the token's restriction", async ({ call }) => {
    vi.mocked(repo.findTokenByHash).mockResolvedValue({
      id: "t1", userId: "u1", prefix: token.prefix, scopes: DEV_SCOPES, projectIds: '["p9"]', userTokenVersion: 0, expiresAt: null, revokedAt: null, lastUsedAt: null,
    } as never)
    expect((await call()).status).toBe(404)
  })

  it("no service is reached when the guard refuses", async () => {
    withScopes('["read"]')
    for (const w of WRITES) expect((await w.call()).status).toBe(403)
    for (const fn of [dev.claimWork, dev.heartbeatClaim, dev.releaseClaim, dev.declareScope, dev.postProgress, dev.linkMergeRequest]) expect(fn).not.toHaveBeenCalled()
  })

  it("listing claims is a read: any token of a project member (read scope only)", async () => {
    withScopes('["read"]')
    const res = await claimsRoute.GET(send("GET", "/dev/claims?pbi=PBI-12"), seg({}))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ data: [CLAIM], staleAfterHours: 4 })
    expect(dev.listClaims).toHaveBeenCalledWith("p1", { pbi: "PBI-12" }, "u1", expect.any(Date), { hideConfidential: true })
  })
})

describe("work claims (作業の宣言)", () => {
  it("201 for a new claim (takeover flag passed through)", async () => {
    const res = await claimsRoute.POST(send("POST", "/dev/claims", { taskId: "k1", sessionId: "s-1", branch: "feat/L3-PBI-12-x", takeover: true }), seg({}))
    expect(res.status).toBe(201)
    expect(await res.json()).toEqual({ data: CLAIM, created: true, takenOver: [] })
    expect(dev.claimWork).toHaveBeenCalledWith("p1", { taskId: "k1", sessionId: "s-1", branch: "feat/L3-PBI-12-x", takeover: true }, API_ACTOR)
  })

  it("409 TASK_CLAIMED carries the holders to the token client (allowlisted extra)", async () => {
    const holders = [{ claimId: "c0", user: { id: "u2", name: "Dev Two" }, sessionId: "other", branch: "feat/x", claimedAt: "2026-10-30T10:00:00.000Z", lastHeartbeatAt: "2026-10-30T11:00:00.000Z" }]
    vi.mocked(dev.claimWork).mockRejectedValue(new ConflictError("Someone else is working on this", { holders }, "TASK_CLAIMED"))
    const res = await claimsRoute.POST(send("POST", "/dev/claims", { taskId: "k1", sessionId: "s-1" }), seg({}))
    expect(res.status).toBe(409)
    expect(await res.json()).toEqual({ error: "Someone else is working on this", code: "TASK_CLAIMED", holders })
  })

  it("200 when the caller's own claim was refreshed", async () => {
    vi.mocked(dev.claimWork).mockResolvedValue({ claim: CLAIM, created: false, takenOver: [] } as never)
    const res = await claimsRoute.POST(send("POST", "/dev/claims", { pbi: "12", sessionId: "s-1" }), seg({}))
    expect(res.status).toBe(200)
    expect(((await res.json()) as { created: boolean }).created).toBe(false)
  })

  it.each([
    ["neither pbi nor taskId", { sessionId: "s-1" }],
    ["both pbi and taskId", { pbi: "12", taskId: "k1", sessionId: "s-1" }],
    ["a session id with spaces", { pbi: "12", sessionId: "my session" }],
    ["no session id", { pbi: "12" }],
    ["a branch with spaces", { pbi: "12", sessionId: "s", branch: "feat x" }],
    ["a non-boolean takeover", { pbi: "12", sessionId: "s", takeover: "yes" }],
    ["a branch with markup characters", { pbi: "12", sessionId: "s", branch: 'feat/<img src=x>"' }],
    ["a branch with ..", { pbi: "12", sessionId: "s", branch: "feat/../main" }],
    ["a branch starting with -", { pbi: "12", sessionId: "s", branch: "-rf" }],
    ["a branch ending with .lock", { pbi: "12", sessionId: "s", branch: "feat/x.lock" }],
  ])("400 VALIDATION for %s", async (_label, body) => {
    const res = await claimsRoute.POST(send("POST", "/dev/claims", body), seg({}))
    expect(res.status).toBe(400)
    expect(((await res.json()) as { code: string }).code).toBe("VALIDATION")
    expect(dev.claimWork).not.toHaveBeenCalled()
  })

  it("heartbeat / release keep the service's refusals: other user's claim 403, released claim 409 CLAIM_RELEASED", async () => {
    vi.mocked(dev.heartbeatClaim).mockRejectedValueOnce(new ForbiddenError("Only the user who made the claim can change it", {}, "FORBIDDEN"))
    expect((await claimRoute.PATCH(send("PATCH", "/dev/claims/c1", {}), seg({ claimId: "c1" }))).status).toBe(403)
    vi.mocked(dev.heartbeatClaim).mockRejectedValueOnce(new ConflictError("released", {}, "CLAIM_RELEASED"))
    const res = await claimRoute.PATCH(send("PATCH", "/dev/claims/c1", {}), seg({ claimId: "c1" }))
    expect(res.status).toBe(409)
    expect(((await res.json()) as { code: string }).code).toBe("CLAIM_RELEASED")
    const rel = await releaseRoute.POST(send("POST", "/dev/claims/c1/release"), seg({ claimId: "c1" }))
    expect(rel.status).toBe(200)
    expect(dev.releaseClaim).toHaveBeenCalledWith("p1", "c1", API_ACTOR, { canModerate: false })
    asRole("sm")
    await releaseRoute.POST(send("POST", "/dev/claims/c1/release"), seg({ claimId: "c1" }))
    // A PO / SM (sprint.manage) may release anyone's claim; the service decides with this flag.
    expect(dev.releaseClaim).toHaveBeenLastCalledWith("p1", "c1", API_ACTOR, { canModerate: true })
  })
})

describe("触る範囲 (PUT /dev/claims/:claimId/scope, W4)", () => {
  const put = (body: unknown, claimId = "c1") => scopeRoute.PUT(send("PUT", `/dev/claims/${claimId}/scope`, body), seg({ claimId }))

  it("200 with the stored scope and the overlaps (no session ids); the service gets the claim id and the token owner", async () => {
    const overlaps = [{ claimId: "c2", user: { id: "u2", name: "Dev Two" }, branch: "feat/y", pbi: { id: "b2", displayId: 13 }, task: null, paths: ["app/src/x.ts"] }]
    vi.mocked(dev.declareScope).mockResolvedValue({ scope: [{ kind: "path", value: "app/src" }], overlaps })
    const res = await put({ scope: [{ kind: "path", value: "./app/src/" }] })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ data: { scope: [{ kind: "path", value: "app/src" }], overlaps } })
    expect(dev.declareScope).toHaveBeenCalledWith("p1", "c1", { scope: [{ kind: "path", value: "./app/src/" }] }, API_ACTOR)
  })

  it.each([
    ["no scope array", {}],
    ["an unknown kind", { scope: [{ kind: "glob", value: "a" }] }],
    ["a non-string value", { scope: [{ kind: "path", value: 3 }] }],
    ["too many raw entries", { scope: Array.from({ length: 1001 }, (_, i) => ({ kind: "path", value: `f${i}` })) }],
  ])("400 VALIDATION for %s (service not called)", async (_label, body) => {
    const res = await put(body)
    expect(res.status).toBe(400)
    expect(((await res.json()) as { code: string }).code).toBe("VALIDATION")
    expect(dev.declareScope).not.toHaveBeenCalled()
  })

  it.each([
    [new ValidationError('scope[0] contains ".."', {}, "SCOPE_INVALID"), 400, "SCOPE_INVALID"],
    [new ValidationError("too many", {}, "SCOPE_TOO_LARGE"), 400, "SCOPE_TOO_LARGE"],
    [new ForbiddenError("Only the user who made the claim can declare its scope", {}, "FORBIDDEN"), 403, "FORBIDDEN"],
    [new ConflictError("released", {}, "CLAIM_RELEASED"), 409, "CLAIM_RELEASED"],
  ] as const)("the service's refusal %# reaches the client (%s)", async (error, status, code) => {
    vi.mocked(dev.declareScope).mockRejectedValue(error)
    const res = await put({ scope: [] })
    expect(res.status).toBe(status)
    expect(await res.json()).toEqual({ error: error.message, code })
  })

  it("another user's claim: 403 even for a PO (owner only — the service decides, the route passes no moderation right)", async () => {
    asRole("po")
    vi.mocked(dev.declareScope).mockRejectedValue(new ForbiddenError("Only the user who made the claim can declare its scope", {}, "FORBIDDEN"))
    expect((await put({ scope: [] })).status).toBe(403)
    expect(dev.declareScope).toHaveBeenCalledWith("p1", "c1", { scope: [] }, API_ACTOR)
  })

  it("a claim of another project is looked up in the URL's project only (404 from the service)", async () => {
    const { NotFoundError } = await import("@/services/_shared/errors")
    vi.mocked(dev.declareScope).mockRejectedValue(new NotFoundError("Claim not found"))
    const res = await put({ scope: [] }, "c-other")
    expect(res.status).toBe(404)
    expect(dev.declareScope).toHaveBeenCalledWith("p1", "c-other", { scope: [] }, API_ACTOR)
  })
})

describe("progress comment and MR link", () => {
  it("posts a progress comment as the token owner; PO / SM moderation right passed through", async () => {
    asRole("po")
    const res = await progressRoute.POST(send("POST", "/dev/progress", { entityType: "sprint_task", entityId: "k1", body: "API done" }), seg({}))
    expect(res.status).toBe(201)
    expect(await res.json()).toEqual({ data: { id: "cm1", via: "api" } })
    expect(dev.postProgress).toHaveBeenCalledWith("p1", { entityType: "sprint_task", entityId: "k1", body: "API done" }, API_ACTOR, true)
  })

  it("progress refuses an Icebox target and an empty body (400)", async () => {
    expect((await progressRoute.POST(send("POST", "/dev/progress", { entityType: "icebox", entityId: "i1", body: "x" }), seg({}))).status).toBe(400)
    expect((await progressRoute.POST(send("POST", "/dev/progress", { entityType: "pbi", entityId: "12", body: "  " }), seg({}))).status).toBe(400)
    expect(dev.postProgress).not.toHaveBeenCalled()
  })

  it("an Idempotency-Key replays the first progress comment instead of posting twice", async () => {
    const body = { entityType: "pbi", entityId: "12", body: "tests green" }
    const first = await progressRoute.POST(send("POST", "/dev/progress", body, { "Idempotency-Key": "k-1" }), seg({}))
    const again = await progressRoute.POST(send("POST", "/dev/progress", body, { "Idempotency-Key": "k-1" }), seg({}))
    expect(first.status).toBe(201)
    expect(again.status).toBe(201)
    expect(again.headers.get("Idempotent-Replayed")).toBe("true")
    expect(dev.postProgress).toHaveBeenCalledTimes(1)
  })

  it("MR link: 201 linked now, 200 already linked (naturally idempotent)", async () => {
    // A client title is not accepted (the link shows the synced MR's title): it is dropped.
    const res = await mrLinksRoute.POST(send("POST", "/dev/mr-links", { pbi: "PBI-12", url: MR_URL, title: "Login API" }), seg({}))
    expect(res.status).toBe(201)
    expect(dev.linkMergeRequest).toHaveBeenCalledWith("p1", { pbi: "PBI-12", url: MR_URL }, API_ACTOR)
    vi.mocked(dev.linkMergeRequest).mockResolvedValue({ link: { id: "l1" }, created: false } as never)
    const again = await mrLinksRoute.POST(send("POST", "/dev/mr-links", { pbi: "PBI-12", url: MR_URL }), seg({}))
    expect(again.status).toBe(200)
    expect(await again.json()).toEqual({ data: { id: "l1" }, created: false })
  })

  it.each([["MR_URL_INVALID"], ["MR_REPOSITORY_NOT_REGISTERED"]] as const)("MR link: 400 %s from the service reaches the client", async (code) => {
    vi.mocked(dev.linkMergeRequest).mockRejectedValue(new ValidationError("refused", {}, code))
    const res = await mrLinksRoute.POST(send("POST", "/dev/mr-links", { pbi: "12", url: "https://evil.example/x/-/merge_requests/1" }), seg({}))
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: "refused", code })
  })

  it("429 once the per-token write budget is spent (dev writes count like every other write)", async () => {
    vi.stubEnv("API_V1_WRITE_RATE_LIMIT_PER_MIN", "1")
    expect((await WRITES[0].call()).status).toBe(201)
    const res = await WRITES[3].call()
    expect(res.status).toBe(429)
    expect(res.headers.get("Retry-After")).toBeTruthy()
  })
})
