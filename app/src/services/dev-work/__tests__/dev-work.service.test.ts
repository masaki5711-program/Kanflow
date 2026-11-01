import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/services/_shared/db", async () => (await import("@/services/__tests__/support")).dbMock())
vi.mock("../dev-work.repository", async (orig) => {
  const real = await orig<typeof import("../dev-work.repository")>()
  return Object.fromEntries(Object.entries(real).map(([k, v]) => [k, typeof v === "function" ? vi.fn() : v]))
})
vi.mock("@/services/comments/comments.service", () => ({ createComment: vi.fn() }))
vi.mock("@/services/_shared/notifications", () => ({ notify: vi.fn(async () => undefined) }))
vi.mock("@/services/_shared/activity", () => ({ LABEL_MAX: 120, logActivity: vi.fn(async () => undefined) }))
const publishAfterCommit = vi.fn()
vi.mock("@/lib/realtime/after-commit", () => ({ publishAfterCommit: (...a: unknown[]) => publishAfterCommit(...a) }))
const log = vi.hoisted(() => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }))
vi.mock("@/lib/logger", () => ({ logger: { child: () => log } }))

const repo = await import("../dev-work.repository")
const svc = await import("../dev-work.service")
const comments = await import("@/services/comments/comments.service")
const activity = await import("@/services/_shared/activity")
const notifications = await import("@/services/_shared/notifications")
const db = await import("@/services/_shared/db")
const { DEFAULT_DB, TX } = await import("@/services/__tests__/support")
const { ConflictError, ForbiddenError, NotFoundError, ValidationError } = await import("@/services/_shared/errors")

const HOST = "gitlab.scm.service.infosys.yamaha.com"
const NOW = new Date("2026-10-30T12:00:00.000Z")
const HOUR = 3_600_000
const ACTOR = { userId: "u1", userName: "Dev One", systemRole: "member", via: "mcp" as const }
const PBI = { id: "b1", displayId: 12, initiative: "Login", userStory: null }

type Row = Awaited<ReturnType<typeof repo.findClaim>> & object
function claim(over: Partial<Row> = {}): Row {
  return {
    id: "c1",
    projectId: "p1",
    backlogItemId: "b1",
    taskId: null,
    userId: "u1",
    sessionId: "s-1",
    branch: null,
    heartbeatAt: new Date(NOW.getTime() - HOUR),
    releasedAt: null,
    releaseReason: null,
    createdAt: new Date(NOW.getTime() - 2 * HOUR),
    backlogItem: PBI,
    task: null,
    user: { id: "u1", name: "Dev One" },
    ...over,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.unstubAllEnvs()
  vi.stubEnv("GIT_ALLOWED_HOSTS", HOST)
  vi.mocked(repo.findPbi).mockResolvedValue(PBI)
  vi.mocked(repo.findOwnOpenClaim).mockResolvedValue(null)
  vi.mocked(repo.findActiveClaimsOnPbi).mockResolvedValue([])
  vi.mocked(repo.findStaleClaimsOnPbi).mockResolvedValue([])
  vi.mocked(repo.countActiveClaimsOfUser).mockResolvedValue(0)
  vi.mocked(repo.endClaims).mockResolvedValue(0)
  vi.mocked(repo.findClaim).mockResolvedValue(claim())
  svc.resetClaimSettingsWarning()
})

/** Call position (invocationCallOrder) of a mock's first call; Infinity when never called. */
function order(fn: unknown): number {
  return (fn as { mock: { invocationCallOrder: number[] } }).mock.invocationCallOrder[0] ?? Number.POSITIVE_INFINITY
}

describe("claimWork (作業の宣言): one active claim per target", () => {
  it("creates a PBI claim under the PBI lock, READ COMMITTED, and the lock comes before any claim read", async () => {
    vi.mocked(repo.createClaim).mockResolvedValue(claim({ id: "new", heartbeatAt: NOW, createdAt: NOW, branch: "feat/x" }))
    const out = await svc.claimWork("p1", { pbi: "PBI-12", sessionId: "s-1", branch: "feat/x" }, ACTOR, NOW)
    expect(db.withTransaction).toHaveBeenCalledWith(expect.any(Function), { isolationLevel: "ReadCommitted" })
    expect(repo.findPbi).toHaveBeenCalledWith(TX, "p1", { displayId: 12 })
    const lock = order(repo.lockPbi)
    for (const read of [repo.findOwnOpenClaim, repo.findActiveClaimsOnPbi, repo.findStaleClaimsOnPbi, repo.countActiveClaimsOfUser, repo.createClaim]) {
      expect(order(read)).toBeGreaterThan(lock)
    }
    expect(repo.lockPbi).toHaveBeenCalledWith(TX, "b1")
    expect(repo.findActiveClaimsOnPbi).toHaveBeenCalledWith(TX, "b1", new Date(NOW.getTime() - 4 * HOUR))
    expect(repo.createClaim).toHaveBeenCalledWith(TX, {
      projectId: "p1", backlogItemId: "b1", taskId: null, userId: "u1", sessionId: "s-1", branch: "feat/x", heartbeatAt: NOW,
    })
    expect(out).toMatchObject({ created: true, takenOver: [], superseded: [], claim: { id: "new", active: true, stale: false, sessionId: "s-1" } })
  })

  it("a task claim: the task is resolved first (ids only), then the lock, then the claims", async () => {
    vi.mocked(repo.findTask).mockResolvedValue({ id: "k1", pbItemId: "b1" })
    vi.mocked(repo.createClaim).mockResolvedValue(claim({ id: "mine", taskId: "k1" }))
    await svc.claimWork("p1", { taskId: "k1", sessionId: "s-1" }, ACTOR, NOW)
    expect(order(repo.findTask)).toBeLessThan(order(repo.lockPbi))
    expect(order(repo.lockPbi)).toBeLessThan(order(repo.findActiveClaimsOnPbi))
  })

  it("409 TASK_CLAIMED with the holder (name, branch, times; another user's session id hidden)", async () => {
    vi.mocked(repo.findTask).mockResolvedValue({ id: "k1", pbItemId: "b1" })
    const theirs = claim({ id: "theirs", taskId: "k1", userId: "u2", sessionId: "other", branch: "feat/theirs", user: { id: "u2", name: "Dev Two" } })
    vi.mocked(repo.findActiveClaimsOnPbi).mockResolvedValue([theirs])
    const err = await svc.claimWork("p1", { taskId: "k1", sessionId: "s-1" }, ACTOR, NOW).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(ConflictError)
    expect(err).toMatchObject({ status: 409, code: "TASK_CLAIMED" })
    expect((err as { extra: unknown }).extra).toEqual({
      holders: [{
        claimId: "theirs", user: { id: "u2", name: "Dev Two" }, sessionId: null, branch: "feat/theirs", pbi: { id: "b1", displayId: 12 }, task: null,
        claimedAt: "2026-10-30T10:00:00.000Z", lastHeartbeatAt: "2026-10-30T11:00:00.000Z", staleAt: "2026-10-30T15:00:00.000Z",
      }],
    })
    expect(repo.createClaim).not.toHaveBeenCalled()
  })

  it("takeover never overrides another user's active claim (still 409); a whole-PBI claim blocks its tasks", async () => {
    vi.mocked(repo.findTask).mockResolvedValue({ id: "k1", pbItemId: "b1" })
    vi.mocked(repo.findActiveClaimsOnPbi).mockResolvedValue([claim({ id: "whole", userId: "u2", sessionId: "z" })])
    await expect(svc.claimWork("p1", { taskId: "k1", sessionId: "s-1", takeover: true }, ACTOR, NOW)).rejects.toMatchObject({ code: "TASK_CLAIMED" })
    expect(repo.endClaims).not.toHaveBeenCalled()
    expect(notifications.notify).not.toHaveBeenCalled()
  })

  it("the caller's other session: 409 without takeover (own session id shown), ended with takeover (logged, no notification)", async () => {
    const first = claim({ id: "first", sessionId: "s-0" })
    vi.mocked(repo.findActiveClaimsOnPbi).mockResolvedValue([first])
    const err = await svc.claimWork("p1", { pbi: "b1", sessionId: "s-1" }, ACTOR, NOW).catch((e: unknown) => e)
    expect((err as { extra: { holders: Array<{ sessionId: string | null }> } }).extra.holders[0].sessionId).toBe("s-0")
    vi.mocked(repo.endClaims).mockResolvedValue(1)
    vi.mocked(repo.countActiveClaimsOfUser).mockResolvedValue(0)
    vi.mocked(repo.createClaim).mockResolvedValue(claim({ id: "second" }))
    const out = await svc.claimWork("p1", { pbi: "b1", sessionId: "s-1", takeover: true }, ACTOR, NOW)
    expect(repo.endClaims).toHaveBeenCalledWith(TX, ["first"], { releasedAt: NOW, releaseReason: "takeover", releasedById: "u1" })
    expect(out.takenOver).toEqual([expect.objectContaining({ id: "first", releasedAt: NOW.toISOString(), releaseReason: "takeover", active: false })])
    expect(activity.logActivity).toHaveBeenCalledWith(TX, expect.objectContaining({
      entityType: "pbi", entityId: "b1", action: "update",
      diff: expect.objectContaining({ meta: { claimEnded: { claimId: "first", reason: "takeover", from: { userId: "u1", userName: "Dev One" }, toSessionId: "s-1" } } }),
    }))
    expect(notifications.notify).not.toHaveBeenCalled()
  })

  it("another user's stale claim never blocks: the new claim supersedes it (reason stale, logged, holder notified) without takeover", async () => {
    vi.mocked(repo.findTask).mockResolvedValue({ id: "k1", pbItemId: "b1" })
    const stale = claim({ id: "old", taskId: "k1", task: { id: "k1", taskName: "API", sprintId: "s1" }, userId: "u2", sessionId: "gone", user: { id: "u2", name: "Dev Two" }, heartbeatAt: new Date(NOW.getTime() - 5 * HOUR) })
    vi.mocked(repo.findStaleClaimsOnPbi).mockResolvedValue([stale])
    vi.mocked(repo.endClaims).mockResolvedValue(1)
    vi.mocked(repo.countActiveClaimsOfUser).mockResolvedValue(0)
    vi.mocked(repo.createClaim).mockResolvedValue(claim({ id: "mine", taskId: "k1" }))
    const out = await svc.claimWork("p1", { taskId: "k1", sessionId: "s-1" }, ACTOR, NOW)
    expect(repo.findStaleClaimsOnPbi).toHaveBeenCalledWith(TX, "b1", new Date(NOW.getTime() - 4 * HOUR))
    expect(repo.endClaims).toHaveBeenCalledWith(TX, ["old"], { releasedAt: NOW, releaseReason: "stale", releasedById: "u1" })
    expect(out.superseded).toEqual([expect.objectContaining({ id: "old", releaseReason: "stale", sessionId: null })])
    expect(activity.logActivity).toHaveBeenCalledWith(TX, expect.objectContaining({ entityType: "sprint_task", entityId: "k1", diff: expect.objectContaining({ label: "API" }) }))
    expect(notifications.notify).toHaveBeenCalledWith(TX, {
      recipientIds: ["u2"], actorId: "u1", type: "work_claim_ended", projectId: "p1", entityType: "sprint_task", entityId: "k1",
      payload: { entityLabel: "API", actorName: "Dev One", reason: "stale", sprintId: "s1" }, dedupeKey: "work_claim_ended:old",
    })
  })

  it("a stale claim already ended by a concurrent call is not logged twice", async () => {
    vi.mocked(repo.findStaleClaimsOnPbi).mockResolvedValue([claim({ id: "old", userId: "u2", sessionId: "z", heartbeatAt: new Date(NOW.getTime() - 9 * HOUR) })])
    vi.mocked(repo.endClaims).mockResolvedValue(0)
    vi.mocked(repo.countActiveClaimsOfUser).mockResolvedValue(0)
    vi.mocked(repo.createClaim).mockResolvedValue(claim({ id: "mine" }))
    await svc.claimWork("p1", { pbi: "b1", sessionId: "s-1" }, ACTOR, NOW)
    expect(activity.logActivity).not.toHaveBeenCalled()
    expect(notifications.notify).not.toHaveBeenCalled()
  })

  it("the same user + session + target refreshes (and revives) the existing claim (200) with a conditional update", async () => {
    vi.mocked(repo.findOwnOpenClaim).mockResolvedValue(claim({ id: "own", heartbeatAt: new Date(NOW.getTime() - 9 * HOUR) }))
    vi.mocked(repo.touchOpenClaim).mockResolvedValue(1)
    vi.mocked(repo.findClaim).mockResolvedValue(claim({ id: "own", heartbeatAt: NOW, branch: "feat/y" }))
    const out = await svc.claimWork("p1", { pbi: "b1", sessionId: "s-1", branch: "feat/y" }, ACTOR, NOW)
    expect(repo.findOwnOpenClaim).toHaveBeenCalledWith(TX, { userId: "u1", sessionId: "s-1", backlogItemId: "b1", taskId: null })
    expect(repo.createClaim).not.toHaveBeenCalled()
    expect(repo.touchOpenClaim).toHaveBeenCalledWith(TX, "own", { heartbeatAt: NOW, branch: "feat/y" })
    expect(out).toMatchObject({ created: false, claim: { id: "own", active: true } })
  })

  it("409 CLAIM_LIMIT_REACHED at DEV_CLAIM_MAX_OPEN_PER_USER active claims (a refresh is not counted)", async () => {
    vi.stubEnv("DEV_CLAIM_MAX_OPEN_PER_USER", "2")
    vi.mocked(repo.countActiveClaimsOfUser).mockResolvedValue(2)
    const err = await svc.claimWork("p1", { pbi: "b1", sessionId: "s-1" }, ACTOR, NOW).catch((e: unknown) => e)
    expect(err).toMatchObject({ status: 409, code: "CLAIM_LIMIT_REACHED" })
    expect(repo.countActiveClaimsOfUser).toHaveBeenCalledWith(TX, "p1", "u1", new Date(NOW.getTime() - 4 * HOUR))
    expect(repo.createClaim).not.toHaveBeenCalled()
  })

  it("fails loudly (logged 503) instead of deciding on a cut list of active claims", async () => {
    vi.mocked(repo.findActiveClaimsOnPbi).mockResolvedValue(Array.from({ length: repo.ACTIVE_CLAIMS_PER_PBI_LIMIT + 1 }, (_, i) => claim({ id: `x${i}`, taskId: `k${i}`, userId: "u2" })))
    await expect(svc.claimWork("p1", { pbi: "b1", sessionId: "s-1" }, ACTOR, NOW)).rejects.toMatchObject({ status: 503 })
    expect(log.error).toHaveBeenCalledWith("too many active work claims on one PBI to decide safely", { backlogItemId: "b1", limit: repo.ACTIVE_CLAIMS_PER_PBI_LIMIT })
    expect(repo.createClaim).not.toHaveBeenCalled()
  })

  it("different tasks of one PBI are parallel work, not a conflict", async () => {
    vi.mocked(repo.findTask).mockResolvedValue({ id: "k1", pbItemId: "b1" })
    vi.mocked(repo.findActiveClaimsOnPbi).mockResolvedValue([claim({ id: "t2", taskId: "k2", userId: "u2" })])
    vi.mocked(repo.countActiveClaimsOfUser).mockResolvedValue(0)
    vi.mocked(repo.createClaim).mockResolvedValue(claim({ id: "mine", taskId: "k1" }))
    expect((await svc.claimWork("p1", { taskId: "k1", sessionId: "s-1" }, ACTOR, NOW)).created).toBe(true)
  })

  it("404 for an unknown / trashed PBI or a task outside the project", async () => {
    vi.mocked(repo.findPbi).mockResolvedValue(null)
    await expect(svc.claimWork("p1", { pbi: "PBI-99", sessionId: "s" }, ACTOR, NOW)).rejects.toMatchObject({ status: 404, code: "PBI_NOT_FOUND" })
    vi.mocked(repo.findTask).mockResolvedValue(null)
    await expect(svc.claimWork("p1", { taskId: "kx", sessionId: "s" }, ACTOR, NOW)).rejects.toBeInstanceOf(NotFoundError)
    expect(repo.createClaim).not.toHaveBeenCalled()
  })

  it("an invalid setting is warned about once per process", async () => {
    vi.stubEnv("DEV_CLAIM_STALE_HOURS", "lots")
    svc.resetClaimSettingsWarning()
    vi.mocked(repo.createClaim).mockResolvedValue(claim())
    vi.mocked(repo.findOpenClaims).mockResolvedValue([])
    await svc.claimWork("p1", { pbi: "b1", sessionId: "s-1" }, ACTOR, NOW)
    await svc.listClaims("p1", {}, "u1", NOW)
    expect(log.warn).toHaveBeenCalledTimes(1)
    expect(log.warn).toHaveBeenCalledWith("invalid work-claim setting ignored, default used", { variables: ["DEV_CLAIM_STALE_HOURS"], staleHours: 4, maxOpenPerUser: 20 })
  })
})

describe("heartbeatClaim / releaseClaim", () => {
  it("a heartbeat runs under the PBI lock with a conditional update", async () => {
    vi.mocked(repo.findClaim).mockResolvedValue(claim())
    vi.mocked(repo.touchOpenClaim).mockResolvedValue(1)
    const out = await svc.heartbeatClaim("p1", "c1", { branch: "b2" }, ACTOR, NOW)
    expect(db.withTransaction).toHaveBeenCalledWith(expect.any(Function), { isolationLevel: "ReadCommitted" })
    expect(order(repo.lockPbi)).toBeLessThan(order(repo.touchOpenClaim))
    expect(repo.touchOpenClaim).toHaveBeenCalledWith(TX, "c1", { heartbeatAt: NOW, branch: "b2" })
    expect(repo.findActiveClaimsOnPbi).not.toHaveBeenCalled()
    expect(out.claim.id).toBe("c1")
  })

  it("a claim released / taken over between the read and the update → 409 CLAIM_RELEASED (conditional update hit 0 rows)", async () => {
    vi.mocked(repo.findClaim).mockResolvedValue(claim())
    vi.mocked(repo.touchOpenClaim).mockResolvedValue(0)
    await expect(svc.heartbeatClaim("p1", "c1", {}, ACTOR, NOW)).rejects.toMatchObject({ code: "CLAIM_RELEASED" })
  })

  it("a stale claim is revived only while nobody else claimed it (else 409 TASK_CLAIMED)", async () => {
    vi.mocked(repo.findClaim).mockResolvedValue(claim({ heartbeatAt: new Date(NOW.getTime() - 10 * HOUR) }))
    vi.mocked(repo.touchOpenClaim).mockResolvedValue(1)
    await svc.heartbeatClaim("p1", "c1", {}, ACTOR, NOW)
    expect(repo.touchOpenClaim).toHaveBeenCalledWith(TX, "c1", { heartbeatAt: NOW })
    vi.mocked(repo.touchOpenClaim).mockClear()
    vi.mocked(repo.findActiveClaimsOnPbi).mockResolvedValue([claim({ id: "new", userId: "u2", sessionId: "z", heartbeatAt: NOW })])
    await expect(svc.heartbeatClaim("p1", "c1", {}, ACTOR, NOW)).rejects.toMatchObject({ code: "TASK_CLAIMED" })
    expect(repo.touchOpenClaim).not.toHaveBeenCalled()
  })

  it("only the claim's user may heartbeat (any of their sessions); a released claim → 409 CLAIM_RELEASED; unknown → 404", async () => {
    vi.mocked(repo.findClaim).mockResolvedValue(claim({ userId: "u2" }))
    await expect(svc.heartbeatClaim("p1", "c1", {}, ACTOR, NOW)).rejects.toBeInstanceOf(ForbiddenError)
    vi.mocked(repo.findClaim).mockResolvedValue(claim({ releasedAt: NOW }))
    await expect(svc.heartbeatClaim("p1", "c1", {}, ACTOR, NOW)).rejects.toMatchObject({ code: "CLAIM_RELEASED" })
    vi.mocked(repo.findClaim).mockResolvedValue(null)
    await expect(svc.releaseClaim("p1", "nope", ACTOR, { canModerate: false }, NOW)).rejects.toBeInstanceOf(NotFoundError)
    expect(repo.touchOpenClaim).not.toHaveBeenCalled()
  })

  it("the owner's release ends the claim conditionally (reason released); again = unchanged, no log", async () => {
    vi.mocked(repo.findClaim).mockResolvedValue(claim())
    vi.mocked(repo.endClaims).mockResolvedValue(1)
    await svc.releaseClaim("p1", "c1", ACTOR, { canModerate: false }, NOW)
    expect(order(repo.lockPbi)).toBeLessThan(order(repo.endClaims))
    expect(repo.endClaims).toHaveBeenCalledWith(TX, ["c1"], { releasedAt: NOW, releaseReason: "released", releasedById: null })
    vi.mocked(repo.endClaims).mockResolvedValue(0)
    vi.mocked(repo.findClaim).mockResolvedValue(claim({ releasedAt: NOW, releaseReason: "released" }))
    const again = await svc.releaseClaim("p1", "c1", ACTOR, { canModerate: false }, NOW)
    expect(again.claim).toMatchObject({ releasedAt: NOW.toISOString(), releaseReason: "released", active: false, stale: false })
    expect(activity.logActivity).not.toHaveBeenCalled()
  })

  it("another user's claim: 403 for a member, released by a PO / SM (reason moderator, logged, holder notified)", async () => {
    const theirs = claim({ userId: "u2", sessionId: "z", user: { id: "u2", name: "Dev Two" } })
    vi.mocked(repo.findClaim).mockResolvedValue(theirs)
    await expect(svc.releaseClaim("p1", "c1", ACTOR, { canModerate: false }, NOW)).rejects.toBeInstanceOf(ForbiddenError)
    vi.mocked(repo.endClaims).mockResolvedValue(1)
    const out = await svc.releaseClaim("p1", "c1", ACTOR, { canModerate: true }, NOW)
    expect(repo.endClaims).toHaveBeenCalledWith(TX, ["c1"], { releasedAt: NOW, releaseReason: "moderator", releasedById: "u1" })
    expect(out.claim.sessionId).toBeNull()
    expect(activity.logActivity).toHaveBeenCalledWith(TX, expect.objectContaining({ diff: expect.objectContaining({ meta: { claimEnded: expect.objectContaining({ reason: "moderator" }) } }) }))
    expect(notifications.notify).toHaveBeenCalledWith(TX, expect.objectContaining({ recipientIds: ["u2"], type: "work_claim_ended", payload: expect.objectContaining({ reason: "moderator" }) }))
  })
})

describe("listClaims", () => {
  it("lists open claims of the last 7 days, stale ones flagged, others' session ids hidden, filtered by PBI, with truncated", async () => {
    vi.stubEnv("DEV_CLAIM_STALE_HOURS", "2")
    const rows = Array.from({ length: repo.CLAIM_LIST_LIMIT + 1 }, (_, i) =>
      claim({ id: `c${i}`, userId: i === 2 ? "u2" : "u1", heartbeatAt: new Date(NOW.getTime() - (i === 1 ? 3 : 1) * HOUR) }),
    )
    vi.mocked(repo.findOpenClaims).mockResolvedValue(rows)
    const out = await svc.listClaims("p1", { pbi: "12" }, "u1", NOW)
    expect(repo.findOpenClaims).toHaveBeenCalledWith(DEFAULT_DB, "p1", new Date(NOW.getTime() - 7 * 24 * HOUR), { backlogItemId: "b1" })
    expect(out.data).toHaveLength(repo.CLAIM_LIST_LIMIT)
    expect(out.data[0]).toMatchObject({ active: true, stale: false, sessionId: "s-1" })
    expect(out.data[1]).toMatchObject({ active: false, stale: true })
    expect(out.data[2].sessionId).toBeNull()
    expect(out).toMatchObject({ truncated: true, limit: repo.CLAIM_LIST_LIMIT, staleAfterHours: 2 })
  })

  it("filters by task without a PBI lookup; no truncation flag when everything fits", async () => {
    vi.mocked(repo.findOpenClaims).mockResolvedValue([claim()])
    const out = await svc.listClaims("p1", { taskId: "k1" }, "u1", NOW)
    expect(repo.findPbi).not.toHaveBeenCalled()
    expect(repo.findOpenClaims).toHaveBeenCalledWith(DEFAULT_DB, "p1", expect.any(Date), { taskId: "k1" })
    expect(out).toEqual({ data: [expect.objectContaining({ id: "c1" })], staleAfterHours: 4 })
  })
})

describe("listBoardClaims (W3 screens)", () => {
  it("a sprint board reads every claim of the sprint in ONE query, no session ids, stale flagged", async () => {
    vi.mocked(repo.findOpenClaimsOfSprint).mockResolvedValue([
      claim({ id: "a", taskId: "k1", task: { id: "k1", taskName: "API", sprintId: "s1" } }),
      claim({ id: "b", userId: "u2", user: { id: "u2", name: "Dev Two" }, heartbeatAt: new Date(NOW.getTime() - 5 * HOUR) }),
    ])
    const out = await svc.listBoardClaims("p1", { sprintId: "s1" }, NOW)
    expect(repo.findOpenClaimsOfSprint).toHaveBeenCalledTimes(1)
    expect(repo.findOpenClaimsOfSprint).toHaveBeenCalledWith(DEFAULT_DB, "p1", "s1", new Date(NOW.getTime() - 7 * 24 * HOUR))
    expect(repo.findOpenClaims).not.toHaveBeenCalled()
    expect(out.staleAfterHours).toBe(4)
    expect(out.data.map((c) => [c.id, c.task?.id ?? null, c.stale, c.ai])).toEqual([["a", "k1", false, true], ["b", null, true, true]])
    expect(JSON.stringify(out)).not.toContain("s-1")
    expect(out).not.toHaveProperty("truncated")
  })

  it("a PBI panel resolves the PBI (number or id) and filters by it; truncated past the limit", async () => {
    vi.mocked(repo.findOpenClaims).mockResolvedValue(Array.from({ length: repo.CLAIM_LIST_LIMIT + 1 }, (_, i) => claim({ id: `c${i}` })))
    const out = await svc.listBoardClaims("p1", { pbi: "PBI-12" }, NOW)
    expect(repo.findPbi).toHaveBeenCalledWith(DEFAULT_DB, "p1", { displayId: 12 })
    expect(repo.findOpenClaims).toHaveBeenCalledWith(DEFAULT_DB, "p1", expect.any(Date), { backlogItemId: "b1" })
    expect(out.data).toHaveLength(repo.CLAIM_LIST_LIMIT)
    expect(out).toMatchObject({ truncated: true, limit: repo.CLAIM_LIST_LIMIT })
  })

  it("an unknown PBI → 404 PBI_NOT_FOUND", async () => {
    vi.mocked(repo.findPbi).mockResolvedValue(null)
    await expect(svc.listBoardClaims("p1", { pbi: "nope" }, NOW)).rejects.toBeInstanceOf(NotFoundError)
    expect(repo.findOpenClaims).not.toHaveBeenCalled()
  })
})

describe("postProgress", () => {
  it("posts through the comment service as the token user (via kept on the actor); a PBI may be given by number", async () => {
    vi.mocked(comments.createComment).mockResolvedValue({ id: "cm1" } as never)
    const out = await svc.postProgress("p1", { entityType: "pbi", entityId: "PBI-12", body: "API done, tests green" }, ACTOR, false)
    expect(comments.createComment).toHaveBeenCalledWith("p1", { entityType: "pbi", entityId: "b1", body: "API done, tests green" }, ACTOR, false)
    expect(out).toEqual({ id: "cm1" })
  })

  it("a task progress goes to the task thread unchanged", async () => {
    vi.mocked(comments.createComment).mockResolvedValue({ id: "cm2" } as never)
    await svc.postProgress("p1", { entityType: "sprint_task", entityId: "k1", body: "WIP" }, ACTOR, true)
    expect(repo.findPbi).not.toHaveBeenCalled()
    expect(comments.createComment).toHaveBeenCalledWith("p1", { entityType: "sprint_task", entityId: "k1", body: "WIP" }, ACTOR, true)
  })
})

describe("linkMergeRequest", () => {
  const URL_OK = `https://${HOST}/grp/api/-/merge_requests/7`
  const REPO = { id: "r1", name: "API", webUrl: `https://${HOST}/grp/api` }
  const link = (over: Record<string, unknown> = {}) => ({
    id: "l1", kind: "mr", ref: "7", title: "!7", url: URL_OK, state: null, backlogItemId: "b1",
    declaredAt: NOW, createdAt: NOW, repository: { id: "r1", name: "API" }, declaredBy: { id: "u1", name: "Dev One" }, ...over,
  })

  it.each([
    ["a malformed URL", "not a url"],
    ["a foreign host", "https://gitlab.com/grp/api/-/merge_requests/7"],
    ["a non-MR page", `https://${HOST}/grp/api/-/issues/7`],
  ])("400 MR_URL_INVALID for %s, before any lookup", async (_label, url) => {
    const err = await svc.linkMergeRequest("p1", { pbi: "12", url }, ACTOR, NOW).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(ValidationError)
    expect(err).toMatchObject({ status: 400, code: "MR_URL_INVALID" })
    expect(repo.findRegisteredRepository).not.toHaveBeenCalled()
  })

  it("400 MR_REPOSITORY_NOT_REGISTERED when the repository is not this project's (another project's repo looks the same)", async () => {
    vi.mocked(repo.findRegisteredRepository).mockResolvedValue(null)
    const err = await svc.linkMergeRequest("p1", { pbi: "12", url: `https://${HOST}/other/repo/-/merge_requests/3` }, ACTOR, NOW).catch((e: unknown) => e)
    expect(err).toMatchObject({ status: 400, code: "MR_REPOSITORY_NOT_REGISTERED" })
    expect(repo.findRegisteredRepository).toHaveBeenCalledWith(DEFAULT_DB, "p1", `https://${HOST}`, "other/repo")
    expect(repo.createDeclaredLink).not.toHaveBeenCalled()
  })

  it("creates a declared MR link (canonical URL, title !<iid>, state unknown until the sync), logs it on the PBI and refreshes Git panels", async () => {
    vi.mocked(repo.findRegisteredRepository).mockResolvedValue(REPO)
    vi.mocked(repo.findLink).mockResolvedValue(null)
    vi.mocked(repo.findSyncedMergeRequest).mockResolvedValue(null)
    vi.mocked(repo.createDeclaredLink).mockResolvedValue(link())
    const out = await svc.linkMergeRequest("p1", { pbi: "PBI-12", url: `${URL_OK}/diffs#note_3` }, ACTOR, NOW)
    expect(repo.createDeclaredLink).toHaveBeenCalledWith(TX, {
      projectId: "p1", repositoryId: "r1", kind: "mr", ref: "7", backlogItemId: "b1",
      title: "!7", url: URL_OK, occurredAt: NOW, declaredById: "u1", declaredAt: NOW,
    })
    expect(repo.findSyncedMergeRequest).toHaveBeenCalledWith(DEFAULT_DB, "r1", "7")
    expect(activity.logActivity).toHaveBeenCalledWith(TX, {
      projectId: "p1", entityType: "pbi", entityId: "b1", action: "update", actor: ACTOR,
      diff: { label: "#12 Login", meta: { gitLink: { kind: "mr", ref: "7", repository: "API", url: URL_OK } } },
    })
    expect(publishAfterCommit).toHaveBeenCalledWith({ type: "git", projectId: "p1", action: "link" })
    expect(out.created).toBe(true)
    expect(out.link).toMatchObject({ id: "l1", kind: "mr", ref: "7", declared: true, pbi: { id: "b1", displayId: 12 } })
  })

  it("is idempotent: an existing link (declared or synced) is answered as is, nothing written", async () => {
    vi.mocked(repo.findRegisteredRepository).mockResolvedValue(REPO)
    vi.mocked(repo.findLink).mockResolvedValue(link({ declaredAt: null, declaredBy: null, title: "PBI-12 login", state: "opened" }))
    const out = await svc.linkMergeRequest("p1", { pbi: "12", url: URL_OK }, ACTOR, NOW)
    expect(repo.createDeclaredLink).not.toHaveBeenCalled()
    expect(activity.logActivity).not.toHaveBeenCalled()
    expect(out).toMatchObject({ created: false, link: { title: "PBI-12 login", state: "opened", declared: false } })
  })

  it("a concurrent duplicate (unique violation) answers the row the other request wrote", async () => {
    vi.mocked(repo.findRegisteredRepository).mockResolvedValue(REPO)
    vi.mocked(repo.findLink).mockResolvedValueOnce(null).mockResolvedValueOnce(link())
    vi.mocked(repo.createDeclaredLink).mockRejectedValue(Object.assign(new Error("dup"), { code: "P2002" }))
    const out = await svc.linkMergeRequest("p1", { pbi: "12", url: URL_OK }, ACTOR, NOW)
    expect(out.created).toBe(false)
    expect(out.link.id).toBe("l1")
  })

  it("an MR the sync already knows (linked to another PBI) starts with its real title / state / dates", async () => {
    const synced = { title: "Login API", state: "merged", pipeline: "success", author: "Dev", sourceBranch: "feat/x", occurredAt: new Date("2026-10-29T00:00:00Z"), mergedAt: new Date("2026-10-29T00:00:00Z") }
    vi.mocked(repo.findRegisteredRepository).mockResolvedValue(REPO)
    vi.mocked(repo.findLink).mockResolvedValue(null)
    vi.mocked(repo.findSyncedMergeRequest).mockResolvedValue(synced)
    vi.mocked(repo.createDeclaredLink).mockResolvedValue(link({ title: "Login API", state: "merged" }))
    await svc.linkMergeRequest("p1", { pbi: "12", url: URL_OK }, ACTOR, NOW)
    expect(repo.createDeclaredLink).toHaveBeenCalledWith(TX, {
      projectId: "p1", repositoryId: "r1", kind: "mr", ref: "7", backlogItemId: "b1", url: URL_OK, declaredById: "u1", declaredAt: NOW, ...synced,
    })
  })

  it("404 PBI_NOT_FOUND for a PBI outside the project", async () => {
    vi.mocked(repo.findPbi).mockResolvedValue(null)
    await expect(svc.linkMergeRequest("p1", { pbi: "99", url: URL_OK }, ACTOR, NOW)).rejects.toMatchObject({ code: "PBI_NOT_FOUND" })
  })
})
