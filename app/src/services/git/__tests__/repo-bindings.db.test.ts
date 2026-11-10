import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import { BIND_HOST, BIND_INTEGRATION, BIND_STATION, BIND_TOKEN, createFakeBindingStation, type FakeBindingStation } from "./fake-gitstation-bindings"

/**
 * Bind / unbind GitStation repositories to a Kanflow project from its settings (plan 11 §5.7 X3; GitStation ADR-0025
 * Amendment X3, ADR-0016 Amendment X3) against a REAL PostgreSQL and a fake GitStation. Skipped unless
 * KANFLOW_DB_TESTS=1 and DATABASE_* point at a migrated, disposable test database (synthetic rows only, removed
 * afterwards):
 *
 *   KANFLOW_DB_TESTS=1 npx vitest run src/services/git/__tests__/repo-bindings.db.test.ts
 *
 * What it pins: the search is read as the person (employee number, no assertion); nothing is written without the
 * person's claimed binding assertion; a claim for another repository, Kanflow project, setting or person is
 * discarded and never sent; a double press binds once; the attempt rows keep their intent's columns (CHECK).
 */
const enabled = process.env.KANFLOW_DB_TESTS === "1"

describe.skipIf(!enabled)("repository bindings through GitStation act-as on a real database (KANFLOW_DB_TESTS=1)", () => {
  const tag = `x3test-${Date.now().toString(36)}`
  const ids = { project: `${tag}-p`, other: `${tag}-q`, alice: `${tag}-alice`, bob: `${tag}-bob`, carol: `${tag}-carol`, link: `${tag}-l`, repo: `${tag}-r`, pbi: `${tag}-b` }
  /** Employee numbers (synthetic): Alice maintains both repositories, Bob none, Carol has no number. */
  const ALICE = `A${tag.replace(/[^a-z0-9]/gi, "").slice(-8)}`
  const BOB = `B${tag.replace(/[^a-z0-9]/gi, "").slice(-8)}`
  const CODE = 31
  const SPECS = 32
  let prisma: typeof import("@/lib/prisma").prisma
  let service: typeof import("../repo-bindings.service")
  let mrService: typeof import("../mr-approvals.service")
  let createGitStationClient: typeof import("@/lib/git/gitstation-client").createGitStationClient
  let station: FakeBindingStation
  let t = new Date("2026-11-10T00:00:00.000Z")
  const deps = () => ({
    clientFactory: (o: { apiBase: string; token: string; integrationId: string }) => createGitStationClient({ ...o, fetchImpl: station.fetchImpl, sleep: async () => undefined }),
    now: () => t,
  })
  const codeOf = async (p: Promise<unknown>) => {
    try {
      await p
      return "resolved"
    } catch (e) {
      return (e as { code?: string }).code ?? String(e)
    }
  }
  const bindSet = (repositoryId: number, resolvesWorkItems: boolean) => service.startRepositoryBinding(ids.project, ids.alice, { intent: "binding_set", repositoryId, resolvesWorkItems }, deps())

  beforeAll(async () => {
    process.env.INTEGRATION_SECRET_KEY ||= "synthetic-x3-test-key"
    process.env.GITSTATION_ALLOWED_HOSTS = BIND_HOST
    prisma = (await import("@/lib/prisma")).prisma
    service = await import("../repo-bindings.service")
    mrService = await import("../mr-approvals.service")
    createGitStationClient = (await import("@/lib/git/gitstation-client")).createGitStationClient
    const { seal } = await import("@/lib/secret-box")
    for (const [id, employeeNumber] of [[ids.alice, ALICE], [ids.bob, BOB], [ids.carol, null]] as const) {
      await prisma.user.create({ data: { id, name: id, email: `${id}@example.test`, password: "synthetic", employeeNumber } })
    }
    for (const id of [ids.project, ids.other]) {
      await prisma.project.create({ data: { id, name: id } })
      await prisma.gitIntegration.create({ data: { projectId: id, enabled: true, provider: "gitstation", stationIntegrationId: BIND_INTEGRATION, tokenCipher: seal(BIND_TOKEN) } })
    }
    // For the CHECK test: an MR link to point an approval attempt at.
    await prisma.productBacklogItem.create({ data: { id: ids.pbi, projectId: ids.project, displayId: 4, initiative: "synthetic" } })
    await prisma.gitRepository.create({ data: { id: ids.repo, projectId: ids.project, name: "portal", webUrl: `${BIND_STATION}/app/portal`, apiBase: BIND_STATION, repoPath: "app/portal" } })
    await prisma.gitLink.create({ data: { id: ids.link, projectId: ids.project, repositoryId: ids.repo, backlogItemId: ids.pbi, kind: "mr", ref: "1", title: "MR 1", url: `${BIND_STATION}/-/projects/${CODE}/pull/1`, state: "opened", occurredAt: new Date("2026-11-08T00:00:00Z") } })
  })

  afterAll(async () => {
    if (!prisma) return
    await prisma.gitMrApprovalAttempt.deleteMany({ where: { projectId: { in: [ids.project, ids.other] } } })
    await prisma.gitLink.deleteMany({ where: { projectId: ids.project } })
    await prisma.gitRepository.deleteMany({ where: { projectId: ids.project } })
    await prisma.gitIntegration.deleteMany({ where: { projectId: { in: [ids.project, ids.other] } } })
    await prisma.productBacklogItem.deleteMany({ where: { id: ids.pbi } })
    await prisma.project.deleteMany({ where: { id: { in: [ids.project, ids.other] } } })
    await prisma.user.deleteMany({ where: { id: { in: [ids.alice, ids.bob, ids.carol] } } })
  })

  beforeEach(async () => {
    t = new Date("2026-11-10T00:00:00.000Z")
    station = createFakeBindingStation()
    station.person(ALICE, 41)
    station.person(BOB, 42)
    station.repository(CODE, "app/portal", [41], "Portal")
    station.repository(SPECS, "specs/zeva-engine", [41], "ZEVA specs")
    await prisma.gitMrApprovalAttempt.deleteMany({ where: { projectId: { in: [ids.project, ids.other] } } })
  })

  it("searches as the person (employee number, no assertion) and marks what is already bound here", async () => {
    station.bind(SPECS, ids.project, false)
    const r = await service.searchBindableRepositories(ids.project, ids.alice, "  a ", deps())
    expect(r.items.map((i) => [i.id, i.path, i.displayName, i.binding?.resolvesWorkItems ?? null])).toEqual([
      [CODE, "app/portal", "Portal", null],
      [SPECS, "specs/zeva-engine", "ZEVA specs", false],
    ])
    const search = station.requests.find((q) => q.path === "/repositories")
    expect(search).toMatchObject({ actAs: `employee:${ALICE}`, assertion: null, query: { q: "a" } })
    // Bob maintains nothing: GitStation lists nothing (and says nothing about the rest).
    expect((await service.searchBindableRepositories(ids.project, ids.bob, "a", deps())).items).toEqual([])
    expect(await codeOf(service.searchBindableRepositories(ids.project, ids.carol, "a", deps()))).toBe("GIT_APPROVAL_NO_EMPLOYEE_NUMBER")
    expect(await codeOf(service.searchBindableRepositories(ids.project, ids.alice, " ", deps()))).toBe("VALIDATION")
  })

  it("passes GitStation's search rate limit on to the person (429, never retried)", async () => {
    station = createFakeBindingStation({ searchLimitPerRun: 0 })
    station.person(ALICE, 41)
    expect(await codeOf(service.searchBindableRepositories(ids.project, ids.alice, "a", deps()))).toBe("RATE_LIMITED")
    expect(station.requests.filter((q) => q.path === "/repositories")).toHaveLength(1)
  })

  it("binds a code repository after the person confirmed: claim, checks, then POST as user:<sub> with the assertion", async () => {
    const started = await bindSet(CODE, true)
    const url = new URL(started.confirmUrl)
    expect(`${url.origin}${url.pathname}`).toBe(`${BIND_STATION}/-/confirm/projects/${CODE}/integration-bindings`)
    expect(Object.fromEntries(url.searchParams)).toMatchObject({ intent: "binding_set", integration: BIND_INTEGRATION, kanflow_project_id: ids.project, resolves_work_items: "true" })
    const state = url.searchParams.get("state") ?? ""
    expect(state).toMatch(/^[A-Za-z0-9_-]{43}$/)
    const row = await prisma.gitMrApprovalAttempt.findUniqueOrThrow({ where: { id: started.attemptId } })
    expect(row.stateCipher).not.toContain(state)
    expect(row).toMatchObject({ intent: "binding_set", gitLinkId: null, headSha: null, stationProjectId: BigInt(CODE), resolvesWorkItems: true, bindingId: null, finishedAt: null })

    // Before the press: nothing is written, the attempt stays usable.
    expect(await codeOf(service.completeRepositoryBinding(ids.project, ids.alice, started.attemptId, deps()))).toBe("GIT_APPROVAL_NOT_CONFIRMED")
    expect(station.writes()).toHaveLength(0)

    station.press(started.confirmUrl, ALICE)
    const done = await service.completeRepositoryBinding(ids.project, ids.alice, started.attemptId, deps())
    expect(done).toMatchObject({ outcome: "bound", binding: { repositoryId: CODE, resolvesWorkItems: true, repositoryPath: "app/portal" } })
    expect(station.writes()).toHaveLength(1)
    expect(station.writes()[0]).toMatchObject({ method: "POST", actAs: "user:41", body: { kanflow_project_id: ids.project, repository_id: CODE, settings: { resolves_work_items: true } } })
    expect(station.writes()[0].assertion).toMatch(/^fga_/)
    expect(station.requests.filter((q) => q.path.endsWith("/act-as/claim")).every((q) => q.actAs === null)).toBe(true)
    expect(await prisma.gitMrApprovalAttempt.findUniqueOrThrow({ where: { id: started.attemptId } })).toMatchObject({ outcome: "bound" })

    // The list shows it; the repository is in Kanflow's list already (same host and path).
    const list = await service.getRepositoryBindings(ids.project, ids.alice, deps())
    if (!list.supported) throw new Error("expected supported")
    expect(list.items).toEqual([expect.objectContaining({ repositoryId: CODE, path: "app/portal", resolvesWorkItems: true, listed: true, url: `${BIND_STATION}/app/portal` })])
    expect(list.canAct).toBe(true)
  })

  it("binds a shared spec repository, then changes it to code with PATCH (false → true)", async () => {
    const shared = await bindSet(SPECS, false)
    expect(new URL(shared.confirmUrl).searchParams.get("resolves_work_items")).toBe("false")
    station.press(shared.confirmUrl, ALICE)
    expect(await service.completeRepositoryBinding(ids.project, ids.alice, shared.attemptId, deps())).toMatchObject({ outcome: "bound", binding: { resolvesWorkItems: false } })
    const bindingId = station.bindings()[0].bindingId

    const change = await bindSet(SPECS, true)
    expect(await prisma.gitMrApprovalAttempt.findUniqueOrThrow({ where: { id: change.attemptId } })).toMatchObject({ bindingId: BigInt(bindingId), resolvesWorkItems: true })
    station.press(change.confirmUrl, ALICE)
    expect(await service.completeRepositoryBinding(ids.project, ids.alice, change.attemptId, deps())).toMatchObject({ outcome: "updated", binding: { bindingId, resolvesWorkItems: true } })
    expect(station.writes().map((w) => [w.method, w.path])).toEqual([
      ["POST", `/integrations/${BIND_INTEGRATION}/bindings`],
      ["PATCH", `/integrations/${BIND_INTEGRATION}/bindings/${bindingId}`],
    ])

    // Nothing to confirm: the same setting again, or code → shared in place.
    expect(await codeOf(bindSet(SPECS, true))).toBe("GIT_BINDING_ALREADY")
    expect(await codeOf(bindSet(SPECS, false))).toBe("GIT_BINDING_RESOLUTION_FIXED")
  })

  it("explains GitStation's binding rules (a code repository is in one Kanflow project only)", async () => {
    station.bind(CODE, ids.other, true)
    const started = await bindSet(CODE, true)
    station.press(started.confirmUrl, ALICE)
    expect(await codeOf(service.completeRepositoryBinding(ids.project, ids.alice, started.attemptId, deps()))).toBe("GIT_BINDING_CONFLICT")
    expect(await prisma.gitMrApprovalAttempt.findUniqueOrThrow({ where: { id: started.attemptId } })).toMatchObject({ outcome: "failed" })
    // The other project's binding is not listed here.
    const list = await service.getRepositoryBindings(ids.project, ids.alice, deps())
    expect(list.supported && list.items).toEqual([])
  })

  it("unbinds after the person confirmed (DELETE with the binding_remove assertion)", async () => {
    const bindingId = station.bind(CODE, ids.project, true)
    const started = await service.startRepositoryBinding(ids.project, ids.alice, { intent: "binding_remove", bindingId }, deps())
    const url = new URL(started.confirmUrl)
    expect(url.pathname).toBe(`/-/confirm/projects/${CODE}/integration-bindings`)
    expect(url.searchParams.has("resolves_work_items")).toBe(false)
    expect(await prisma.gitMrApprovalAttempt.findUniqueOrThrow({ where: { id: started.attemptId } })).toMatchObject({ intent: "binding_remove", stationProjectId: BigInt(CODE), bindingId: BigInt(bindingId), resolvesWorkItems: null })
    station.press(started.confirmUrl, ALICE)
    expect(await service.completeRepositoryBinding(ids.project, ids.alice, started.attemptId, deps())).toEqual({ outcome: "removed", binding: null })
    expect(station.writes()).toEqual([expect.objectContaining({ method: "DELETE", path: `/integrations/${BIND_INTEGRATION}/bindings/${bindingId}`, actAs: "user:41" })])
    expect(station.bindings()).toEqual([])
    // Another project's binding (or none) cannot be unbound from here.
    const elsewhere = station.bind(CODE, ids.other, true)
    expect(await codeOf(service.startRepositoryBinding(ids.project, ids.alice, { intent: "binding_remove", bindingId: elsewhere }, deps()))).toBe("NOT_FOUND")
  })

  it("discards a confirmation pressed by someone else (sub ≠ the Kanflow user) — nothing is written", async () => {
    const started = await bindSet(CODE, true)
    station.repository(CODE, "app/portal", [41, 42], "Portal")
    station.press(started.confirmUrl, BOB)
    expect(await codeOf(service.completeRepositoryBinding(ids.project, ids.alice, started.attemptId, deps()))).toBe("GIT_APPROVAL_DIFFERENT_USER")
    expect(station.writes()).toHaveLength(0)
    expect(await prisma.gitMrApprovalAttempt.findUniqueOrThrow({ where: { id: started.attemptId } })).toMatchObject({ outcome: "discarded" })
  })

  it.each([
    ["another Kanflow project", { kanflow_project_id: "someone-else" }],
    ["another repository", { project_id: 99 }],
    ["another setting", { resolves_work_items: false }],
    ["a merge request intent", { intent: "approve" }],
    ["a merge request subject", { iid: 3, head_sha: "a".repeat(40), target_ref: "refs/heads/main" }],
  ])("discards a claim for %s — nothing is written", async (_name, claimExtra) => {
    station = createFakeBindingStation({ claimExtra })
    station.person(ALICE, 41)
    station.repository(CODE, "app/portal", [41], "Portal")
    const started = await bindSet(CODE, true)
    station.press(started.confirmUrl, ALICE)
    expect(await codeOf(service.completeRepositoryBinding(ids.project, ids.alice, started.attemptId, deps()))).toBe("GIT_APPROVAL_RETRY")
    expect(station.writes()).toHaveLength(0)
    expect(await prisma.gitMrApprovalAttempt.findUniqueOrThrow({ where: { id: started.attemptId } })).toMatchObject({ outcome: "discarded" })
  })

  it("a second press of 確認しました never writes twice; another user's attempt is not found", async () => {
    const started = await bindSet(CODE, true)
    station.press(started.confirmUrl, ALICE)
    expect(await codeOf(service.completeRepositoryBinding(ids.project, ids.bob, started.attemptId, deps()))).toBe("NOT_FOUND")
    const [a, b] = await Promise.all([
      codeOf(service.completeRepositoryBinding(ids.project, ids.alice, started.attemptId, deps())),
      codeOf(service.completeRepositoryBinding(ids.project, ids.alice, started.attemptId, deps())),
    ])
    expect([a, b].sort()).toEqual(["GIT_APPROVAL_BUSY", "resolved"])
    expect(await codeOf(service.completeRepositoryBinding(ids.project, ids.alice, started.attemptId, deps()))).toBe("GIT_APPROVAL_RETRY")
    expect(station.writes()).toHaveLength(1)
  })

  it("keeps binding and approval attempts apart (each feature finds only its own; the CHECK pins the columns)", async () => {
    const started = await bindSet(CODE, true)
    expect(await codeOf(mrService.completeMrApproval(ids.project, ids.alice, started.attemptId, deps()))).toBe("NOT_FOUND")
    const base = { projectId: ids.project, userId: ids.alice, stateCipher: "x", expiresAt: t }
    // An MR intent without its link, a binding with a link, a binding_set without a setting, an unbind without a binding.
    for (const data of [
      { ...base, intent: "approve" },
      { ...base, intent: "binding_set", gitLinkId: ids.link, headSha: "a".repeat(40), stationProjectId: BigInt(CODE), resolvesWorkItems: true },
      { ...base, intent: "binding_set", stationProjectId: BigInt(CODE) },
      { ...base, intent: "binding_remove", stationProjectId: BigInt(CODE) },
      { ...base, intent: "binding_remove", stationProjectId: BigInt(CODE), bindingId: BigInt(5), resolvesWorkItems: true },
    ]) {
      await expect(prisma.gitMrApprovalAttempt.create({ data })).rejects.toThrow()
    }
  })

  it("is not offered where Kanflow cannot tell which GitStation or who acts", async () => {
    expect(await service.getRepositoryBindings(ids.project, ids.carol, deps())).toMatchObject({ supported: true, canAct: false })
    expect(await codeOf(service.startRepositoryBinding(ids.project, ids.carol, { intent: "binding_set", repositoryId: CODE, resolvesWorkItems: true }, deps()))).toBe("GIT_APPROVAL_NO_EMPLOYEE_NUMBER")
    process.env.GITSTATION_ALLOWED_HOSTS = `${BIND_HOST},other.example`
    try {
      // Two hosts: the project's own GitStation repositories say which one.
      expect(await service.getRepositoryBindings(ids.project, ids.alice, deps())).toMatchObject({ supported: true })
      expect(await service.getRepositoryBindings(ids.other, ids.alice, deps())).toEqual({ supported: false, reason: "config" })
    } finally {
      process.env.GITSTATION_ALLOWED_HOSTS = BIND_HOST
    }
    await prisma.gitIntegration.update({ where: { projectId: ids.other }, data: { provider: "gitlab" } })
    try {
      expect(await service.getRepositoryBindings(ids.other, ids.alice, deps())).toEqual({ supported: false, reason: "provider" })
      expect(await codeOf(service.startRepositoryBinding(ids.other, ids.alice, { intent: "binding_set", repositoryId: CODE, resolvesWorkItems: true }, deps()))).toBe("GIT_BINDING_UNAVAILABLE")
    } finally {
      await prisma.gitIntegration.update({ where: { projectId: ids.other }, data: { provider: "gitstation" } })
    }
  })
})
