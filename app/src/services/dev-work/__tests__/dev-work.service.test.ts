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

const repo = await import("../dev-work.repository")
const svc = await import("../dev-work.service")
const comments = await import("@/services/comments/comments.service")
const activity = await import("@/services/_shared/activity")
const notifications = await import("@/services/_shared/notifications")
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
  vi.mocked(repo.findOpenClaimsOnPbi).mockResolvedValue([])
})

describe("claimWork (作業の宣言): one active claim per target", () => {
  it("creates a PBI claim for the token user under a PBI row lock, inside a transaction (created)", async () => {
    vi.mocked(repo.createClaim).mockResolvedValue(claim({ id: "new", heartbeatAt: NOW, createdAt: NOW, branch: "feat/x" }))
    const out = await svc.claimWork("p1", { pbi: "PBI-12", sessionId: "s-1", branch: "feat/x" }, ACTOR, NOW)
    expect(repo.findPbi).toHaveBeenCalledWith(TX, "p1", { displayId: 12 })
    expect(repo.lockPbi).toHaveBeenCalledWith(TX, "b1")
    expect(repo.createClaim).toHaveBeenCalledWith(TX, {
      projectId: "p1", backlogItemId: "b1", taskId: null, userId: "u1", sessionId: "s-1", branch: "feat/x", heartbeatAt: NOW,
    })
    expect(out).toMatchObject({ created: true, takenOver: [], claim: { id: "new", active: true, stale: false, pbi: { displayId: 12 }, branch: "feat/x" } })
  })

  it("409 TASK_CLAIMED with the holder (name, session, branch, claimed / last heartbeat) when another user is active on the task", async () => {
    vi.mocked(repo.findTask).mockResolvedValue({ id: "k1", pbItemId: "b1" })
    const theirs = claim({ id: "theirs", taskId: "k1", userId: "u2", sessionId: "other", branch: "feat/theirs", user: { id: "u2", name: "Dev Two" } })
    vi.mocked(repo.findOpenClaimsOnPbi).mockResolvedValue([theirs])
    const err = await svc.claimWork("p1", { taskId: "k1", sessionId: "s-1" }, ACTOR, NOW).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(ConflictError)
    expect(err).toMatchObject({ status: 409, code: "TASK_CLAIMED" })
    expect((err as { extra: unknown }).extra).toEqual({
      holders: [{
        claimId: "theirs", user: { id: "u2", name: "Dev Two" }, sessionId: "other", branch: "feat/theirs", pbi: { id: "b1", displayId: 12 }, task: null,
        claimedAt: "2026-10-30T10:00:00.000Z", lastHeartbeatAt: "2026-10-30T11:00:00.000Z", staleAt: "2026-10-30T15:00:00.000Z",
      }],
    })
    expect(repo.findTask).toHaveBeenCalledWith(TX, "p1", "k1")
    expect(repo.createClaim).not.toHaveBeenCalled()
  })

  it("takeover cannot override another user's active claim (still 409), and a whole-PBI claim blocks its tasks", async () => {
    vi.mocked(repo.findTask).mockResolvedValue({ id: "k1", pbItemId: "b1" })
    vi.mocked(repo.findOpenClaimsOnPbi).mockResolvedValue([claim({ id: "whole", userId: "u2", sessionId: "z" })])
    await expect(svc.claimWork("p1", { taskId: "k1", sessionId: "s-1", takeover: true }, ACTOR, NOW)).rejects.toMatchObject({ code: "TASK_CLAIMED" })
    expect(repo.releaseClaims).not.toHaveBeenCalled()
    expect(notifications.notify).not.toHaveBeenCalled()
  })

  it("a second session of the same user is refused without takeover, and takes over its own other session with it", async () => {
    const first = claim({ id: "first", sessionId: "s-0" })
    vi.mocked(repo.findOpenClaimsOnPbi).mockResolvedValue([first])
    await expect(svc.claimWork("p1", { pbi: "b1", sessionId: "s-1" }, ACTOR, NOW)).rejects.toMatchObject({ code: "TASK_CLAIMED" })
    vi.mocked(repo.createClaim).mockResolvedValue(claim({ id: "second" }))
    const out = await svc.claimWork("p1", { pbi: "b1", sessionId: "s-1", takeover: true }, ACTOR, NOW)
    expect(repo.releaseClaims).toHaveBeenCalledWith(TX, ["first"], NOW)
    expect(out.created).toBe(true)
    expect(out.takenOver).toEqual([expect.objectContaining({ id: "first", releasedAt: NOW.toISOString(), active: false })])
    expect(activity.logActivity).toHaveBeenCalledWith(TX, expect.objectContaining({
      entityType: "pbi", entityId: "b1", action: "update",
      diff: expect.objectContaining({ meta: { claimTakeover: { claimId: "first", from: { userId: "u1", userName: "Dev One", sessionId: "s-0" }, toSessionId: "s-1", stale: false } } }),
    }))
  })

  it("a stale claim never blocks; with takeover it is ended, logged on the task and its holder notified", async () => {
    vi.mocked(repo.findTask).mockResolvedValue({ id: "k1", pbItemId: "b1" })
    const stale = claim({ id: "old", taskId: "k1", task: { id: "k1", taskName: "API", sprintId: "s1" }, userId: "u2", sessionId: "gone", user: { id: "u2", name: "Dev Two" }, heartbeatAt: new Date(NOW.getTime() - 5 * HOUR) })
    vi.mocked(repo.findOpenClaimsOnPbi).mockResolvedValue([stale])
    vi.mocked(repo.createClaim).mockResolvedValue(claim({ id: "mine", taskId: "k1" }))
    const plain = await svc.claimWork("p1", { taskId: "k1", sessionId: "s-1" }, ACTOR, NOW)
    expect(plain.takenOver).toEqual([])
    expect(repo.releaseClaims).not.toHaveBeenCalled()

    const out = await svc.claimWork("p1", { taskId: "k1", sessionId: "s-1", takeover: true }, ACTOR, NOW)
    expect(repo.releaseClaims).toHaveBeenCalledWith(TX, ["old"], NOW)
    expect(out.takenOver.map((c) => c.id)).toEqual(["old"])
    expect(activity.logActivity).toHaveBeenCalledWith(TX, expect.objectContaining({ entityType: "sprint_task", entityId: "k1", diff: expect.objectContaining({ label: "API" }) }))
    expect(notifications.notify).toHaveBeenCalledWith(TX, {
      recipientIds: ["u2"], actorId: "u1", type: "work_claim_taken_over", projectId: "p1", entityType: "sprint_task", entityId: "k1",
      payload: { entityLabel: "API", actorName: "Dev One", sessionId: "gone", sprintId: "s1" }, dedupeKey: "work_claim_taken_over:old",
    })
  })

  it("the same user + session + target refreshes the existing claim (200, heartbeat, branch) instead of a duplicate", async () => {
    vi.mocked(repo.findOpenClaimsOnPbi).mockResolvedValue([claim({ id: "own" })])
    vi.mocked(repo.updateClaim).mockResolvedValue(claim({ id: "own", heartbeatAt: NOW, branch: "feat/y" }))
    const out = await svc.claimWork("p1", { pbi: "b1", sessionId: "s-1", branch: "feat/y" }, ACTOR, NOW)
    expect(repo.createClaim).not.toHaveBeenCalled()
    expect(repo.updateClaim).toHaveBeenCalledWith(TX, "own", { heartbeatAt: NOW, branch: "feat/y" })
    expect(out).toMatchObject({ created: false, claim: { id: "own" } })
  })

  it("different tasks of one PBI are parallel work, not a conflict", async () => {
    vi.mocked(repo.findTask).mockResolvedValue({ id: "k1", pbItemId: "b1" })
    vi.mocked(repo.findOpenClaimsOnPbi).mockResolvedValue([claim({ id: "t2", taskId: "k2", userId: "u2" })])
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
})

describe("heartbeatClaim / releaseClaim", () => {
  it("a heartbeat moves heartbeatAt (and the branch) of an active claim", async () => {
    vi.mocked(repo.findClaim).mockResolvedValue(claim())
    vi.mocked(repo.updateClaim).mockResolvedValue(claim({ heartbeatAt: NOW, branch: "b2" }))
    const out = await svc.heartbeatClaim("p1", "c1", { branch: "b2" }, ACTOR, NOW)
    expect(repo.findClaim).toHaveBeenCalledWith(DEFAULT_DB, "p1", "c1")
    expect(repo.updateClaim).toHaveBeenCalledWith(TX, "c1", { heartbeatAt: NOW, branch: "b2" })
    expect(repo.findOpenClaimsOnPbi).not.toHaveBeenCalled()
    expect(out.claim.heartbeatAt).toBe(NOW.toISOString())
  })

  it("a stale claim is revived by its owner's heartbeat while nobody else claimed it", async () => {
    vi.mocked(repo.findClaim).mockResolvedValue(claim({ heartbeatAt: new Date(NOW.getTime() - 10 * HOUR) }))
    vi.mocked(repo.updateClaim).mockResolvedValue(claim({ heartbeatAt: NOW }))
    const out = await svc.heartbeatClaim("p1", "c1", {}, ACTOR, NOW)
    expect(repo.lockPbi).toHaveBeenCalledWith(TX, "b1")
    expect(repo.updateClaim).toHaveBeenCalledWith(TX, "c1", { heartbeatAt: NOW })
    expect(out.claim.active).toBe(true)
  })

  it("a stale claim someone else claimed meanwhile cannot be revived (409 TASK_CLAIMED)", async () => {
    vi.mocked(repo.findClaim).mockResolvedValue(claim({ heartbeatAt: new Date(NOW.getTime() - 10 * HOUR) }))
    vi.mocked(repo.findOpenClaimsOnPbi).mockResolvedValue([claim({ id: "new", userId: "u2", sessionId: "z", heartbeatAt: NOW })])
    await expect(svc.heartbeatClaim("p1", "c1", {}, ACTOR, NOW)).rejects.toMatchObject({ code: "TASK_CLAIMED" })
    expect(repo.updateClaim).not.toHaveBeenCalled()
  })

  it("only the owner may heartbeat or release; a released (or taken over) claim refuses a heartbeat (409 CLAIM_RELEASED)", async () => {
    vi.mocked(repo.findClaim).mockResolvedValue(claim({ userId: "u2" }))
    await expect(svc.heartbeatClaim("p1", "c1", {}, ACTOR, NOW)).rejects.toBeInstanceOf(ForbiddenError)
    await expect(svc.releaseClaim("p1", "c1", ACTOR, NOW)).rejects.toBeInstanceOf(ForbiddenError)
    vi.mocked(repo.findClaim).mockResolvedValue(claim({ releasedAt: NOW }))
    const err = await svc.heartbeatClaim("p1", "c1", {}, ACTOR, NOW).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(ConflictError)
    expect(err).toMatchObject({ code: "CLAIM_RELEASED" })
    vi.mocked(repo.findClaim).mockResolvedValue(null)
    await expect(svc.releaseClaim("p1", "nope", ACTOR, NOW)).rejects.toBeInstanceOf(NotFoundError)
    expect(repo.updateClaim).not.toHaveBeenCalled()
  })

  it("release sets releasedAt once; releasing again answers the released claim unchanged", async () => {
    vi.mocked(repo.findClaim).mockResolvedValue(claim())
    vi.mocked(repo.updateClaim).mockResolvedValue(claim({ releasedAt: NOW }))
    const first = await svc.releaseClaim("p1", "c1", ACTOR, NOW)
    expect(repo.updateClaim).toHaveBeenCalledWith(DEFAULT_DB, "c1", { releasedAt: NOW })
    expect(first.claim).toMatchObject({ releasedAt: NOW.toISOString(), active: false, stale: false })
    vi.mocked(repo.updateClaim).mockClear()
    vi.mocked(repo.findClaim).mockResolvedValue(claim({ releasedAt: NOW }))
    const again = await svc.releaseClaim("p1", "c1", ACTOR, new Date(NOW.getTime() + HOUR))
    expect(repo.updateClaim).not.toHaveBeenCalled()
    expect(again.claim.releasedAt).toBe(NOW.toISOString())
  })
})

describe("listClaims", () => {
  it("lists open claims of the last 7 days, stale ones flagged (window from DEV_CLAIM_STALE_HOURS), filtered by PBI, with truncated", async () => {
    vi.stubEnv("DEV_CLAIM_STALE_HOURS", "2")
    const rows = Array.from({ length: repo.CLAIM_LIST_LIMIT + 1 }, (_, i) => claim({ id: `c${i}`, heartbeatAt: new Date(NOW.getTime() - (i === 1 ? 3 : 1) * HOUR) }))
    vi.mocked(repo.findOpenClaims).mockResolvedValue(rows)
    const out = await svc.listClaims("p1", { pbi: "12" }, NOW)
    expect(repo.findOpenClaims).toHaveBeenCalledWith(DEFAULT_DB, "p1", new Date(NOW.getTime() - 7 * 24 * HOUR), { backlogItemId: "b1" })
    expect(out.data).toHaveLength(repo.CLAIM_LIST_LIMIT)
    expect(out.data[0]).toMatchObject({ active: true, stale: false })
    expect(out.data[1]).toMatchObject({ active: false, stale: true })
    expect(out).toMatchObject({ truncated: true, limit: repo.CLAIM_LIST_LIMIT, staleAfterHours: 2 })
  })

  it("filters by task without a PBI lookup; no truncation flag when everything fits", async () => {
    vi.mocked(repo.findOpenClaims).mockResolvedValue([claim()])
    const out = await svc.listClaims("p1", { taskId: "k1" }, NOW)
    expect(repo.findPbi).not.toHaveBeenCalled()
    expect(repo.findOpenClaims).toHaveBeenCalledWith(DEFAULT_DB, "p1", expect.any(Date), { taskId: "k1" })
    expect(out).toEqual({ data: [expect.objectContaining({ id: "c1" })], staleAfterHours: 4 })
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

  it("creates a declared MR link (canonical URL, default title), logs it on the PBI and refreshes Git panels", async () => {
    vi.mocked(repo.findRegisteredRepository).mockResolvedValue(REPO)
    vi.mocked(repo.findLink).mockResolvedValue(null)
    vi.mocked(repo.createDeclaredLink).mockResolvedValue(link())
    const out = await svc.linkMergeRequest("p1", { pbi: "PBI-12", url: `${URL_OK}/diffs#note_3` }, ACTOR, NOW)
    expect(repo.createDeclaredLink).toHaveBeenCalledWith(TX, {
      projectId: "p1", repositoryId: "r1", kind: "mr", ref: "7", backlogItemId: "b1",
      title: "!7", url: URL_OK, occurredAt: NOW, declaredById: "u1", declaredAt: NOW,
    })
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
    const out = await svc.linkMergeRequest("p1", { pbi: "12", url: URL_OK, title: "mine" }, ACTOR, NOW)
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

  it("404 PBI_NOT_FOUND for a PBI outside the project", async () => {
    vi.mocked(repo.findPbi).mockResolvedValue(null)
    await expect(svc.linkMergeRequest("p1", { pbi: "99", url: URL_OK }, ACTOR, NOW)).rejects.toMatchObject({ code: "PBI_NOT_FOUND" })
  })
})
