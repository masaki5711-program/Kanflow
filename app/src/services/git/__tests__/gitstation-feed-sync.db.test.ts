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
 * project using the integration; events reach only the repository of their GitStation project, bound to one Kanflow project; one reader
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
  const PATHS = ["app/portal", "app/api", "tools/cli"]
  /** State re-reads: the integration's development status (I1d), one listing for every repository. */
  const devStatusRequests = () => station.requests.filter((r) => /\/integrations\/[^/]+\/dev-status(\?|$)/.test(r))
  /** Paths whose merge request listing was asked for (the event path of a project with many named MRs). */
  const stateRequests = () =>
    station.requests.flatMap((r) => {
      const m = /^\/api\/v1\/projects\/(\d+)\/merge-requests(\?|$)/.exec(r)
      return m ? PATHS.filter((p) => station.projectId(p) === Number(m[1])) : []
    })
  /** The binding check of `path` (its integration-bindings read). */
  const bindingPath = (path: string) => `/projects/${station.projectId(path)}/integration-bindings`

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
    await prisma.gitRepository.updateMany({ where: { id: { in: [...ownIds] } }, data: { syncedAt: null, stationRereadAt: null, stationRereadFailures: 0, stationRereadNextAt: null, stationWriteFailures: 0, lastError: null } })
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
    // One development status listing for the three repositories of the two projects (no per-project listing).
    expect(devStatusRequests()).toHaveLength(1)
    expect(stateRequests()).toEqual([])
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
    // Routed by GitStation's project (bound to project A only), whatever its work items say: it can never reach project B.
    station.mergeRequest("merge_request.opened", 9, { project: "app/portal", title: "Other (PBI-1)", source_branch: "feature/PBI-1-other" }, station.workItem("PBI-1", ids.projectB))
    await sync()
    expect(eventRequests()).toHaveLength(1)
    const links = await prisma.gitLink.findMany({ where: { projectId: { in: [ids.projectA, ids.projectB] }, kind: "mr" }, select: { repositoryId: true, ref: true, state: true } })
    expect(links.map((l) => `${l.repositoryId}#${l.ref}:${l.state}`).sort()).toEqual([`${ids.repoA1}#1:opened`, `${ids.repoA1}#9:opened`, `${ids.repoA2}#2:opened`, `${ids.repoB}#3:opened`].sort())
    expect(links.filter((l) => l.repositoryId === ids.repoB).map((l) => l.ref)).toEqual(["3"])
  })

  it("stores a merge request closed without merging as closed (02 §8.2) and continues from the saved cursor", async () => {
    await started()
    const after = (await feedRow()).cursor
    station.mergeRequest("merge_request.opened", 1, { project: "app/portal" }, station.workItem("PBI-1", ids.projectA))
    station.mergeRequest("merge_request.closed", 1, { project: "app/portal" }, station.workItem("PBI-1", ids.projectA))
    await sync()
    expect(await prisma.gitLink.findFirstOrThrow({ where: { repositoryId: ids.repoA1, kind: "mr", ref: "1" } })).toMatchObject({ state: "closed", mergedAt: null })
    expect(new URL(`https://x${eventRequests()[0]}`).searchParams.get("cursor")).toBe(after!.replace("gitstation:v1:", ""))
  })

  it("keeps a stored merge time when the state is re-read (a stored merge time is never moved)", async () => {
    await started()
    station.mergeRequest("merge_request.opened", 1, { project: "app/portal" }, station.workItem("PBI-1", ids.projectA))
    const merged = station.mergeRequest("merge_request.merged", 1, { project: "app/portal" }, station.workItem("PBI-1", ids.projectA))
    await sync()
    const where = { repositoryId: ids.repoA1, kind: "mr", ref: "1" }
    expect((await prisma.gitLink.findFirstOrThrow({ where })).mergedAt?.toISOString()).toBe(merged.occurred_at)
    const exact = new Date("2026-09-30T12:00:00.000Z")
    await prisma.gitLink.updateMany({ where, data: { mergedAt: exact } })
    await service.resyncRepository(ids.projectA, ids.repoA1, actor, NOW)
    await sync()
    expect((await prisma.gitLink.findFirstOrThrow({ where })).mergedAt?.getTime()).toBe(exact.getTime())
  })

  it("a re-read from the development status keeps the stored author (it names none) and stores GitStation's merge time", async () => {
    await started()
    station.mergeRequest("merge_request.opened", 2, { project: "app/portal", title: "Signup (PBI-1)" }, station.workItem("PBI-1", ids.projectA))
    await sync()
    const where = { repositoryId: ids.repoA1, kind: "mr", ref: "2" }
    expect(await prisma.gitLink.findFirstOrThrow({ where })).toMatchObject({ author: "Dev One", state: "opened", mergedAt: null })
    // Merged and edited while Kanflow did not read; then the events are gone and the feed restarts.
    station.mergeRequest("merge_request.merged", 2, { project: "app/portal" }, station.workItem("PBI-1", ids.projectA))
    station.mergeRequest("merge_request.updated", 2, { project: "app/portal", title: "Signup, edited (PBI-1)" }, station.workItem("PBI-1", ids.projectA))
    station.prune()
    await service.resyncRepository(ids.projectA, ids.repoA1, actor, NOW)
    await sync()
    const link = await prisma.gitLink.findFirstOrThrow({ where })
    expect(link).toMatchObject({ author: "Dev One", state: "merged", title: "Signup, edited (PBI-1)" })
    // The merge time, not the later edit's time (what the per-project listing used to approximate it with).
    expect(link.mergedAt!.getTime()).toBeLessThan(link.occurredAt.getTime())
  })

  it("N11: stores who merged and the target branch from the merged event; a later re-read (which names no merger) keeps them", async () => {
    await started()
    const where = { repositoryId: ids.repoA1, kind: "mr", ref: "3" }
    station.mergeRequest("merge_request.opened", 3, { project: "app/portal", title: "Reset (PBI-1)" }, station.workItem("PBI-1", ids.projectA))
    await sync()
    expect(await prisma.gitLink.findFirstOrThrow({ where })).toMatchObject({ state: "opened", targetBranch: "main", mergedBy: null })
    station.mergeRequest("merge_request.merged", 3, { project: "app/portal" }, station.workItem("PBI-1", ids.projectA))
    await sync()
    expect(await prisma.gitLink.findFirstOrThrow({ where })).toMatchObject({ state: "merged", targetBranch: "main", mergedBy: "Dev One" })
    // The events are gone; the restart reads the development status, which does not say who merged.
    station.prune()
    await service.resyncRepository(ids.projectA, ids.repoA1, actor, NOW)
    await sync()
    expect(await prisma.gitLink.findFirstOrThrow({ where })).toMatchObject({ state: "merged", targetBranch: "main", mergedBy: "Dev One" })
  })

  it("stores pushed commits that name a PBI, linked from the history GitStation keeps", async () => {
    await started()
    station.pushed("app/portal", "refs/heads/main", [{ subject: "fix: lock (PBI-1)" }], [])
    await sync()
    const link = await prisma.gitLink.findFirstOrThrow({ where: { repositoryId: ids.repoA1, kind: "commit" } })
    expect(link).toMatchObject({ title: "fix: lock (PBI-1)", url: expect.stringContaining(`/-/projects/${station.projectId("app/portal")}/commit/`) })
  })

  it("dates a tag when first seen and keeps that date (GitStation tags carry none)", async () => {
    await started()
    station.setTags("app/portal", ["v1.0.0"])
    await sync()
    await feedSync.syncGitStationFeeds(clients(), new Date(NOW.getTime() + 86_400_000))
    const tag = await prisma.gitRelease.findFirstOrThrow({ where: { repositoryId: ids.repoA1, tag: "v1.0.0" } })
    expect(tag.releasedAt.getTime()).toBe(NOW.getTime())
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

  it("a repository without the integration id fails with its message, does not join the feed, and is marked for a re-read", async () => {
    await prisma.gitIntegration.update({ where: { projectId: ids.projectB }, data: { stationIntegrationId: null } })
    const results = await sync()
    expect(results.find((r) => r.repositoryId === ids.repoB)).toMatchObject({ ok: false, error: "integration" })
    expect(results.filter((r) => r.ok)).toHaveLength(2)
    expect((await prisma.gitRepository.findUniqueOrThrow({ where: { id: ids.repoB } })).stationRereadAt).not.toBeNull()
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

  it("does not move the cursor when a repository's binding could not be checked (transient: 503), and every repository shows the hold", async () => {
    await started()
    const before = (await feedRow()).cursor
    station.mergeRequest("merge_request.opened", 3, { project: "tools/cli" }, station.workItem("PBI-1", ids.projectB))
    station.fail(bindingPath("tools/cli"), 503, {}, { "retry-after": "999" })
    const results = await sync()
    expect(results.find((r) => r.repositoryId === ids.repoB)).toMatchObject({ ok: false, error: "unavailable" })
    expect((await feedRow()).cursor).toBe(before)
    expect(eventRequests()).toHaveLength(0)
    // A healthy-looking repository shows the hold too; the failing one keeps its own message.
    expect((await prisma.gitRepository.findUniqueOrThrow({ where: { id: ids.repoA1 } })).lastError).toBe(feedSync.HELD_MESSAGE)
    expect((await prisma.gitRepository.findUniqueOrThrow({ where: { id: ids.repoB } })).lastError).not.toBe(feedSync.HELD_MESSAGE)
  })

  it("counts consecutive holds on the feed (the log escalates at 3) and resets them once the cursor moves", async () => {
    await started()
    for (let i = 0; i < 3; i++) {
      station.fail(bindingPath("tools/cli"), 503, {}, { "retry-after": "999" })
      await sync()
    }
    expect((await feedRow()).consecutiveHolds).toBe(3)
    await sync()
    expect((await feedRow()).consecutiveHolds).toBe(0)
  })

  it("counts a feed read that failed without moving as a hold too (escalated like the others)", async () => {
    await started()
    const before = (await feedRow()).cursor
    station.mergeRequest("merge_request.opened", 1, { project: "app/portal" }, station.workItem("PBI-1", ids.projectA))
    for (let i = 0; i < 3; i++) {
      station.fail(`/projects/${station.projectId("app/portal")}/merge-requests/1`, 503, {}, { "retry-after": "999" })
      await sync()
    }
    const feed = await feedRow()
    expect(feed.cursor).toBe(before)
    expect(feed.consecutiveHolds).toBe(3)
    await sync()
    expect((await feedRow()).consecutiveHolds).toBe(0)
    expect(await prisma.gitLink.findFirst({ where: { repositoryId: ids.repoA1, ref: "1" } })).toMatchObject({ state: "opened" })
  })

  it.each([401, 403, 404])("a repository whose binding check answers %i is skipped and marked; the shared cursor moves on", async (status) => {
    await started()
    station.mergeRequest("merge_request.opened", 1, { project: "app/portal" }, station.workItem("PBI-1", ids.projectA))
    station.fail(bindingPath("tools/cli"), status, {})
    const results = await sync()
    expect(results.find((r) => r.repositoryId === ids.repoB)).toMatchObject({ ok: false })
    expect(results.filter((r) => r.ok)).toHaveLength(2)
    expect((await feedRow()).cursor).toBe(`gitstation:v1:${station.head()}`)
    expect((await prisma.gitRepository.findUniqueOrThrow({ where: { id: ids.repoB } })).stationRereadAt).not.toBeNull()
  })

  it("a repository that cannot be written 3 times in a row is set aside: the first two hold the cursor, the third lets it move", async () => {
    await started()
    const before = (await feedRow()).cursor
    station.mergeRequest("merge_request.opened", 3, { project: "tools/cli", source_branch: "feature/PBI-1-cli" }, station.workItem("PBI-1", ids.projectB))
    const delegate = prisma.gitLink
    const original = delegate.upsert.bind(delegate) as (...args: unknown[]) => unknown
    let failing = true
    vi.spyOn(delegate, "upsert").mockImplementation(((...args: unknown[]) => {
      const where = (args[0] as { create?: { repositoryId?: string } }).create
      if (failing && where?.repositoryId === ids.repoB) return Promise.reject(new Error("synthetic write failure"))
      return original(...args)
    }) as never)
    try {
      await sync()
      await sync()
      expect((await feedRow()).cursor).toBe(before)
      expect((await prisma.gitRepository.findUniqueOrThrow({ where: { id: ids.repoB } })).stationWriteFailures).toBe(2)
      await sync()
    } finally {
      failing = false
    }
    expect((await feedRow()).cursor).toBe(`gitstation:v1:${station.head()}`)
    const quarantined = await prisma.gitRepository.findUniqueOrThrow({ where: { id: ids.repoB } })
    expect(quarantined.stationWriteFailures).toBe(3)
    expect(quarantined.stationRereadAt).not.toBeNull()
    expect(quarantined.lastError).toContain("書き込めなかった")
    // Once it can be written again, its state is re-read (the event it missed comes back) and the count resets.
    await sync()
    expect(await prisma.gitLink.findFirst({ where: { repositoryId: ids.repoB, ref: "3" } })).toMatchObject({ state: "opened" })
    expect((await prisma.gitRepository.findUniqueOrThrow({ where: { id: ids.repoB } })).stationWriteFailures).toBe(0)
  })

  it("a read that loses its lease stops writing (nothing stored, cursor unchanged)", async () => {
    await started()
    const before = await feedRow()
    station.mergeRequest("merge_request.opened", 1, { project: "app/portal" }, station.workItem("PBI-1", ids.projectA))
    fetchImpl = async (input, init) => {
      if (new URL(String(input)).pathname.endsWith("/events")) {
        await prisma.gitStationFeed.update({ where: { id: before.id }, data: { leaseOwner: "another-reader", leaseUntil: new Date(Date.now() + 60_000) } })
      }
      return station.fetchImpl(input, init)
    }
    const results = await sync()
    expect(results.every((r) => r.error === "lease_lost")).toBe(true)
    expect(await prisma.gitLink.count({ where: { repositoryId: ids.repoA1 } })).toBe(0)
    expect((await feedRow()).cursor).toBe(before.cursor)
    await prisma.gitStationFeed.update({ where: { id: before.id }, data: { leaseOwner: null, leaseUntil: null } })
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
    expect(devStatusRequests()).toHaveLength(1)
    expect(await prisma.gitLink.findFirst({ where: { repositoryId: ids.repoB, ref: "3" } })).toMatchObject({ state: "opened" })
    expect((await prisma.gitRepository.findUniqueOrThrow({ where: { id: ids.repoB } })).stationRereadAt).toBeNull()
  })

  it("a repository new to an existing feed gets its state re-read; a failing re-read is counted and stays marked", async () => {
    await started()
    await prisma.gitRepository.update({ where: { id: ids.repoA2 }, data: { syncedAt: null } })
    station.failState("app/api")
    await sync()
    expect(devStatusRequests()).toHaveLength(1)
    const failed = await prisma.gitRepository.findUniqueOrThrow({ where: { id: ids.repoA2 } })
    expect(failed.stationRereadFailures).toBe(1)
    expect(failed.stationRereadAt).not.toBeNull()
    expect(failed.stationRereadNextAt?.getTime()).toBe(NOW.getTime() + feedSync.rereadBackoffMs(0))
    // Backed off: the next read does not ask again before that time.
    station.restoreState("app/api")
    station.requests.length = 0
    await sync()
    expect(devStatusRequests()).toHaveLength(0)
    await prisma.gitRepository.update({ where: { id: ids.repoA2 }, data: { stationRereadNextAt: new Date(NOW.getTime() - 1) } })
    await sync()
    const done = await prisma.gitRepository.findUniqueOrThrow({ where: { id: ids.repoA2 } })
    expect(done).toMatchObject({ stationRereadAt: null, stationRereadFailures: 0, stationRereadNextAt: null })
  })

  it("a GitStation repository can be AI knowledge (N12) and is listed with GitStation's link scheme", async () => {
    const { listKnowledgeRepos } = await import("../repo-search")
    await service.updateRepository(ids.projectA, ids.repoA1, { aiKnowledge: true }, actor)
    try {
      const repos = await listKnowledgeRepos(ids.projectA)
      expect(repos.find((r) => r.id === ids.repoA1)).toMatchObject({ provider: "gitstation" })
    } finally {
      // The other tests of this file read the repository as it was.
      await service.updateRepository(ids.projectA, ids.repoA1, { aiKnowledge: false }, actor)
    }
  })

  it("N2: a merge request's head is stored, and a failed check on it later turns its link red (check.completed names the commit only)", async () => {
    const { oid } = await import("./fake-gitstation")
    await started()
    station.mergeRequest("merge_request.opened", 1, { project: "app/portal", title: "Login (PBI-1)" }, station.workItem("PBI-1", ids.projectA))
    await sync()
    const where = { repositoryId: ids.repoA1, kind: "mr", ref: "1" }
    expect(await prisma.gitLink.findFirstOrThrow({ where })).toMatchObject({ headSha: oid(1), pipeline: null })
    // A later read: only the check event — Kanflow finds the merge request by the head it stored.
    station.checkRun(oid(1), "ci/build", "failure")
    station.requests.length = 0
    const results = await sync()
    expect(results.every((r) => r.ok)).toBe(true)
    expect(await prisma.gitLink.findFirstOrThrow({ where })).toMatchObject({ headSha: oid(1), pipeline: "failed" })
    expect(station.requests.some((r) => r.startsWith(`/api/v1/projects/${station.projectId("app/portal")}/commits/${oid(1)}/checks`))).toBe(true)
    // Green again: the dot follows.
    station.checkRun(oid(1), "ci/build", "success", { previous: "failure" })
    await sync()
    expect(await prisma.gitLink.findFirstOrThrow({ where })).toMatchObject({ pipeline: "success" })
  })

  it("N2: the stored-head lookup answers only for the read's own repositories of that GitStation project, and only open merge requests", async () => {
    const head = "d".repeat(40)
    const base = { projectId: ids.projectA, kind: "mr", title: "t", url: `${STATION}/x`, occurredAt: NOW, headSha: head }
    await prisma.gitLink.createMany({
      data: [
        { ...base, repositoryId: ids.repoA1, ref: "5", backlogItemId: ids.pbiA, state: "opened" },
        { ...base, repositoryId: ids.repoA1, ref: "6", backlogItemId: ids.pbiA, state: "merged" },
        { ...base, projectId: ids.projectB, repositoryId: ids.repoB, ref: "7", backlogItemId: ids.pbiB, state: "opened" },
      ],
    })
    // An open link stored before the head column (null head): offered for a read; a merged one never.
    await prisma.gitLink.createMany({
      data: [
        { ...base, headSha: null, repositoryId: ids.repoA1, ref: "8", backlogItemId: ids.pbiA, state: "opened" },
        { ...base, headSha: null, repositoryId: ids.repoA1, ref: "9", backlogItemId: ids.pbiA, state: "merged" },
      ],
    })
    const portal = station.projectId("app/portal")
    const resolve = feedSync.storedHeads([{ repositoryId: ids.repoA1, stationProjectId: portal }])
    expect(await resolve(portal, [head])).toEqual({ byHead: new Map([[head, [5]]]), headless: [8] })
    // Another GitStation project of the read: its own repositories only (repo B is not among them).
    expect(await resolve(station.projectId("tools/cli"), [head])).toEqual({ byHead: new Map(), headless: [] })
  })

  it("N2: a push moves the head — the old commit's red is not shown on the new one; links stored without a head get one from a check", async () => {
    const { oid } = await import("./fake-gitstation")
    await started()
    station.mergeRequest("merge_request.opened", 1, { project: "app/portal", title: "Login (PBI-1)" }, station.workItem("PBI-1", ids.projectA))
    station.checkRun(oid(1), "ci/build", "failure")
    await sync()
    const where = { repositoryId: ids.repoA1, kind: "mr", ref: "1" }
    expect(await prisma.gitLink.findFirstOrThrow({ where })).toMatchObject({ headSha: oid(1), pipeline: "failed" })
    // A fix is pushed: new head, no check reported yet → no dot (not the old red).
    station.moveHead(1, oid(77), "app/portal")
    station.mergeRequest("merge_request.pushed", 1, { project: "app/portal" }, station.workItem("PBI-1", ids.projectA))
    station.moveHead(1, oid(77), "app/portal")
    await sync()
    expect(await prisma.gitLink.findFirstOrThrow({ where })).toMatchObject({ headSha: oid(77), pipeline: null })

    // A link written before the head column existed: the next check on its project reads it and stores its head.
    await prisma.gitLink.updateMany({ where, data: { headSha: null } })
    station.checkRun(oid(77), "ci/build", "success")
    await sync()
    expect(await prisma.gitLink.findFirstOrThrow({ where })).toMatchObject({ headSha: oid(77), pipeline: "success" })
  })

  it("N3: the 触る範囲 check runs on GitStation merge requests (changed files from GitStation's context answer)", async () => {
    await started()
    const claim = await prisma.workClaim.create({
      data: { projectId: ids.projectA, backlogItemId: ids.pbiA, userId: ids.user, sessionId: "synthetic-session", branch: "feature/PBI-1-login-form", heartbeatAt: NOW, scopes: { create: [{ kind: "path", value: "app/src/login", createdAt: new Date(NOW.getTime() - 60_000) }] } },
    })
    try {
      station.mergeRequest("merge_request.opened", 1, { project: "app/portal", title: "Login (PBI-1)" }, station.workItem("PBI-1", ids.projectA))
      station.setChangedFiles(1, [{ path: "app/src/login/form.ts" }, { path: "app/src/billing/total.ts" }], { path: "app/portal" })
      await sync()
      expect(await prisma.gitLink.findFirstOrThrow({ where: { repositoryId: ids.repoA1, kind: "mr", ref: "1" } })).toMatchObject({
        outsideScopeCount: 1,
        outsideScopePaths: ["app/src/billing/total.ts"],
        scopeCheckedAt: NOW,
      })
    } finally {
      await prisma.workClaim.delete({ where: { id: claim.id } })
    }
  })

  it("N4 / N5: an open MR's blockers and predicted conflicts are stored (counts, never paths) and reach the panel and the card", async () => {
    await started()
    station.mergeRequest("merge_request.opened", 1, { project: "app/portal", title: "Login (PBI-1)" }, station.workItem("PBI-1", ids.projectA))
    station.setMergeStatus(1, [{ reason: "approvals_missing", detail: "rule=default required=2 counted=1" }], "app/portal")
    station.setConflicts(1, { status: "scanned", peers: [{ iid: 7, paths: ["secret/plan.md", "app/a.ts"] }] }, "app/portal")
    await sync()
    const row = await prisma.gitLink.findFirstOrThrow({ where: { repositoryId: ids.repoA1, kind: "mr", ref: "1" } })
    expect(row).toMatchObject({ mergeable: false, mergeStatusAt: NOW, mergeBlockers: [{ reason: "approvals_missing", detail: "rule=default required=2 counted=1" }] })
    expect(row.conflictPrediction).toMatchObject({ status: "scanned", peers: [{ iid: 7, files: 2, outcome: "conflict" }] })
    expect(JSON.stringify(row.conflictPrediction)).not.toContain("secret/plan.md")

    const panel = await service.getPbiGitPanel(ids.projectA, ids.pbiA)
    expect(panel.links?.find((l) => l.kind === "mr")?.merge).toMatchObject({ blockers: [{ reason: "approvals_missing" }], conflicts: { peers: [{ iid: 7, files: 2 }] } })
    const { summaries } = await service.getGitSummaries(ids.projectA, [ids.pbiA])
    expect(summaries[ids.pbiA]).toMatchObject({ openMrs: 1, blockedMrs: 1, conflictMrs: 1 })

    // Closed: nothing blocks it any more — the stored state is cleared, without a call.
    station.mergeRequest("merge_request.closed", 1, { project: "app/portal" }, station.workItem("PBI-1", ids.projectA))
    station.requests.length = 0
    await sync()
    expect(await prisma.gitLink.findFirstOrThrow({ where: { repositoryId: ids.repoA1, kind: "mr", ref: "1" } })).toMatchObject({ mergeStatusAt: null, mergeBlockers: null, conflictPrediction: null, mergeable: null })
    expect(station.requests.some((r) => r.includes("/merge-requests/1/status"))).toBe(false)
  })

  it("N5: a push on the other side re-reads a stored prediction (GitStation sends no event when it clears)", async () => {
    await started()
    const portal = "app/portal"
    station.mergeRequest("merge_request.opened", 2, { project: portal, title: "Form (PBI-1)", source_branch: "feature/PBI-1-form" }, station.workItem("PBI-1", ids.projectA))
    station.mergeRequest("merge_request.opened", 3, { project: portal, title: "Login (PBI-1)", source_branch: "feature/PBI-1-login" }, station.workItem("PBI-1", ids.projectA))
    station.setConflicts(2, { status: "scanned", peers: [{ iid: 3, paths: ["a"] }] }, portal)
    station.setConflicts(3, { status: "scanned", peers: [{ iid: 2, paths: ["a"] }] }, portal)
    await sync()
    expect((await prisma.gitLink.findFirstOrThrow({ where: { repositoryId: ids.repoA1, ref: "2" } })).conflictPrediction).toMatchObject({ peers: [{ iid: 3 }] })
    // !3 is rebased: the conflict is gone on both sides, but only !3 has an event.
    station.setConflicts(2, { status: "scanned", peers: [] }, portal)
    station.setConflicts(3, { status: "scanned", peers: [] }, portal)
    station.mergeRequest("merge_request.pushed", 3, { project: portal }, station.workItem("PBI-1", ids.projectA))
    await sync()
    expect((await prisma.gitLink.findFirstOrThrow({ where: { repositoryId: ids.repoA1, ref: "2" } })).conflictPrediction).toMatchObject({ peers: [] })
  })

  it("N4: a status that cannot be read clears what was stored (an old answer is never shown as current)", async () => {
    await started()
    station.mergeRequest("merge_request.opened", 1, { project: "app/portal", title: "Login (PBI-1)" }, station.workItem("PBI-1", ids.projectA))
    station.setMergeStatus(1, [{ reason: "draft" }], "app/portal")
    await sync()
    const where = { repositoryId: ids.repoA1, kind: "mr", ref: "1" }
    expect((await prisma.gitLink.findFirstOrThrow({ where })).mergeStatusAt).toEqual(NOW)
    station.mergeRequest("merge_request.updated", 1, { project: "app/portal" }, station.workItem("PBI-1", ids.projectA))
    station.fail(`/projects/${station.projectId("app/portal")}/merge-requests/1/status`, 403, { error_code: "FG-AUTHZ-0001" }, undefined, 5)
    const results = await sync()
    expect(results.every((r) => r.ok)).toBe(true)
    expect(await prisma.gitLink.findFirstOrThrow({ where })).toMatchObject({ mergeStatusAt: null, mergeBlockers: null })
  })

  it("permanent failures skip, transient ones hold; re-reads back off exponentially up to a day", async () => {
    const { GitStationError } = await import("@/lib/git/gitstation-client")
    const { NotBoundError } = await import("../gitstation-source")
    for (const kind of ["auth", "forbidden", "not_found", "host_not_allowed"] as const) expect(feedSync.isPermanentFailure(new GitStationError(kind, "x"))).toBe(true)
    expect(feedSync.isPermanentFailure(new NotBoundError())).toBe(true)
    for (const kind of ["network", "rate_limited", "unavailable", "invalid_response", "http"] as const) expect(feedSync.isPermanentFailure(new GitStationError(kind, "x"))).toBe(false)
    expect(feedSync.isPermanentFailure(new Error("db down"))).toBe(false)
    expect([0, 1, 2].map(feedSync.rereadBackoffMs)).toEqual([600_000, 1_200_000, 2_400_000])
    expect(feedSync.rereadBackoffMs(30)).toBe(86_400_000)
  })

  it("the activity of an automatic completion names GitStation", () => {
    expect(gitSync.gitActor("gitstation").userName).toBe("GitStation")
    expect(gitSync.gitActor("gitlab").userName).toBe("GitLab")
  })
})
