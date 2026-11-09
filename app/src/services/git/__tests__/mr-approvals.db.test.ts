import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import { ACT_HOST, ACT_INTEGRATION, ACT_REPO, ACT_STATION, ACT_TOKEN, createFakeActAsStation, type FakeActAsStation } from "./fake-gitstation-act-as"
import { oid } from "./fake-gitstation"

/**
 * Approve / withdraw a GitStation merge request from Kanflow (plan 11 K4, F-36; GitStation ADR-0025) against a REAL
 * PostgreSQL and a fake GitStation. Skipped unless KANFLOW_DB_TESTS=1 and DATABASE_* point at a migrated,
 * disposable test database (synthetic rows only, removed afterwards):
 *
 *   KANFLOW_DB_TESTS=1 npx vitest run src/services/git/__tests__/mr-approvals.db.test.ts
 *
 * What it pins (plan 11 K4 test requirements): nothing is sent without the person's claimed assertion; the buttons
 * are not offered to a person GitStation would refuse (with the reason); a double press approves once; a claim
 * for another person (`sub`), head or merge request is discarded and never sent.
 */
const enabled = process.env.KANFLOW_DB_TESTS === "1"

describe.skipIf(!enabled)("MR approvals through GitStation act-as on a real database (KANFLOW_DB_TESTS=1)", () => {
  const tag = `k4test-${Date.now().toString(36)}`
  const ids = { project: `${tag}-p`, repo: `${tag}-r`, pbi: `${tag}-b`, alice: `${tag}-alice`, bob: `${tag}-bob`, carol: `${tag}-carol`, link1: `${tag}-l1`, link2: `${tag}-l2` }
  /** Employee numbers (synthetic): Alice reviews, Bob authored MR !1, Carol has no number. */
  const ALICE = `A${tag.replace(/[^a-z0-9]/gi, "").slice(-8)}`
  const BOB = `B${tag.replace(/[^a-z0-9]/gi, "").slice(-8)}`
  let prisma: typeof import("@/lib/prisma").prisma
  let service: typeof import("../mr-approvals.service")
  let createGitStationClient: typeof import("@/lib/git/gitstation-client").createGitStationClient
  let station: FakeActAsStation
  let t = new Date("2026-11-09T00:00:00.000Z")
  const deps = () => ({
    clientFactory: (o: { apiBase: string; token: string; integrationId: string }) => createGitStationClient({ ...o, fetchImpl: station.fetchImpl, sleep: async () => undefined }),
    now: () => t,
  })
  const writes = () => station.requests.filter((r) => r.method === "POST" && /\/(approve|unapprove)$/.test(r.path))
  const codeOf = async (p: Promise<unknown>) => {
    try {
      await p
      return "resolved"
    } catch (e) {
      return (e as { code?: string }).code ?? String(e)
    }
  }

  beforeAll(async () => {
    process.env.INTEGRATION_SECRET_KEY ||= "synthetic-k4-test-key"
    process.env.GITSTATION_ALLOWED_HOSTS = ACT_HOST
    prisma = (await import("@/lib/prisma")).prisma
    service = await import("../mr-approvals.service")
    createGitStationClient = (await import("@/lib/git/gitstation-client")).createGitStationClient
    const { seal } = await import("@/lib/secret-box")
    for (const [id, employeeNumber] of [[ids.alice, ALICE], [ids.bob, BOB], [ids.carol, null]] as const) {
      await prisma.user.create({ data: { id, name: id, email: `${id}@example.test`, password: "synthetic", employeeNumber } })
    }
    await prisma.project.create({ data: { id: ids.project, name: ids.project } })
    await prisma.gitIntegration.create({ data: { projectId: ids.project, enabled: true, provider: "gitstation", stationIntegrationId: ACT_INTEGRATION, tokenCipher: seal(ACT_TOKEN) } })
    await prisma.productBacklogItem.create({ data: { id: ids.pbi, projectId: ids.project, displayId: 4, initiative: "synthetic" } })
    await prisma.gitRepository.create({ data: { id: ids.repo, projectId: ids.project, name: ACT_REPO, webUrl: `${ACT_STATION}/${ACT_REPO}`, apiBase: ACT_STATION, repoPath: ACT_REPO } })
    const link = (id: string, iid: number) => ({ id, projectId: ids.project, repositoryId: ids.repo, backlogItemId: ids.pbi, kind: "mr", ref: String(iid), title: `MR ${iid} (PBI-4)`, url: `${ACT_STATION}/-/projects/12/pull/${iid}`, state: "opened", occurredAt: new Date("2026-11-08T00:00:00Z") })
    await prisma.gitLink.createMany({ data: [link(ids.link1, 1), link(ids.link2, 2)] })
  })

  afterAll(async () => {
    if (!prisma) return
    await prisma.gitMrApprovalAttempt.deleteMany({ where: { projectId: ids.project } })
    await prisma.gitLink.deleteMany({ where: { projectId: ids.project } })
    await prisma.gitRepository.deleteMany({ where: { projectId: ids.project } })
    await prisma.gitIntegration.deleteMany({ where: { projectId: ids.project } })
    await prisma.productBacklogItem.deleteMany({ where: { id: ids.pbi } })
    await prisma.project.deleteMany({ where: { id: ids.project } })
    await prisma.user.deleteMany({ where: { id: { in: [ids.alice, ids.bob, ids.carol] } } })
  })

  beforeEach(async () => {
    t = new Date("2026-11-09T00:00:00.000Z")
    station = createFakeActAsStation({ kanflowProjectId: ids.project })
    station.person(ALICE, 41)
    station.person(BOB, 42)
    station.mergeRequest(1, BOB)
    station.mergeRequest(2, ALICE)
    await prisma.gitMrApprovalAttempt.deleteMany({ where: { projectId: ids.project } })
  })

  it("offers 承認する where GitStation would allow it, and says why not on the author's own MR", async () => {
    const r = await service.getMrApprovals(ids.project, ids.pbi, ids.alice, deps())
    if (!r.supported) throw new Error("expected supported")
    const byIid = new Map(r.items.map((i) => [i.iid, i]))
    expect(byIid.get(1)).toMatchObject({ linkId: ids.link1, headSha: oid(1), approvals: 0, approvedByMe: false, canApprove: { allowed: true, reason: null } })
    expect(byIid.get(2)).toMatchObject({ canApprove: { allowed: false, reason: "self_approval" }, canUnapprove: { allowed: false, reason: "self_approval" } })
    // The status is read as the person, by the employee number exactly as stored.
    expect(station.requests.filter((q) => q.path.endsWith("/status")).map((q) => q.actAs)).toEqual([`employee:${ALICE}`, `employee:${ALICE}`])
    expect(r.failed).toEqual([])
  })

  it("is not supported for a user without an employee number (no button, a reason)", async () => {
    expect(await service.getMrApprovals(ids.project, ids.pbi, ids.carol, deps())).toEqual({ supported: false, reason: "no_employee_number" })
    expect(await codeOf(service.startMrApproval(ids.project, ids.carol, { linkId: ids.link1, intent: "approve" }, deps()))).toBe("GIT_APPROVAL_NO_EMPLOYEE_NUMBER")
  })

  it("refuses to start what GitStation would refuse (own MR, role) — no confirmation is opened", async () => {
    expect(await codeOf(service.startMrApproval(ids.project, ids.alice, { linkId: ids.link2, intent: "approve" }, deps()))).toBe("GIT_APPROVAL_SELF")
    station.person(ALICE, 41, false)
    expect(await codeOf(service.startMrApproval(ids.project, ids.alice, { linkId: ids.link1, intent: "approve" }, deps()))).toBe("GIT_APPROVAL_NOT_ALLOWED")
    expect(await prisma.gitMrApprovalAttempt.count({ where: { projectId: ids.project } })).toBe(0)
  })

  it("approves after the person confirmed: claim, sub check, then Forge-Act-As user:<sub> + the assertion", async () => {
    const started = await service.startMrApproval(ids.project, ids.alice, { linkId: ids.link1, intent: "approve" }, deps())
    const url = new URL(started.confirmUrl)
    expect(`${url.origin}${url.pathname}`).toBe(`${ACT_STATION}/-/confirm/projects/12/merge-requests/1`)
    expect(Object.fromEntries(url.searchParams)).toMatchObject({ intent: "approve", sha: oid(1), integration: ACT_INTEGRATION })
    const state = url.searchParams.get("state") ?? ""
    expect(state).toMatch(/^[A-Za-z0-9_-]{43}$/)
    // The state is stored sealed, never in the clear.
    const row = await prisma.gitMrApprovalAttempt.findUniqueOrThrow({ where: { id: started.attemptId } })
    expect(row.stateCipher).not.toContain(state)
    expect(row).toMatchObject({ userId: ids.alice, intent: "approve", headSha: oid(1), finishedAt: null })

    // 確認しました before pressing in GitStation: nothing is sent, the attempt stays usable.
    expect(await codeOf(service.completeMrApproval(ids.project, ids.alice, started.attemptId, deps()))).toBe("GIT_APPROVAL_NOT_CONFIRMED")
    expect(writes()).toHaveLength(0)

    station.press(started.confirmUrl, ALICE)
    expect(await service.completeMrApproval(ids.project, ids.alice, started.attemptId, deps())).toEqual({ outcome: "approved", counted: true })
    expect(writes()).toHaveLength(1)
    expect(writes()[0]).toMatchObject({ actAs: "user:41", body: { sha: oid(1) } })
    expect(writes()[0].assertion).toMatch(/^fga_/)
    // The claim is sent by the service account itself (no Forge-Act-As).
    expect(station.requests.filter((q) => q.path.endsWith("/act-as/claim")).every((q) => q.actAs === null)).toBe(true)
    expect(station.approvers(1)).toEqual([41])
    expect(await prisma.gitMrApprovalAttempt.findUniqueOrThrow({ where: { id: started.attemptId } })).toMatchObject({ outcome: "approved" })

    // The count and approved_by_me follow.
    const after = await service.getMrApprovals(ids.project, ids.pbi, ids.alice, deps())
    if (!after.supported) throw new Error("expected supported")
    expect(after.items.find((i) => i.iid === 1)).toMatchObject({ approvals: 1, approvedByMe: true })
  })

  it("a second press of 確認しました never sends a second approval (used, or in flight)", async () => {
    const started = await service.startMrApproval(ids.project, ids.alice, { linkId: ids.link1, intent: "approve" }, deps())
    station.press(started.confirmUrl, ALICE)
    const both = await Promise.all([codeOf(service.completeMrApproval(ids.project, ids.alice, started.attemptId, deps())), codeOf(service.completeMrApproval(ids.project, ids.alice, started.attemptId, deps()))])
    // The second sees the claim in flight (BUSY) or already finished (RETRY), depending on timing — never a second send.
    expect(both.filter((c) => c === "resolved")).toHaveLength(1)
    expect(both.filter((c) => c !== "resolved")[0]).toMatch(/^GIT_APPROVAL_(BUSY|RETRY)$/)
    expect(await codeOf(service.completeMrApproval(ids.project, ids.alice, started.attemptId, deps()))).toBe("GIT_APPROVAL_RETRY")
    expect(writes()).toHaveLength(1)
    expect(station.approvers(1)).toEqual([41])
  })

  it("discards a confirmation pressed by someone else (sub ≠ the Kanflow user) — nothing is sent", async () => {
    const started = await service.startMrApproval(ids.project, ids.alice, { linkId: ids.link1, intent: "approve" }, deps())
    // A shared PC: someone else's GitStation session presses the confirmation Alice opened.
    station.person("Z9", 77)
    station.press(started.confirmUrl, "Z9")
    expect(await codeOf(service.completeMrApproval(ids.project, ids.alice, started.attemptId, deps()))).toBe("GIT_APPROVAL_DIFFERENT_USER")
    expect(writes()).toHaveLength(0)
    expect(await prisma.gitMrApprovalAttempt.findUniqueOrThrow({ where: { id: started.attemptId } })).toMatchObject({ outcome: "discarded" })
  })

  it("discards the claim when GitStation does not name the person (no user_employee_number scope)", async () => {
    station = createFakeActAsStation({ kanflowProjectId: ids.project, employeeNumberScope: false })
    station.person(ALICE, 41)
    station.mergeRequest(1, BOB)
    const started = await service.startMrApproval(ids.project, ids.alice, { linkId: ids.link1, intent: "approve" }, deps())
    station.press(started.confirmUrl, ALICE)
    expect(await codeOf(service.completeMrApproval(ids.project, ids.alice, started.attemptId, deps()))).toBe("GIT_APPROVAL_CONFIG")
    expect(writes()).toHaveLength(0)
  })

  it("a lost claim answer ends the attempt (the secret may be spent): start again, never 'not confirmed' for 10 minutes", async () => {
    const started = await service.startMrApproval(ids.project, ids.alice, { linkId: ids.link1, intent: "approve" }, deps())
    station.press(started.confirmUrl, ALICE)
    const real = station.fetchImpl
    const lossy: typeof fetch = async (input, init) => {
      const res = await real(input, init)
      if (String(input).endsWith("/act-as/claim")) throw new TypeError("socket hang up")
      return res
    }
    const lossyDeps = { ...deps(), clientFactory: (o: { apiBase: string; token: string; integrationId: string }) => createGitStationClient({ ...o, fetchImpl: lossy, sleep: async () => undefined }) }
    expect(await codeOf(service.completeMrApproval(ids.project, ids.alice, started.attemptId, lossyDeps))).toBe("GIT_APPROVAL_RETRY")
    expect(await prisma.gitMrApprovalAttempt.findUniqueOrThrow({ where: { id: started.attemptId } })).toMatchObject({ outcome: "failed", claimingAt: null })
    expect(await codeOf(service.completeMrApproval(ids.project, ids.alice, started.attemptId, deps()))).toBe("GIT_APPROVAL_RETRY")
    expect(writes()).toHaveLength(0)
  })

  it("a lock left by a crashed request is taken over after CLAIM_LOCK_MS (and only then)", async () => {
    const started = await service.startMrApproval(ids.project, ids.alice, { linkId: ids.link1, intent: "approve" }, deps())
    station.press(started.confirmUrl, ALICE)
    await prisma.gitMrApprovalAttempt.update({ where: { id: started.attemptId }, data: { claimingAt: t } })
    expect(await codeOf(service.completeMrApproval(ids.project, ids.alice, started.attemptId, deps()))).toBe("GIT_APPROVAL_BUSY")
    t = new Date(t.getTime() + service.CLAIM_LOCK_MS + 1)
    expect(await service.completeMrApproval(ids.project, ids.alice, started.attemptId, deps())).toMatchObject({ outcome: "approved" })
    expect(writes()).toHaveLength(1)
  })

  it("discards a claim that is not a merge request intent's (a binding claim names a Kanflow project)", async () => {
    station = createFakeActAsStation({ kanflowProjectId: ids.project, claimExtra: { kanflow_project_id: ids.project } })
    station.person(ALICE, 41)
    station.mergeRequest(1, BOB)
    const started = await service.startMrApproval(ids.project, ids.alice, { linkId: ids.link1, intent: "approve" }, deps())
    station.press(started.confirmUrl, ALICE)
    expect(await codeOf(service.completeMrApproval(ids.project, ids.alice, started.attemptId, deps()))).toBe("GIT_APPROVAL_RETRY")
    expect(writes()).toHaveLength(0)
  })

  it("discards a confirmation of another head (pushed after Kanflow showed the MR)", async () => {
    const started = await service.startMrApproval(ids.project, ids.alice, { linkId: ids.link1, intent: "approve" }, deps())
    station.pushTo(1, oid(99))
    station.press(started.confirmUrl.replace(oid(1), oid(99)), ALICE)
    expect(await codeOf(service.completeMrApproval(ids.project, ids.alice, started.attemptId, deps()))).toBe("GIT_APPROVAL_STALE")
    expect(writes()).toHaveLength(0)
  })

  it("another user's attempt is not found; an expired one cannot be used", async () => {
    const started = await service.startMrApproval(ids.project, ids.alice, { linkId: ids.link1, intent: "approve" }, deps())
    station.press(started.confirmUrl, ALICE)
    expect(await codeOf(service.completeMrApproval(ids.project, ids.bob, started.attemptId, deps()))).toBe("NOT_FOUND")
    t = new Date(t.getTime() + service.ATTEMPT_TTL_MS + 1)
    expect(await codeOf(service.completeMrApproval(ids.project, ids.alice, started.attemptId, deps()))).toBe("GIT_APPROVAL_RETRY")
    expect(writes()).toHaveLength(0)
  })

  it("withdraws an approval the same way (承認を取り消す)", async () => {
    const a = await service.startMrApproval(ids.project, ids.alice, { linkId: ids.link1, intent: "approve" }, deps())
    station.press(a.confirmUrl, ALICE)
    await service.completeMrApproval(ids.project, ids.alice, a.attemptId, deps())
    const w = await service.startMrApproval(ids.project, ids.alice, { linkId: ids.link1, intent: "unapprove" }, deps())
    station.press(w.confirmUrl, ALICE)
    expect(await service.completeMrApproval(ids.project, ids.alice, w.attemptId, deps())).toEqual({ outcome: "withdrawn", counted: false })
    expect(writes().map((q) => q.path)).toEqual(["/projects/12/merge-requests/1/approve", "/projects/12/merge-requests/1/unapprove"])
    expect(station.approvers(1)).toEqual([])
  })
})
