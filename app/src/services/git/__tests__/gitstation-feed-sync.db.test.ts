import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { createFakeGitStation, INTEGRATION, STATION, STATION_HOST, TOKEN, type FakeGitStation } from "./fake-gitstation"

/**
 * The GitStation feed sync against a REAL PostgreSQL and a fake GitStation. Skipped unless
 * KANFLOW_DB_TESTS=1 and DATABASE_* point at a migrated, disposable test database (synthetic
 * rows only, removed afterwards), e.g. a database of ops/test-env/compose.yml:
 *
 *   KANFLOW_DB_TESTS=1 npx vitest run src/services/git/__tests__/gitstation-feed-sync.db.test.ts
 *
 * What it pins (plan 11 K3, plan 12 §2.4): one feed read per poll for every repository of every
 * project using the integration; events reach only the project their work items name; one reader
 * per feed (lease); the cursor saved as a compare-and-set and held whenever a repository could not
 * be checked or written; a repository that is not bound is skipped and re-read when it returns;
 * 過去分を再同期 restarts the feed; a closed-unmerged merge request is stored as closed (02 §8.2).
 */
const enabled = process.env.KANFLOW_DB_TESTS === "1"

describe.skipIf(!enabled)("GitStation feed sync on a real database (KANFLOW_DB_TESTS=1)", () => {
  const tag = `k3test-${Date.now().toString(36)}`
  const ids = { projectA: `${tag}-pa`, projectB: `${tag}-pb`, repoA1: `${tag}-ra1`, repoA2: `${tag}-ra2`, repoB: `${tag}-rb`, pbiA: `${tag}-ba`, pbiB: `${tag}-bb`, user: `${tag}-u` }
  const actor = { userId: ids.user, userName: "synthetic", systemRole: "admin" }
  const ownIds = new Set([ids.repoA1, ids.repoA2, ids.repoB])
  let prisma: typeof import("@/lib/prisma").prisma
  let feedSync: typeof import("../gitstation-feed-sync")
  let gitSync: typeof import("../git-sync")
  let service: typeof import("../git.service")
  let createGitStationClient: typeof import("@/lib/git/gitstation-client").createGitStationClient
  let station: FakeGitStation
  let fetchImpl: typeof fetch
  const clients = () => ({ gitstation: (o: { apiBase: string; token: string; integrationId: string }) => createGitStationClient({ ...o, fetchImpl, sleep: async () => undefined }) })
  const NOW = new Date("2026-10-02T00:00:00.000Z")
  const feedRow = () => prisma.gitStationFeed.findFirstOrThrow({ where: { apiBase: STATION, integrationId: INTEGRATION } })
  const sync = async () => (await feedSync.syncGitStationFeeds(clients(), NOW)).filter((r) => ownIds.has(r.repositoryId))
  const eventRequests = () => station.requests.filter((r) => /\/integrations\/[^/]+\/events(\?|$)/.test(r))
  const stateRequests = () => station.requests.filter((r) => r.includes("/dev_status")).map((r) => new URL(`https://x${r}`).searchParams.get("project"))

  beforeAll(async () => {
    process.env.INTEGRATION_SECRET_KEY ||= "synthetic-k3-test-key"
    process.env.GITSTATION_ALLOWED_HOSTS = STATION_HOST
    prisma = (await import("@/lib/prisma")).prisma
    feedSync = await import("../gitstation-feed-sync")
    gitSync = await import("../git-sync")
    service = await import("../git.service")
    createGitStationClient = (await import("@/lib/git/gitstation-client")).createGitStationClient
    const { seal } = await import("@/lib/secret-box")
    await prisma.user.create({ data: { id: ids.user, name: tag, email: `${tag}@example.test`, password: "synthetic", role: "admin" } })
    for (const projectId of [ids.projectA, ids.projectB]) {
      await prisma.project.create({ data: { id: projectId, name: projectId } })
      await prisma.gitIntegration.create({ data: { projectId, enabled: true, provider: "gitstation", stationIntegrationId: INTEGRATION, tokenCipher: seal(TOKEN) } })
    }
    await prisma.productBacklogItem.create({ data: { id: ids.pbiA, projectId: ids.projectA, displayId: 1, initiative: "synthetic" } })
    await prisma.productBacklogItem.create({ data: { id: ids.pbiB, projectId: ids.projectB, displayId: 1, initiative: "synthetic" } })
    const repo = (id: string, projectId: string, path: string, sortOrder: number) => ({ id, projectId, name: path, webUrl: `${STATION}/${path}`, apiBase: STATION, repoPath: path, sortOrder })
    await prisma.gitRepository.createMany({
      data: [repo(ids.repoA1, ids.projectA, "app/portal", 0), repo(ids.repoA2, ids.projectA, "app/api", 1), repo(ids.repoB, ids.projectB, "tools/cli", 0)],
    })
  })

  afterAll(async () => {
    if (!prisma) return
    const projects = [ids.projectA, ids.projectB]
    await prisma.gitLink.deleteMany({ where: { projectId: { in: projects } } })
    await prisma.gitRelease.deleteMany({ where: { projectId: { in: projects } } }).catch(() => undefined)
    await prisma.gitRepository.deleteMany({ where: { projectId: { in: projects } } })
    await prisma.gitIntegration.deleteMany({ where: { projectId: { in: projects } } })
    await prisma.gitStationFeed.deleteMany({ where: { apiBase: STATION, integrationId: INTEGRATION } })
    await prisma.activityLog.deleteMany({ where: { projectId: { in: projects } } }).catch(() => undefined)
    await prisma.productBacklogItem.deleteMany({ where: { id: { in: [ids.pbiA, ids.pbiB] } } })
    await prisma.project.deleteMany({ where: { id: { in: projects } } })
    await prisma.user.deleteMany({ where: { id: ids.user } })
  })

  beforeEach(async () => {
    station = createFakeGitStation()
    fetchImpl = station.fetchImpl
    station.bind("app/portal", [ids.projectA])
    station.bind("app/api", [ids.projectA])
    station.bind("tools/cli", [ids.projectB])
    await prisma.gitStationFeed.deleteMany({ where: { apiBase: STATION, integrationId: INTEGRATION } })
    await prisma.gitLink.deleteMany({ where: { projectId: { in: [ids.projectA, ids.projectB] } } })
    await prisma.gitRepository.updateMany({ where: { id: { in: [...ownIds] } }, data: { syncedAt: null, stationRereadAt: null, stationRereadFailures: 0, lastError: null } })
    await prisma.gitIntegration.updateMany({ where: { projectId: { in: [ids.projectA, ids.projectB] } }, data: { stationIntegrationId: INTEGRATION } })
  })

  /** First read (restart: head + state) so the feed has a cursor; then the test's events. */
  const started = async () => {
    await sync()
    station.requests.length = 0
  }

  it("the first read restarts the feed: head, every repository's state, then the feed — once for three repositories of two projects", async () => {
    station.mergeRequest("merge_request.merged", 1, { project: "app/portal", title: "Login (PBI-1)" }, station.workItem("PBI-1", ids.projectA))
    station.prune()
    const results = await sync()
    expect(results.map((r) => r.ok)).toEqual([true, true, true])
    expect(eventRequests()).toHaveLength(1)
    expect(stateRequests().sort()).toEqual(["app/api", "app/portal", "tools/cli"])
    expect(await prisma.gitLink.findFirst({ where: { repositoryId: ids.repoA1, ref: "1" } })).toMatchObject({ state: "merged" })
    const feed = await feedRow()
    expect(feed.cursor).toBe(`gitstation:v1:${station.head()}`)
    expect(feed.tokenFingerprint).toBe(feedSync.tokenFingerprint(TOKEN))
    expect(feed.tokenFingerprint).not.toContain(TOKEN.slice(0, 8))
    expect(feed.leaseOwner).toBeNull()
  })

  it("routes each event to its own project's repository and reads the feed ONCE per poll", async () => {
    await started()
    station.mergeRequest("merge_request.opened", 1, { project: "app/portal", title: "Login (PBI-1)" }, station.workItem("PBI-1", ids.projectA))
    station.mergeRequest("merge_request.opened", 2, { project: "app/api", title: "API (PBI-1)", source_branch: "feature/PBI-1-api" }, station.workItem("PBI-1", ids.projectA))
    station.mergeRequest("merge_request.opened", 3, { project: "tools/cli", title: "CLI (PBI-1)", source_branch: "feature/PBI-1-cli" }, station.workItem("PBI-1", ids.projectB))
    // Mis-addressed: a project-B work item on a project-A path reaches neither.
    station.mergeRequest("merge_request.opened", 9, { project: "app/portal", title: "Leak (PBI-1)", source_branch: "feature/PBI-1-leak" }, station.workItem("PBI-1", ids.projectB))
    await sync()
    expect(eventRequests()).toHaveLength(1)
    const links = await prisma.gitLink.findMany({ where: { projectId: { in: [ids.projectA, ids.projectB] }, kind: "mr" }, select: { repositoryId: true, ref: true, state: true } })
    expect(links.map((l) => `${l.repositoryId}#${l.ref}:${l.state}`).sort()).toEqual([`${ids.repoA1}#1:opened`, `${ids.repoA2}#2:opened`, `${ids.repoB}#3:opened`].sort())
  })

  it("stores a merge request closed without merging as closed (02 §8.2) and continues from the saved cursor", async () => {
    await started()
    const after = (await feedRow()).cursor
    station.mergeRequest("merge_request.opened", 1, { project: "app/portal" }, station.workItem("PBI-1", ids.projectA))
    station.mergeRequest("merge_request.closed", 1, { project: "app/portal" }, station.workItem("PBI-1", ids.projectA))
    await sync()
    expect(await prisma.gitLink.findFirstOrThrow({ where: { repositoryId: ids.repoA1, kind: "mr", ref: "1" } })).toMatchObject({ state: "closed", mergedAt: null })
    expect(new URL(`https://x${eventRequests()[0]}`).searchParams.get("after")).toBe(after!.replace("gitstation:v1:", ""))
  })

  it("今すぐ同期 of one repository reads its whole feed (the shared cursor never passes the other repositories' events)", async () => {
    await started()
    station.mergeRequest("merge_request.opened", 2, { project: "app/api", source_branch: "feature/PBI-1-api" }, station.workItem("PBI-1", ids.projectA))
    station.mergeRequest("merge_request.opened", 3, { project: "tools/cli", source_branch: "feature/PBI-1-cli" }, station.workItem("PBI-1", ids.projectB))
    expect(await gitSync.syncRepository(ids.repoA2, clients(), NOW)).toMatchObject({ repositoryId: ids.repoA2, ok: true })
    expect(await prisma.gitLink.count({ where: { repositoryId: ids.repoB, kind: "mr" } })).toBe(1)
  })

  it("プロジェクトの同期 reads each feed once, not once per repository", async () => {
    await started()
    const results = await gitSync.syncProject(ids.projectA, clients())
    expect(results.map((r) => r.repositoryId).sort()).toEqual([ids.repoA1, ids.repoA2].sort())
    expect(eventRequests()).toHaveLength(1)
  })

  it("one reader per feed: a read already holding the lease makes the others 'busy' and nothing is read twice", async () => {
    await started()
    station.mergeRequest("merge_request.opened", 1, { project: "app/portal" }, station.workItem("PBI-1", ids.projectA))
    const [a, b] = await Promise.all([sync(), sync()])
    const errors = [...a, ...b].map((r) => r.error ?? "ok")
    expect(errors.filter((e) => e === "busy")).toHaveLength(3)
    expect(eventRequests()).toHaveLength(1)
    await prisma.gitStationFeed.updateMany({ where: { apiBase: STATION, integrationId: INTEGRATION }, data: { leaseOwner: "someone", leaseUntil: new Date(Date.now() + 60_000) } })
    station.requests.length = 0
    expect((await sync()).every((r) => r.error === "busy")).toBe(true)
    expect(station.requests).toEqual([])
  })

  it("the cursor is a compare-and-set: a resync during the read is not undone", async () => {
    await started()
    station.mergeRequest("merge_request.opened", 1, { project: "app/portal" }, station.workItem("PBI-1", ids.projectA))
    fetchImpl = async (input, init) => {
      if (new URL(String(input)).pathname.endsWith("/events")) {
        await service.resyncRepository(ids.projectA, ids.repoA1, actor, NOW)
      }
      return station.fetchImpl(input, init)
    }
    await sync()
    const feed = await feedRow()
    expect(feed.cursor).toBeNull()
    expect(feed.generation).toBe(1)
  })

  it("過去分を再同期 restarts the feed in one transaction with the repository's mark; without an integration id it is refused", async () => {
    await started()
    const before = await feedRow()
    await service.resyncRepository(ids.projectA, ids.repoA1, actor, NOW)
    const after = await prisma.gitStationFeed.findFirstOrThrow({ where: { id: before.id } })
    expect(after.cursor).toBeNull()
    expect(after.generation).toBe(before.generation + 1)
    expect((await prisma.gitRepository.findUniqueOrThrow({ where: { id: ids.repoA1 } })).stationRereadAt).not.toBeNull()

    await prisma.gitIntegration.update({ where: { projectId: ids.projectB }, data: { stationIntegrationId: null } })
    const generation = (await prisma.gitRepository.findUniqueOrThrow({ where: { id: ids.repoB } })).syncGeneration
    await expect(service.resyncRepository(ids.projectB, ids.repoB, actor, NOW)).rejects.toMatchObject({ status: 400, code: "GIT_RESYNC_UNAVAILABLE" })
    expect((await prisma.gitRepository.findUniqueOrThrow({ where: { id: ids.repoB } })).syncGeneration).toBe(generation)
  })

  it("an unreadable stored feed position marks every repository with the 過去分を再同期 message, reading nothing", async () => {
    await started()
    await prisma.gitStationFeed.updateMany({ where: { apiBase: STATION, integrationId: INTEGRATION }, data: { cursor: "corrupt" } })
    const results = await sync()
    expect(results.every((r) => !r.ok && r.error === "cursor")).toBe(true)
    expect(eventRequests()).toHaveLength(0)
    expect((await prisma.gitRepository.findUniqueOrThrow({ where: { id: ids.repoA1 } })).lastError).toContain("過去分を再同期")
  })

  it("a repository without the integration id fails with its message and does not join the feed", async () => {
    await prisma.gitIntegration.update({ where: { projectId: ids.projectB }, data: { stationIntegrationId: null } })
    const results = await sync()
    expect(results.find((r) => r.repositoryId === ids.repoB)).toMatchObject({ ok: false, error: "integration" })
    expect(results.filter((r) => r.ok)).toHaveLength(2)
  })

  it("does not move the cursor when a repository could not be written (and says so on the feed)", async () => {
    await started()
    const before = (await feedRow()).cursor
    station.mergeRequest("merge_request.opened", 1, { project: "app/portal" }, station.workItem("PBI-1", ids.projectA))
    // One failing write, then the real one (a spy on a Prisma delegate cannot be restored: it stays, passing through).
    const delegate = prisma.gitLink
    const original = delegate.upsert.bind(delegate) as (...args: unknown[]) => unknown
    let failed = false
    vi.spyOn(delegate, "upsert").mockImplementation(((...args: unknown[]) => {
      if (failed) return original(...args)
      failed = true
      return Promise.reject(new Error("synthetic write failure"))
    }) as never)
    await sync()
    const feed = await feedRow()
    expect(feed.cursor).toBe(before)
    expect(feed.lastError).toBe(feedSync.HELD_MESSAGE)
  })

  it("does not move the cursor when a repository's binding could not be checked (GitStation answered 503)", async () => {
    await started()
    const before = (await feedRow()).cursor
    station.mergeRequest("merge_request.opened", 3, { project: "tools/cli" }, station.workItem("PBI-1", ids.projectB))
    station.fail("/projects/tools%2Fcli", 503, {}, { "retry-after": "999" })
    const results = await sync()
    expect(results.find((r) => r.repositoryId === ids.repoB)).toMatchObject({ ok: false, error: "unavailable" })
    expect((await feedRow()).cursor).toBe(before)
    expect(eventRequests()).toHaveLength(0)
  })

  it("a repository GitStation no longer binds to its project is skipped and marked; its state is re-read when the binding returns", async () => {
    await started()
    station.bind("tools/cli", [ids.projectA])
    station.mergeRequest("merge_request.opened", 3, { project: "tools/cli", source_branch: "feature/PBI-1-cli" }, station.workItem("PBI-1", ids.projectB))
    const results = await sync()
    expect(results.find((r) => r.repositoryId === ids.repoB)).toMatchObject({ ok: false, error: "not_bound" })
    expect(results.filter((r) => r.ok)).toHaveLength(2)
    const marked = await prisma.gitRepository.findUniqueOrThrow({ where: { id: ids.repoB } })
    expect(marked.stationRereadAt).not.toBeNull()
    expect(marked.lastError).toContain("結び付けられていません")
    expect((await feedRow()).cursor).toBe(`gitstation:v1:${station.head()}`)
    expect(await prisma.gitLink.count({ where: { repositoryId: ids.repoB, kind: "mr" } })).toBe(0)

    station.bind("tools/cli", [ids.projectB])
    station.requests.length = 0
    await sync()
    expect(stateRequests()).toEqual(["tools/cli"])
    expect(await prisma.gitLink.findFirst({ where: { repositoryId: ids.repoB, ref: "3" } })).toMatchObject({ state: "opened" })
    expect((await prisma.gitRepository.findUniqueOrThrow({ where: { id: ids.repoB } })).stationRereadAt).toBeNull()
  })

  it("a repository new to an existing feed gets its state re-read; a failing re-read is counted and stays marked", async () => {
    await started()
    await prisma.gitRepository.update({ where: { id: ids.repoA2 }, data: { syncedAt: null } })
    station.failState("app/api")
    await sync()
    expect(stateRequests()).toEqual(["app/api"])
    const failed = await prisma.gitRepository.findUniqueOrThrow({ where: { id: ids.repoA2 } })
    expect(failed.stationRereadFailures).toBe(1)
    expect(failed.stationRereadAt).not.toBeNull()
    station.restoreState("app/api")
    await sync()
    const done = await prisma.gitRepository.findUniqueOrThrow({ where: { id: ids.repoA2 } })
    expect(done).toMatchObject({ stationRereadAt: null, stationRereadFailures: 0 })
  })

  it("a GitStation repository cannot be AI knowledge (no file API yet)", async () => {
    await expect(service.updateRepository(ids.projectA, ids.repoA1, { aiKnowledge: true }, actor)).rejects.toMatchObject({ status: 400, code: "GIT_KNOWLEDGE_UNSUPPORTED" })
  })

  it("the activity of an automatic completion names GitStation", () => {
    expect(gitSync.gitActor("gitstation").userName).toBe("GitStation")
    expect(gitSync.gitActor("gitlab").userName).toBe("GitLab")
  })
})
