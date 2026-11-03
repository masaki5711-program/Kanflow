import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { createFakeGitStation, INTEGRATION, STATION, TOKEN, type FakeGitStation } from "./fake-gitstation"

/**
 * The GitStation feed sync against a REAL PostgreSQL and a fake GitStation. Skipped unless
 * KANFLOW_DB_TESTS=1 and DATABASE_* point at a migrated, disposable test database (synthetic
 * rows only, removed afterwards), e.g. a database of ops/test-env/compose.yml:
 *
 *   KANFLOW_DB_TESTS=1 npx vitest run src/services/git/__tests__/gitstation-feed-sync.db.test.ts
 *
 * What it pins (plan 11 K3, plan 12 §2.4): one feed read per poll for every repository of every
 * project using the integration; events reach only the project their work items name; the feed
 * cursor moves only after every repository was written; 過去分を再同期 restarts the feed;
 * a closed-unmerged merge request is stored as closed (02 §8.2).
 */
const enabled = process.env.KANFLOW_DB_TESTS === "1"

describe.skipIf(!enabled)("GitStation feed sync on a real database (KANFLOW_DB_TESTS=1)", () => {
  const tag = `k3test-${Date.now().toString(36)}`
  const ids = { projectA: `${tag}-pa`, projectB: `${tag}-pb`, repoA1: `${tag}-ra1`, repoA2: `${tag}-ra2`, repoB: `${tag}-rb`, pbiA: `${tag}-ba`, pbiB: `${tag}-bb`, user: `${tag}-u` }
  const actor = { userId: ids.user, userName: "synthetic", systemRole: "admin" }
  let prisma: typeof import("@/lib/prisma").prisma
  let feedSync: typeof import("../gitstation-feed-sync")
  let gitSync: typeof import("../git-sync")
  let service: typeof import("../git.service")
  let createGitStationClient: typeof import("@/lib/git/gitstation-client").createGitStationClient
  let station: FakeGitStation
  const clients = () => ({ gitstation: (o: { apiBase: string; token: string; integrationId: string }) => createGitStationClient({ ...o, fetchImpl: station.fetchImpl, sleep: async () => undefined }) })
  const NOW = new Date("2026-10-02T00:00:00.000Z")

  beforeAll(async () => {
    process.env.INTEGRATION_SECRET_KEY ||= "synthetic-k3-test-key"
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
    await prisma.gitLink.deleteMany({ where: { projectId: { in: [ids.projectA, ids.projectB] } } })
    await prisma.gitRelease.deleteMany({ where: { projectId: { in: [ids.projectA, ids.projectB] } } }).catch(() => undefined)
    await prisma.gitRepository.deleteMany({ where: { projectId: { in: [ids.projectA, ids.projectB] } } })
    await prisma.gitIntegration.deleteMany({ where: { projectId: { in: [ids.projectA, ids.projectB] } } })
    await prisma.gitStationFeed.deleteMany({ where: { apiBase: STATION, integrationId: INTEGRATION } })
    await prisma.activityLog.deleteMany({ where: { projectId: { in: [ids.projectA, ids.projectB] } } }).catch(() => undefined)
    await prisma.productBacklogItem.deleteMany({ where: { id: { in: [ids.pbiA, ids.pbiB] } } })
    await prisma.project.deleteMany({ where: { id: { in: [ids.projectA, ids.projectB] } } })
    await prisma.user.deleteMany({ where: { id: ids.user } })
  })

  beforeEach(async () => {
    station = createFakeGitStation()
    station.bind("app/portal", [ids.projectA])
    station.bind("app/api", [ids.projectA])
    station.bind("tools/cli", [ids.projectB])
    await prisma.gitStationFeed.deleteMany({ where: { apiBase: STATION, integrationId: INTEGRATION } })
    await prisma.gitLink.deleteMany({ where: { projectId: { in: [ids.projectA, ids.projectB] } } })
  })

  const eventRequests = () => station.requests.filter((r) => r.startsWith(`/api/v1/integrations/${INTEGRATION}/events?`) || r === `/api/v1/integrations/${INTEGRATION}/events`)
  const ownResults = <T extends { repositoryId: string }>(results: T[]): T[] => results.filter((r) => Object.values(ids).includes(r.repositoryId))

  it("reads the feed ONCE for three repositories of two projects and routes each event to its own project", async () => {
    station.mergeRequest("merge_request.opened", 1, { project: "app/portal", title: "Login (PBI-1)" }, station.workItem("PBI-1", ids.projectA))
    station.mergeRequest("merge_request.opened", 2, { project: "app/api", title: "API (PBI-1)", source_branch: "feature/PBI-1-api" }, station.workItem("PBI-1", ids.projectA))
    station.mergeRequest("merge_request.opened", 3, { project: "tools/cli", title: "CLI (PBI-1)", source_branch: "feature/PBI-1-cli" }, station.workItem("PBI-1", ids.projectB))
    // Mis-addressed: a project-B work item on a project-A path is not taken by A (nor by B: other path).
    station.mergeRequest("merge_request.opened", 9, { project: "app/portal", title: "Leak (PBI-1)", source_branch: "feature/PBI-1-leak" }, station.workItem("PBI-1", ids.projectB))

    const results = ownResults(await feedSync.syncGitStationFeeds(clients(), NOW))
    expect(results.map((r) => r.ok)).toEqual([true, true, true])
    expect(eventRequests()).toHaveLength(1)

    const links = await prisma.gitLink.findMany({ where: { projectId: { in: [ids.projectA, ids.projectB] }, kind: "mr" }, select: { projectId: true, repositoryId: true, ref: true, state: true } })
    expect(links.map((l) => `${l.repositoryId}#${l.ref}:${l.state}`).sort()).toEqual([`${ids.repoA1}#1:opened`, `${ids.repoA2}#2:opened`, `${ids.repoB}#3:opened`].sort())

    const feed = await prisma.gitStationFeed.findFirstOrThrow({ where: { apiBase: STATION, integrationId: INTEGRATION } })
    expect(feed.cursor).toBe(`gitstation:v1:${station.head()}`)
    expect(feed.tokenFingerprint).toBe(feedSync.tokenFingerprint(TOKEN))
    expect(feed.tokenFingerprint).not.toContain(TOKEN)
  })

  it("stores a merge request closed without merging as closed (02 §8.2) and continues from the saved cursor", async () => {
    station.mergeRequest("merge_request.opened", 1, { project: "app/portal" }, station.workItem("PBI-1", ids.projectA))
    await feedSync.syncGitStationFeeds(clients(), NOW)
    station.mergeRequest("merge_request.closed", 1, { project: "app/portal" }, station.workItem("PBI-1", ids.projectA))
    await feedSync.syncGitStationFeeds(clients(), NOW)
    const link = await prisma.gitLink.findFirstOrThrow({ where: { repositoryId: ids.repoA1, kind: "mr", ref: "1" } })
    expect(link).toMatchObject({ state: "closed", mergedAt: null })
    const afters = eventRequests().map((r) => new URL(`https://x${r}`).searchParams.get("after"))
    expect(afters[0]).toBeNull()
    expect(afters[1]).not.toBeNull()
  })

  it("今すぐ同期 of one repository reads its whole feed (the shared cursor never passes the other repositories' events)", async () => {
    station.mergeRequest("merge_request.opened", 2, { project: "app/api", source_branch: "feature/PBI-1-api" }, station.workItem("PBI-1", ids.projectA))
    station.mergeRequest("merge_request.opened", 3, { project: "tools/cli", source_branch: "feature/PBI-1-cli" }, station.workItem("PBI-1", ids.projectB))
    const result = await gitSync.syncRepository(ids.repoA2, clients(), NOW)
    expect(result).toMatchObject({ repositoryId: ids.repoA2, ok: true })
    expect(await prisma.gitLink.count({ where: { repositoryId: ids.repoB, kind: "mr" } })).toBe(1)
  })

  it("過去分を再同期 restarts the feed: the next read starts from the beginning and the generation moves", async () => {
    station.mergeRequest("merge_request.opened", 1, { project: "app/portal" }, station.workItem("PBI-1", ids.projectA))
    await feedSync.syncGitStationFeeds(clients(), NOW)
    const before = await prisma.gitStationFeed.findFirstOrThrow({ where: { apiBase: STATION, integrationId: INTEGRATION } })
    await service.resyncRepository(ids.projectA, ids.repoA1, actor, NOW)
    const after = await prisma.gitStationFeed.findFirstOrThrow({ where: { id: before.id } })
    expect(after.cursor).toBeNull()
    expect(after.generation).toBe(before.generation + 1)
  })

  it("an unreadable stored feed position marks every repository of the feed with the 過去分を再同期 message, reading nothing", async () => {
    await feedSync.syncGitStationFeeds(clients(), NOW)
    await prisma.gitStationFeed.updateMany({ where: { apiBase: STATION, integrationId: INTEGRATION }, data: { cursor: "corrupt" } })
    station.requests.length = 0
    const results = ownResults(await feedSync.syncGitStationFeeds(clients(), NOW))
    expect(results.every((r) => !r.ok && r.error === "cursor")).toBe(true)
    expect(eventRequests()).toHaveLength(0)
    const repo = await prisma.gitRepository.findUniqueOrThrow({ where: { id: ids.repoA1 } })
    expect(repo.lastError).toContain("過去分を再同期")
  })

  it("a repository without the integration id fails with its message and does not join the feed", async () => {
    await prisma.gitIntegration.update({ where: { projectId: ids.projectB }, data: { stationIntegrationId: null } })
    try {
      const results = ownResults(await feedSync.syncGitStationFeeds(clients(), NOW))
      expect(results.find((r) => r.repositoryId === ids.repoB)).toMatchObject({ ok: false, error: "integration" })
      expect(results.filter((r) => r.ok)).toHaveLength(2)
    } finally {
      await prisma.gitIntegration.update({ where: { projectId: ids.projectB }, data: { stationIntegrationId: INTEGRATION } })
    }
  })

  it("a repository GitStation binds to another project is refused on every poll; the others are written and the cursor moves", async () => {
    station.bind("tools/cli", [ids.projectA])
    station.mergeRequest("merge_request.opened", 1, { project: "app/portal" }, station.workItem("PBI-1", ids.projectA))
    const results = ownResults(await feedSync.syncGitStationFeeds(clients(), NOW))
    expect(results.find((r) => r.repositoryId === ids.repoB)).toMatchObject({ ok: false, error: "not_bound" })
    expect(results.filter((r) => r.ok)).toHaveLength(2)
    const repo = await prisma.gitRepository.findUniqueOrThrow({ where: { id: ids.repoB } })
    expect(repo.lastError).toContain("結び付けられていません")
    const feed = await prisma.gitStationFeed.findFirstOrThrow({ where: { apiBase: STATION, integrationId: INTEGRATION } })
    expect(feed.cursor).toBe(`gitstation:v1:${station.head()}`)
  })

  it("the activity of an automatic completion names GitStation", () => {
    expect(gitSync.gitActor("gitstation").userName).toBe("GitStation")
    expect(gitSync.gitActor("gitlab").userName).toBe("GitLab")
  })

  it("does not move the feed cursor when a repository could not be written", async () => {
    station.mergeRequest("merge_request.opened", 1, { project: "app/portal" }, station.workItem("PBI-1", ids.projectA))
    const spy = vi.spyOn(prisma.gitLink, "upsert").mockRejectedValueOnce(new Error("synthetic write failure"))
    try {
      await feedSync.syncGitStationFeeds(clients(), NOW)
    } finally {
      spy.mockRestore()
    }
    const feed = await prisma.gitStationFeed.findFirstOrThrow({ where: { apiBase: STATION, integrationId: INTEGRATION } })
    expect(feed.cursor).toBeNull()
  })
})
