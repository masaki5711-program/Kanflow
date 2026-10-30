import { beforeEach, describe, expect, it, vi } from "vitest"
import type { GitLabCommit, GitLabMergeRequest } from "@/lib/git/gitlab-client"

const gitRepositoryFindUnique = vi.fn()
const gitRepositoryUpdate = vi.fn()
const gitRepositoryFindMany = vi.fn()
const productBacklogItemFindMany = vi.fn()
const gitLinkFindUnique = vi.fn()
const gitLinkUpsert = vi.fn()
const gitLinkFindMany = vi.fn()
const gitLinkDeleteMany = vi.fn()
const gitLinkUpdateMany = vi.fn()
const sprintBacklogItemFindMany = vi.fn()
const openMock = vi.fn()
const updateTaskMock = vi.fn()
const taskAssigneeFindMany = vi.fn()
const productBacklogItemFindUnique = vi.fn()
const notifyMock = vi.fn()
const gitReleaseFindMany = vi.fn()
const gitReleaseUpsert = vi.fn()
const gitReleaseDeleteMany = vi.fn()
const noopLog = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), child: () => noopLog }

vi.mock("@/lib/prisma", () => ({
  prisma: {
    gitRepository: {
      findUnique: (...a: unknown[]) => gitRepositoryFindUnique(...a),
      update: (...a: unknown[]) => gitRepositoryUpdate(...a),
      findMany: (...a: unknown[]) => gitRepositoryFindMany(...a),
    },
    productBacklogItem: { findMany: (...a: unknown[]) => productBacklogItemFindMany(...a), findUnique: (...a: unknown[]) => productBacklogItemFindUnique(...a) },
    taskAssignee: { findMany: (...a: unknown[]) => taskAssigneeFindMany(...a) },
    gitLink: {
      findUnique: (...a: unknown[]) => gitLinkFindUnique(...a),
      upsert: (...a: unknown[]) => gitLinkUpsert(...a),
      findMany: (...a: unknown[]) => gitLinkFindMany(...a),
      deleteMany: (...a: unknown[]) => gitLinkDeleteMany(...a),
      updateMany: (...a: unknown[]) => gitLinkUpdateMany(...a),
    },
    sprintBacklogItem: { findMany: (...a: unknown[]) => sprintBacklogItemFindMany(...a) },
    gitRelease: {
      findMany: (...a: unknown[]) => gitReleaseFindMany(...a),
      upsert: (...a: unknown[]) => gitReleaseUpsert(...a),
      deleteMany: (...a: unknown[]) => gitReleaseDeleteMany(...a),
    },
  },
}))
vi.mock("@/services/_shared/notifications", () => ({ notify: (...a: unknown[]) => notifyMock(...a) }))
vi.mock("@/lib/secret-box", () => ({ open: (...a: unknown[]) => openMock(...a) }))
vi.mock("@/lib/logger", () => ({ logger: noopLog }))
vi.mock("@/services/sprint-backlog/sprint-backlog.service", () => ({ updateTask: (...a: unknown[]) => updateTaskMock(...a) }))
const publishAfterCommit = vi.fn()
vi.mock("@/lib/realtime/after-commit", () => ({ publishAfterCommit: (...a: unknown[]) => publishAfterCommit(...a) }))

const { syncRepository, syncProject, syncErrorMessage, GIT_ACTOR, isSameLink, LOOKBACK_DAYS } = await import("../git-sync")
const { GitLabError } = await import("@/lib/git/gitlab-client")
const { cursorsFromRow, cursorsToRow, resetForResync, MIN_WINDOW_SEC } = await import("../git-sync-cursors")
const { COMMIT_LAG_MS, MAX_COMMIT_LISTINGS, MAX_MR_REQUESTS, MR_OVERLAP_MS, SKIP_ESCALATE_AT } = await import("../git-sync-listings")

const NOW = new Date("2026-10-01T00:00:00.000Z")
const MIN = 60_000
const HOUR = 3_600_000
const DAY = 86_400_000

/** One listing result of the GitLab client (truncated = stopped at the page cap). */
function page<T>(items: T[], truncated = false, pages = 1) {
  return { items, truncated, pages }
}

/** One merge request page. */
function mrPage(items: GitLabMergeRequest[], hasMore = false, serverTime: Date | null = null) {
  return { items, hasMore, serverTime }
}

function repoRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "r1",
    projectId: "p1",
    apiBase: "https://gitlab.example",
    repoPath: "g/r",
    externalId: null,
    tokenCipher: null,
    syncCursor: null,
    mrCursorAt: null,
    mrCursorSeen: null,
    commitCursorAt: null,
    commitWindowSec: null,
    commitSkips: null,
    lookbackCursorAt: null,
    lookbackWindowSec: null,
    lookbackAt: null,
    project: { deletedAt: null, gitIntegration: { enabled: true, tokenCipher: "sealed-integration-token", autoCompleteOnMerge: false } },
    ...overrides,
  }
}

function emptyClient(overrides: Record<string, unknown> = {}) {
  return {
    getProject: vi.fn(),
    listMergeRequestPage: vi.fn().mockResolvedValue(mrPage([])),
    listCommits: vi.fn().mockResolvedValue(page([])),
    listBranches: vi.fn().mockResolvedValue(page([])),
    listTags: vi.fn().mockResolvedValue([]),
    listReleases: vi.fn().mockResolvedValue([]),
    getMergeRequestPipeline: vi.fn().mockResolvedValue(null),
    canReadRepository: vi.fn().mockResolvedValue(true),
    latestCommitSha: vi.fn(),
    listTree: vi.fn(),
    compare: vi.fn(),
    rawFile: vi.fn(),
    ...overrides,
  }
}

function mrAt(iid: number, displayId: number, updatedAt: string | Date, state = "opened", title = `PBI-${displayId} work`): GitLabMergeRequest {
  return {
    iid,
    title,
    description: null,
    state,
    web_url: `https://gitlab/mr/${iid}`,
    source_branch: `feature/x-${iid}`,
    updated_at: updatedAt instanceof Date ? updatedAt.toISOString() : updatedAt,
    merged_at: null,
    author: { name: "Dev" },
  }
}

function commitAt(id: string, committed: Date, message = "chore"): GitLabCommit {
  return { id, short_id: id.slice(0, 8), title: message, message, web_url: `https://gitlab/c/${id}`, author_name: "Dev", committed_date: committed.toISOString() }
}

/** Every mentioned PBI number exists (id "b-<n>"). */
function everyPbiExists() {
  productBacklogItemFindMany.mockImplementation(async (args: { where: { displayId: { in: number[] } } }) => args.where.displayId.in.map((n) => ({ id: `b-${n}`, displayId: n })))
}

/** Refs written so far, as "kind:ref". */
const writtenRefs = () => new Set(gitLinkUpsert.mock.calls.map((c) => `${c[0].create.kind}:${c[0].create.ref}`))

/** The row as the sync last stored it is what the next sync reads (several ticks in one test). */
function persistentRow(initial: Record<string, unknown>) {
  let row: Record<string, unknown> = repoRow(initial)
  gitRepositoryFindUnique.mockImplementation(async () => row)
  gitRepositoryUpdate.mockImplementation(async (args: { data: Record<string, unknown> }) => {
    row = { ...row, ...args.data }
    return row
  })
  return () => row
}

/**
 * A GitLab project in memory: merge requests (ascending updated_at, offset
 * pages, GitLab's clock in every answer) and commits (since / until inclusive,
 * newest first, cut off after 3 pages of 100).
 */
function fakeGitLab(clock: { now: Date }) {
  const mrs = new Map<number, GitLabMergeRequest>()
  const commits: GitLabCommit[] = []
  const hooks: { afterMrPage?: (call: number) => void } = {}
  const ms = (s: string) => new Date(s).getTime()
  const listMergeRequestPage = vi.fn(async (_id: number, q: { updatedAfter: Date; page?: number; perPage?: number }) => {
    const perPage = q.perPage ?? 100
    const start = ((q.page ?? 1) - 1) * perPage
    const sorted = [...mrs.values()].filter((m) => ms(m.updated_at) >= q.updatedAfter.getTime()).sort((a, b) => ms(a.updated_at) - ms(b.updated_at) || a.iid - b.iid)
    const items = sorted.slice(start, start + perPage).map((m) => ({ ...m }))
    hooks.afterMrPage?.(listMergeRequestPage.mock.calls.length)
    return mrPage(items, start + perPage < sorted.length, clock.now)
  })
  const listCommits = vi.fn(async (_id: number, since: Date, until?: Date) => {
    const inWindow = commits
      .filter((c) => ms(c.committed_date) >= since.getTime() && ms(c.committed_date) <= (until ?? clock.now).getTime())
      .sort((a, b) => ms(b.committed_date) - ms(a.committed_date))
    return page(inWindow.slice(0, 300), inWindow.length > 300, Math.max(1, Math.min(3, Math.ceil(inWindow.length / 100))))
  })
  const client = emptyClient({ listMergeRequestPage, listCommits })
  return { client, mrs, commits, hooks, listMergeRequestPage, listCommits }
}

beforeEach(() => {
  vi.clearAllMocks()
  openMock.mockImplementation((sealed: string | null) => (sealed ? `plain(${sealed})` : null))
  gitRepositoryUpdate.mockResolvedValue({})
  productBacklogItemFindMany.mockResolvedValue([])
  gitLinkFindUnique.mockResolvedValue(null)
  gitLinkUpsert.mockResolvedValue({})
  gitLinkFindMany.mockResolvedValue([])
  gitLinkDeleteMany.mockResolvedValue({ count: 0 })
  gitLinkUpdateMany.mockResolvedValue({ count: 0 })
  sprintBacklogItemFindMany.mockResolvedValue([])
  updateTaskMock.mockResolvedValue({})
  gitReleaseFindMany.mockResolvedValue([])
  gitReleaseUpsert.mockResolvedValue({})
  gitReleaseDeleteMany.mockResolvedValue({ count: 0 })
})

describe("syncRepository — disabled paths", () => {
  it("returns disabled when the repository does not exist", async () => {
    gitRepositoryFindUnique.mockResolvedValue(null)
    const result = await syncRepository("missing", vi.fn())
    expect(result).toEqual({ repositoryId: "missing", ok: false, links: 0, error: "disabled" })
    expect(gitRepositoryUpdate).not.toHaveBeenCalled()
  })

  it("returns disabled when the project is in the trash", async () => {
    gitRepositoryFindUnique.mockResolvedValue(repoRow({ project: { deletedAt: NOW, gitIntegration: { enabled: true } } }))
    expect(await syncRepository("r1", vi.fn())).toEqual({ repositoryId: "r1", ok: false, links: 0, error: "disabled" })
  })

  it("returns disabled when the integration is switched off", async () => {
    gitRepositoryFindUnique.mockResolvedValue(repoRow({ project: { deletedAt: null, gitIntegration: { enabled: false } } }))
    expect(await syncRepository("r1", vi.fn())).toEqual({ repositoryId: "r1", ok: false, links: 0, error: "disabled" })
  })
})

describe("syncRepository — token resolution", () => {
  it("fails with kind 'token' when neither the repository nor the integration has a sealed token", async () => {
    gitRepositoryFindUnique.mockResolvedValue(repoRow({ tokenCipher: null, project: { deletedAt: null, gitIntegration: { enabled: true, tokenCipher: null } } }))
    const result = await syncRepository("r1", vi.fn())
    expect(result).toEqual({ repositoryId: "r1", ok: false, links: 0, error: "token" })
    expect(openMock).not.toHaveBeenCalled()
    expect(gitRepositoryUpdate).toHaveBeenCalledWith({
      where: { id: "r1" },
      data: { lastError: expect.stringContaining("アクセストークン"), lastErrorAt: expect.any(Date) },
    })
  })

  it("fails with kind 'token' when the sealed token cannot be opened (tampered / wrong key)", async () => {
    gitRepositoryFindUnique.mockResolvedValue(repoRow())
    openMock.mockReturnValue(null)
    expect((await syncRepository("r1", vi.fn())).error).toBe("token")
  })

  it("prefers the repository's own token over the integration token", async () => {
    gitRepositoryFindUnique.mockResolvedValue(repoRow({ tokenCipher: "sealed-repo-token" }))
    const factory = vi.fn().mockReturnValue(emptyClient())
    await syncRepository("r1", factory, NOW)
    expect(openMock).toHaveBeenCalledWith("sealed-repo-token")
    expect(factory).toHaveBeenCalledWith("https://gitlab.example", "plain(sealed-repo-token)")
  })

  it("falls back to the integration token when the repository has none", async () => {
    gitRepositoryFindUnique.mockResolvedValue(repoRow({ tokenCipher: null }))
    const factory = vi.fn().mockReturnValue(emptyClient())
    await syncRepository("r1", factory, NOW)
    expect(openMock).toHaveBeenCalledWith("sealed-integration-token")
  })
})

describe("syncRepository — externalId and cursors", () => {
  const stored = () => (gitRepositoryUpdate.mock.calls.at(-1)![0] as { data: Record<string, unknown> }).data

  it("reuses a known externalId without calling getProject", async () => {
    gitRepositoryFindUnique.mockResolvedValue(repoRow({ externalId: 999 }))
    const client = emptyClient()
    await syncRepository("r1", () => client, NOW)
    expect(client.getProject).not.toHaveBeenCalled()
    expect(stored()).toMatchObject({ externalId: 999 })
  })

  it("resolves externalId via getProject(repoPath) when unknown, and persists it with the cursors", async () => {
    gitRepositoryFindUnique.mockResolvedValue(repoRow({ externalId: null }))
    const client = emptyClient({ getProject: vi.fn().mockResolvedValue({ id: 555, web_url: "u", path_with_namespace: "g/r", default_branch: "main" }) })
    await syncRepository("r1", () => client, NOW)
    expect(client.getProject).toHaveBeenCalledWith("g/r")
    expect(gitRepositoryUpdate).toHaveBeenCalledTimes(1)
    expect(stored()).toMatchObject({ externalId: 555, syncedAt: NOW, lastError: null, lastErrorAt: null })
    expect(stored()).toHaveProperty("mrCursorAt")
    expect(stored()).toHaveProperty("commitCursorAt")
  })

  it("first sync looks back 30 days for both listings (merge requests with the overlap page)", async () => {
    gitRepositoryFindUnique.mockResolvedValue(repoRow({ externalId: 1, lookbackAt: NOW }))
    const client = emptyClient()
    await syncRepository("r1", () => client, NOW)
    const first = new Date(NOW.getTime() - 30 * DAY)
    expect(client.listMergeRequestPage).toHaveBeenCalledWith(1, { updatedAfter: new Date(first.getTime() - MR_OVERLAP_MS), page: 1, perPage: 100 })
    expect(client.listCommits.mock.calls[0][1]).toEqual(first)
    // Nothing found: the merge request cursor stays (no Kanflow clock in it). Commit windows of 1, 2, 4 and 7 days
    // (the per-sync budget) were read; the next sync continues from there with the grown width.
    expect(stored()).toMatchObject({ mrCursorAt: first, mrCursorSeen: 0, commitCursorAt: new Date(first.getTime() + 14 * DAY), commitWindowSec: 7 * 86_400 })
  })

  it("queries merge requests, commits, and 'pbi'-named branches for the same externalId, one listing after another", async () => {
    gitRepositoryFindUnique.mockResolvedValue(repoRow({ externalId: 7 }))
    const order: string[] = []
    const client = emptyClient({
      listMergeRequestPage: vi.fn(async () => (order.push("mr"), mrPage([]))),
      listCommits: vi.fn(async () => (order.push("commit"), page([]))),
      listBranches: vi.fn(async () => (order.push("branch"), page([]))),
    })
    await syncRepository("r1", () => client, NOW)
    expect(client.listMergeRequestPage).toHaveBeenCalledWith(7, expect.objectContaining({ updatedAfter: expect.any(Date) }))
    expect(client.listCommits).toHaveBeenCalledWith(7, expect.any(Date), expect.any(Date))
    expect(client.listBranches).toHaveBeenCalledWith(7, "pbi")
    expect(order[0]).toBe("mr")
    expect(order.at(-1)).toBe("branch")
  })

  it("an old row with only the shared syncCursor continues from it (migration of the old watermark)", async () => {
    const legacy = new Date(NOW.getTime() - 2 * HOUR)
    gitRepositoryFindUnique.mockResolvedValue(repoRow({ externalId: 7, syncCursor: legacy, lookbackAt: NOW }))
    const client = emptyClient()
    await syncRepository("r1", () => client, NOW)
    expect(client.listMergeRequestPage.mock.calls[0][1]).toMatchObject({ updatedAfter: new Date(legacy.getTime() - MR_OVERLAP_MS) })
    expect(client.listCommits.mock.calls[0][1]).toEqual(legacy)
    // From now on the per-kind columns hold the cursors; syncCursor keeps the earlier one for a rollback.
    expect(stored()).toMatchObject({ mrCursorAt: legacy, commitCursorAt: new Date(NOW.getTime() - COMMIT_LAG_MS), syncCursor: legacy })
  })

  it("the migration seeds both new cursors from syncCursor", async () => {
    const fs = await import("node:fs")
    const path = await import("node:path")
    const sql = fs.readFileSync(path.resolve(__dirname, "../../../../prisma/migrations/20261030120000_git_sync_cursors/migration.sql"), "utf8")
    expect(sql).toMatch(/UPDATE `git_repository`\s+SET `mrCursorAt` = `syncCursor`, `mrCursorSeen` = 0, `commitCursorAt` = `syncCursor`\s+WHERE `syncCursor` IS NOT NULL/)
    expect(sql).toMatch(/ALTER TABLE `git_link` ADD COLUMN `goneAt` DATETIME\(3\) NULL/)
    // Additive only: nothing is dropped or made NOT NULL.
    expect(sql.replace(/^--.*$/gm, "")).not.toMatch(/DROP|(?<!IS )NOT NULL/)
  })
})

describe("syncRepository — merge request cursor", () => {
  it("moves to GitLab's updated_at of the last merge request, with the tie count, never to Kanflow's clock", async () => {
    gitRepositoryFindUnique.mockResolvedValue(repoRow({ externalId: 7, mrCursorAt: new Date("2026-09-30T00:00:00.000Z"), lookbackAt: NOW }))
    const client = emptyClient({
      listMergeRequestPage: vi.fn().mockResolvedValue(
        mrPage([mrAt(1, 42, "2026-09-30T06:00:00.000Z"), mrAt(2, 43, "2026-09-30T12:00:00.000Z"), mrAt(3, 44, "2026-09-30T12:00:00.000Z")]),
      ),
    })
    await syncRepository("r1", () => client, NOW)
    expect(gitRepositoryUpdate.mock.calls[0][0].data).toMatchObject({ mrCursorAt: new Date("2026-09-30T12:00:00.000Z"), mrCursorSeen: 2 })
  })

  it("≥500 merge requests with the same updated_at advance across syncs by the tie-breaker", async () => {
    everyPbiExists()
    const clock = { now: NOW }
    const gl = fakeGitLab(clock)
    const T = new Date(NOW.getTime() - DAY)
    for (let iid = 1; iid <= 650; iid++) gl.mrs.set(iid, mrAt(iid, 1, T, "opened", "PBI-1 bulk relabel"))
    gl.mrs.set(1000, mrAt(1000, 2, new Date(NOW.getTime() - HOUR)))
    const row = persistentRow({ externalId: 7, mrCursorAt: new Date(NOW.getTime() - 2 * DAY), mrCursorSeen: 0, commitCursorAt: NOW, lookbackAt: NOW })

    const perTick: number[] = []
    for (let tick = 0; tick < 5 && !writtenRefs().has("mr:1000"); tick++) {
      const before = gl.listMergeRequestPage.mock.calls.length
      await syncRepository("r1", () => gl.client, NOW)
      perTick.push(gl.listMergeRequestPage.mock.calls.length - before)
    }
    expect(perTick.length).toBeLessThanOrEqual(3)
    for (const n of perTick) expect(n).toBeLessThanOrEqual(1 + MAX_MR_REQUESTS)
    const refs = writtenRefs()
    for (let iid = 1; iid <= 650; iid++) expect(refs.has(`mr:${iid}`)).toBe(true)
    expect(refs.has("mr:1000")).toBe(true)
    expect(row()).toMatchObject({ mrCursorAt: new Date(NOW.getTime() - HOUR), mrCursorSeen: 1 })
  })

  it("an earlier merge request changing during the read does not make the listing skip one at a page boundary", async () => {
    everyPbiExists()
    const clock = { now: NOW }
    const gl = fakeGitLab(clock)
    const base = NOW.getTime() - DAY
    for (let iid = 1; iid <= 250; iid++) gl.mrs.set(iid, mrAt(iid, iid, new Date(base + iid * MIN)))
    // Right after the first page, MR !5 is edited: with offset pages, MR !101 would slide onto page 1 and never be read.
    gl.hooks.afterMrPage = (call) => {
      if (call === 1) gl.mrs.set(5, mrAt(5, 5, new Date(NOW.getTime() - MIN)))
    }
    persistentRow({ externalId: 7, mrCursorAt: new Date(base), mrCursorSeen: 0, commitCursorAt: NOW, lookbackAt: NOW })
    await syncRepository("r1", () => gl.client, NOW)
    const refs = writtenRefs()
    for (let iid = 1; iid <= 250; iid++) expect(refs.has(`mr:${iid}`)).toBe(true)
  })

  it("Kanflow's clock running ahead of GitLab's does not lose a merge request", async () => {
    everyPbiExists()
    const gitlab = { now: NOW }
    const gl = fakeGitLab(gitlab)
    const kanflowAhead = 60 * MIN
    gl.mrs.set(1, mrAt(1, 1, new Date(NOW.getTime() - 30 * MIN)))
    const row = persistentRow({ externalId: 7, mrCursorAt: new Date(NOW.getTime() - DAY), commitCursorAt: new Date(NOW.getTime() - HOUR), lookbackAt: NOW })
    await syncRepository("r1", () => gl.client, new Date(NOW.getTime() + kanflowAhead))
    expect(row().mrCursorAt).toEqual(new Date(NOW.getTime() - 30 * MIN))
    // Commit windows end at GitLab's clock, not Kanflow's.
    for (const [, , until] of gl.listCommits.mock.calls) expect((until as Date).getTime()).toBeLessThanOrEqual(NOW.getTime())

    // 10 minutes later (GitLab time) an MR changes; Kanflow's clock is still an hour ahead.
    gitlab.now = new Date(NOW.getTime() + 13 * MIN)
    gl.mrs.set(2, mrAt(2, 2, new Date(NOW.getTime() + 10 * MIN)))
    await syncRepository("r1", () => gl.client, new Date(gitlab.now.getTime() + kanflowAhead))
    expect(writtenRefs().has("mr:2")).toBe(true)
  })

  it("re-reads one overlap page before the cursor (an MR committed late in GitLab's database)", async () => {
    gitRepositoryFindUnique.mockResolvedValue(repoRow({ externalId: 7, mrCursorAt: new Date("2026-09-30T12:00:00.000Z"), mrCursorSeen: 1, lookbackAt: NOW }))
    const client = emptyClient()
    await syncRepository("r1", () => client, NOW)
    expect(client.listMergeRequestPage).toHaveBeenCalledTimes(1)
    expect(client.listMergeRequestPage.mock.calls[0][1]).toEqual({ updatedAfter: new Date(new Date("2026-09-30T12:00:00.000Z").getTime() - MR_OVERLAP_MS), page: 1, perPage: 100 })
  })

  it("MR open→closed between two polls is stored as closed", async () => {
    gitRepositoryFindUnique.mockResolvedValue(repoRow({ externalId: 7, mrCursorAt: new Date("2026-09-30T00:00:00.000Z"), lookbackAt: NOW }))
    productBacklogItemFindMany.mockResolvedValue([{ id: "b-42", displayId: 42 }])
    await syncRepository("r1", () => emptyClient({ listMergeRequestPage: vi.fn().mockResolvedValue(mrPage([mrAt(1, 42, "2026-09-30T06:00:00.000Z", "opened")])) }), NOW)
    const stored = gitLinkUpsert.mock.calls[0][0].update
    expect(stored.state).toBe("opened")

    gitLinkUpsert.mockClear()
    gitLinkFindUnique.mockResolvedValue({ ...stored })
    const later = new Date(NOW.getTime() + 60 * 60_000)
    gitRepositoryFindUnique.mockResolvedValue(repoRow({ externalId: 7, mrCursorAt: new Date("2026-09-30T06:00:00.000Z"), mrCursorSeen: 1, lookbackAt: NOW }))
    await syncRepository("r1", () => emptyClient({ listMergeRequestPage: vi.fn().mockResolvedValue(mrPage([mrAt(1, 42, "2026-10-01T00:30:00.000Z", "closed")])) }), later)
    expect(gitLinkUpsert).toHaveBeenCalledTimes(1)
    expect(gitLinkUpsert.mock.calls[0][0].update.state).toBe("closed")
    expect(updateTaskMock).not.toHaveBeenCalled()
  })
})

describe("syncRepository — commit windows", () => {
  it("≥300 commits within one second progress over several syncs and never stall", async () => {
    everyPbiExists()
    const clock = { now: NOW }
    const gl = fakeGitLab(clock)
    const burst = new Date(NOW.getTime() - 2 * DAY)
    for (let i = 0; i < 350; i++) gl.commits.push(commitAt(`r${String(i).padStart(39, "0")}`, burst, "rebase"))
    gl.commits.push(commitAt("a".repeat(40), new Date(burst.getTime() - 3 * HOUR), "PBI-6 before"))
    gl.commits.push(commitAt("b".repeat(40), new Date(NOW.getTime() - DAY), "PBI-7 after"))
    const row = persistentRow({ externalId: 7, commitCursorAt: new Date(NOW.getTime() - 3 * DAY), lookbackAt: NOW })

    const settled = new Date(NOW.getTime() - COMMIT_LAG_MS)
    let ticks = 0
    for (; ticks < 20 && (row().commitCursorAt as Date).getTime() < settled.getTime(); ticks++) {
      const before = gl.listCommits.mock.calls.length
      const cursorBefore = row().commitCursorAt as Date
      const widthBefore = row().commitWindowSec as number | null
      expect((await syncRepository("r1", () => gl.client, NOW)).ok).toBe(true)
      expect(gl.listCommits.mock.calls.length - before).toBeLessThanOrEqual(MAX_COMMIT_LISTINGS)
      // Every sync moves the cursor or narrows the window it resumes with: no stall.
      const moved = (row().commitCursorAt as Date).getTime() > cursorBefore.getTime()
      const narrowed = widthBefore !== null && (row().commitWindowSec as number) < widthBefore
      expect(moved || narrowed).toBe(true)
    }
    expect(row().commitCursorAt).toEqual(settled)
    expect(ticks).toBeGreaterThan(1)
    expect(writtenRefs().has(`commit:${"a".repeat(40)}`)).toBe(true)
    expect(writtenRefs().has(`commit:${"b".repeat(40)}`)).toBe(true)
    // The second that cannot be read whole was skipped at the smallest window, with a warning.
    expect(noopLog.warn).toHaveBeenCalledWith("git sync commit window skipped", expect.objectContaining({ repositoryId: "r1", kind: "commit", consecutive: 1 }))
    const skipped = noopLog.warn.mock.calls.filter((c) => c[0] === "git sync commit window skipped").map((c) => c[1] as { windowStart: string; windowEnd: string })
    for (const w of skipped) expect(new Date(w.windowEnd).getTime() - new Date(w.windowStart).getTime()).toBeLessThanOrEqual(MIN_WINDOW_SEC * 1000)
  })

  it("the window width is carried over: a sync resumes narrowing where the previous one stopped", async () => {
    gitRepositoryFindUnique.mockResolvedValue(repoRow({ externalId: 7, commitCursorAt: new Date(NOW.getTime() - 3 * DAY), commitWindowSec: 86_400, lookbackAt: NOW }))
    const listCommits = vi.fn().mockResolvedValue(page([], true, 3))
    await syncRepository("r1", () => emptyClient({ listCommits }), NOW)
    expect(listCommits).toHaveBeenCalledTimes(MAX_COMMIT_LISTINGS)
    const spans = listCommits.mock.calls.map((c) => ((c[2] as Date).getTime() - (c[1] as Date).getTime()) / 1000)
    expect(spans).toEqual([86_400, 21_600, 5_400, 1_350])
    expect(gitRepositoryUpdate.mock.calls[0][0].data).toMatchObject({ commitCursorAt: new Date(NOW.getTime() - 3 * DAY), commitWindowSec: 337 })
  })

  it("windows read completely grow and move the cursor; it stops COMMIT_LAG before GitLab's now", async () => {
    gitRepositoryFindUnique.mockResolvedValue(repoRow({ externalId: 7, commitCursorAt: new Date(NOW.getTime() - 3 * DAY), commitWindowSec: 86_400, lookbackAt: NOW }))
    const listCommits = vi.fn().mockResolvedValue(page([]))
    await syncRepository("r1", () => emptyClient({ listCommits }), NOW)
    const spans = listCommits.mock.calls.map((c) => ((c[2] as Date).getTime() - (c[1] as Date).getTime()) / 1000)
    expect(spans).toEqual([86_400, 172_800])
    expect(gitRepositoryUpdate.mock.calls[0][0].data).toMatchObject({ commitCursorAt: new Date(NOW.getTime() - COMMIT_LAG_MS), commitWindowSec: 345_600, commitSkips: 0 })
  })

  it("escalates to an error after SKIP_ESCALATE_AT consecutive skipped windows", async () => {
    const row = persistentRow({ externalId: 7, commitCursorAt: new Date(NOW.getTime() - HOUR), commitWindowSec: MIN_WINDOW_SEC, commitSkips: SKIP_ESCALATE_AT - 2, lookbackAt: NOW })
    const listCommits = vi.fn().mockResolvedValue(page([], true, 3))
    await syncRepository("r1", () => emptyClient({ listCommits }), NOW)
    expect(noopLog.warn).toHaveBeenCalledWith("git sync commit window skipped", expect.objectContaining({ consecutive: SKIP_ESCALATE_AT - 1 }))
    expect(noopLog.error).toHaveBeenCalledWith("git sync commit window skipped repeatedly", expect.objectContaining({ repositoryId: "r1", consecutive: SKIP_ESCALATE_AT }))
    expect(row().commitSkips).toBe(SKIP_ESCALATE_AT - 2 + MAX_COMMIT_LISTINGS)
    // A window read completely resets the count.
    listCommits.mockResolvedValue(page([]))
    await syncRepository("r1", () => emptyClient({ listCommits }), NOW)
    expect(row().commitSkips).toBe(0)
  })

  it("a late-pushed old commit is caught by the daily look-back", async () => {
    everyPbiExists()
    const clock = { now: NOW }
    const gl = fakeGitLab(clock)
    persistentRow({ externalId: 7, commitCursorAt: new Date(NOW.getTime() - HOUR), lookbackAt: new Date(NOW.getTime() - HOUR) })
    await syncRepository("r1", () => gl.client, NOW)

    // Made three days ago, pushed only now: its window was read long ago.
    const late = commitAt("d".repeat(40), new Date(NOW.getTime() - 3 * DAY), "PBI-9 offline work")
    gl.commits.push(late)
    clock.now = new Date(NOW.getTime() + 3 * MIN)
    await syncRepository("r1", () => gl.client, clock.now)
    expect(writtenRefs().has(`commit:${late.id}`)).toBe(false)

    clock.now = new Date(NOW.getTime() + DAY)
    for (let i = 0; i < 3 && !writtenRefs().has(`commit:${late.id}`); i++) await syncRepository("r1", () => gl.client, clock.now)
    expect(writtenRefs().has(`commit:${late.id}`)).toBe(true)
    const lookbackStart = new Date(clock.now.getTime() - LOOKBACK_DAYS * DAY)
    expect(gl.listCommits.mock.calls.some((c) => (c[1] as Date).getTime() === lookbackStart.getTime())).toBe(true)
  })
})

describe("syncRepository — a listing that fails mid-way", () => {
  it("keeps the merge requests read before the failure, moves their cursor no further, and starts no other listing", async () => {
    productBacklogItemFindMany.mockResolvedValue([{ id: "b-42", displayId: 42 }])
    const start = new Date("2026-09-29T00:00:00.000Z")
    gitRepositoryFindUnique.mockResolvedValue(repoRow({ externalId: 7, mrCursorAt: start, mrCursorSeen: 0, commitCursorAt: start, lookbackAt: NOW }))
    const listMergeRequestPage = vi
      .fn()
      .mockResolvedValueOnce(mrPage([mrAt(1, 42, "2026-09-30T01:00:00.000Z"), mrAt(2, 42, "2026-09-30T02:00:00.000Z")], true))
      .mockRejectedValueOnce(new GitLabError("network", "down"))
    const client = emptyClient({ listMergeRequestPage })
    const result = await syncRepository("r1", () => client, NOW)

    expect(result).toMatchObject({ ok: false, error: "network", links: 2 })
    expect(gitLinkUpsert.mock.calls.map((c) => c[0].create.ref)).toEqual(["1", "2"])
    const data = gitRepositoryUpdate.mock.calls[0][0].data
    expect(data).toMatchObject({ mrCursorAt: new Date("2026-09-30T02:00:00.000Z"), mrCursorSeen: 1, commitCursorAt: start, lastError: expect.stringContaining("接続") })
    expect(data).not.toHaveProperty("syncedAt")
    expect(client.listCommits).not.toHaveBeenCalled()
    expect(client.listBranches).not.toHaveBeenCalled()
    expect(client.getMergeRequestPipeline).not.toHaveBeenCalled()
    expect(gitLinkUpdateMany).not.toHaveBeenCalled()
  })

  it("a failure on the first merge request page keeps the cursor exactly where it was", async () => {
    const start = new Date("2026-09-29T00:00:00.000Z")
    gitRepositoryFindUnique.mockResolvedValue(repoRow({ externalId: 7, mrCursorAt: start, mrCursorSeen: 3 }))
    const client = emptyClient({ listMergeRequestPage: vi.fn().mockRejectedValue(new GitLabError("rate_limited", "slow down", 429)) })
    expect(await syncRepository("r1", () => client, NOW)).toMatchObject({ ok: false, error: "rate_limited" })
    expect(gitRepositoryUpdate.mock.calls[0][0].data).toMatchObject({ mrCursorAt: start, mrCursorSeen: 3 })
  })

  it("a commit listing failing keeps the windows already read and the merge request progress", async () => {
    const start = new Date(NOW.getTime() - 3 * DAY)
    gitRepositoryFindUnique.mockResolvedValue(repoRow({ externalId: 7, mrCursorAt: start, commitCursorAt: start, commitWindowSec: 86_400, lookbackAt: NOW }))
    const listCommits = vi.fn().mockResolvedValueOnce(page([])).mockRejectedValueOnce(new GitLabError("http", "bad gateway", 502))
    const client = emptyClient({ listMergeRequestPage: vi.fn().mockResolvedValue(mrPage([mrAt(1, 42, "2026-09-30T01:00:00.000Z")])), listCommits })
    expect(await syncRepository("r1", () => client, NOW)).toMatchObject({ ok: false, error: "http" })
    expect(gitRepositoryUpdate.mock.calls[0][0].data).toMatchObject({
      mrCursorAt: new Date("2026-09-30T01:00:00.000Z"),
      commitCursorAt: new Date(start.getTime() + DAY),
      commitWindowSec: 2 * 86_400,
      lastError: expect.stringContaining("502"),
    })
    expect(client.listBranches).not.toHaveBeenCalled()
  })
})

describe("syncRepository — 過去分を再同期", () => {
  it("re-reads 90 days of merge requests (e.g. 'PBI #43' titles missed before the key fix) and starts a 90-day commit look-back", async () => {
    everyPbiExists()
    const clock = { now: NOW }
    const gl = fakeGitLab(clock)
    gl.mrs.set(43, mrAt(43, 43, new Date(NOW.getTime() - 60 * DAY), "merged", "PBI #43 login form"))
    const synced = repoRow({ externalId: 7, mrCursorAt: new Date(NOW.getTime() - HOUR), mrCursorSeen: 0, commitCursorAt: new Date(NOW.getTime() - HOUR), lookbackAt: NOW })
    const reset = cursorsToRow(resetForResync(cursorsFromRow(synced, NOW), NOW))
    persistentRow({ ...synced, ...reset })

    await syncRepository("r1", () => gl.client, NOW)
    const from = new Date(NOW.getTime() - 90 * DAY)
    expect(gl.listMergeRequestPage.mock.calls[0][1]).toMatchObject({ updatedAfter: new Date(from.getTime() - MR_OVERLAP_MS) })
    expect(writtenRefs().has("mr:43")).toBe(true)
    expect(gl.listCommits.mock.calls.some((c) => (c[1] as Date).getTime() === from.getTime())).toBe(true)
  })
})

describe("syncRepository — full success: links, pipelines, gone branches, auto-complete", () => {
  function buildMr(iid: number, displayId: number, state = "opened") {
    return {
      iid,
      title: `PBI-${displayId} work`,
      description: null,
      state,
      web_url: `https://gitlab/mr/${iid}`,
      source_branch: `feature/PBI-${displayId}-x`,
      updated_at: NOW.toISOString(),
      merged_at: state === "merged" ? NOW.toISOString() : null,
      author: { name: "Dev" },
    }
  }

  it("resolves only PBIs that exist live in this project, writes links, and attaches pipeline status to resolved MRs", async () => {
    gitRepositoryFindUnique.mockResolvedValue(repoRow({ externalId: 7 }))
    productBacklogItemFindMany.mockResolvedValue([{ id: "b-42", displayId: 42 }])
    const client = emptyClient({
      listMergeRequestPage: vi.fn().mockResolvedValue(mrPage([buildMr(1, 42, "merged"), buildMr(2, 999, "opened")])),
      getMergeRequestPipeline: vi.fn().mockResolvedValue("success"),
    })
    const result = await syncRepository("r1", () => client, NOW)

    // Only PBI-42 is a live PBI of the project; PBI-999 is dropped silently.
    expect(productBacklogItemFindMany).toHaveBeenCalledWith({
      where: { projectId: "p1", deletedAt: null, displayId: { in: [42, 999] } },
      select: { id: true, displayId: true },
    })
    expect(client.getMergeRequestPipeline).toHaveBeenCalledTimes(1)
    expect(client.getMergeRequestPipeline).toHaveBeenCalledWith(7, 1)
    expect(gitLinkUpsert).toHaveBeenCalledTimes(1)
    const upsertArg = gitLinkUpsert.mock.calls[0][0]
    expect(upsertArg.create).toMatchObject({ projectId: "p1", repositoryId: "r1", kind: "mr", ref: "1", backlogItemId: "b-42", pipeline: "success" })
    expect(result).toEqual({ repositoryId: "r1", ok: true, links: 1, completedTasks: 0 })
  })

  it("keeps the previous pipeline status when this sync's lookup fails", async () => {
    gitRepositoryFindUnique.mockResolvedValue(repoRow({ externalId: 7 }))
    productBacklogItemFindMany.mockResolvedValue([{ id: "b-42", displayId: 42 }])
    gitLinkFindUnique.mockResolvedValue({ state: "opened", pipeline: "running" })
    const client = emptyClient({
      listMergeRequestPage: vi.fn().mockResolvedValue(mrPage([buildMr(1, 42, "opened")])),
      getMergeRequestPipeline: vi.fn().mockRejectedValue(new Error("pipeline lookup failed")),
    })
    await syncRepository("r1", () => client, NOW)
    expect(gitLinkUpsert.mock.calls[0][0].create.pipeline).toBe("running")
    expect(noopLog.warn).toHaveBeenCalledWith("git pipeline lookup failed", { repositoryId: "r1", iid: 1, error: "pipeline lookup failed" })
  })

  it("detects a merge request newly turning 'merged' and triggers auto-complete when enabled", async () => {
    gitRepositoryFindUnique.mockResolvedValue(
      repoRow({ externalId: 7, project: { deletedAt: null, gitIntegration: { enabled: true, tokenCipher: "sealed-integration-token", autoCompleteOnMerge: true } } }),
    )
    productBacklogItemFindMany.mockResolvedValue([{ id: "b-42", displayId: 42 }])
    gitLinkFindUnique.mockResolvedValue(null) // was not merged before
    gitLinkFindMany.mockImplementation(async (args: { where: { kind: string } }) => (args.where.kind === "mr" ? [{ state: "merged" }] : []))
    sprintBacklogItemFindMany.mockResolvedValue([{ id: "t1", sprintId: "s1" }])
    const client = emptyClient({ listMergeRequestPage: vi.fn().mockResolvedValue(mrPage([buildMr(1, 42, "merged")])) })

    const result = await syncRepository("r1", () => client, NOW)

    expect(sprintBacklogItemFindMany).toHaveBeenCalledWith({
      where: { pbItemId: "b-42", status: "in_progress", sprint: { projectId: "p1", status: "active" } },
      select: { id: true, sprintId: true },
    })
    expect(updateTaskMock).toHaveBeenCalledWith("p1", "s1", "t1", { status: "done" }, GIT_ACTOR)
    expect(result.completedTasks).toBe(1)
  })

  it("tells the PBI's assignees when an open MR's pipeline newly fails, once per push", async () => {
    gitRepositoryFindUnique.mockResolvedValue(repoRow({ externalId: 7 }))
    productBacklogItemFindMany.mockResolvedValue([{ id: "b-42", displayId: 42 }])
    productBacklogItemFindUnique.mockResolvedValue({ displayId: 42, initiative: "Login", userStory: null })
    taskAssigneeFindMany.mockResolvedValue([{ userId: "u1" }, { userId: "u2" }])
    gitLinkFindUnique.mockResolvedValue({ state: "opened", pipeline: "running" })
    const client = emptyClient({
      listMergeRequestPage: vi.fn().mockResolvedValue(mrPage([buildMr(1, 42, "opened")])),
      getMergeRequestPipeline: vi.fn().mockResolvedValue("failed"),
    })
    await syncRepository("r1", () => client, NOW)
    expect(notifyMock).toHaveBeenCalledTimes(1)
    expect(notifyMock.mock.calls[0][1]).toMatchObject({
      recipientIds: ["u1", "u2"], type: "git_pipeline_failed", projectId: "p1", entityType: "pbi", entityId: "b-42",
      payload: { entityLabel: "Login", displayId: 42, mr: "1" },
    })
  })

  it("does not notify again while the pipeline stays failed", async () => {
    gitRepositoryFindUnique.mockResolvedValue(repoRow({ externalId: 7 }))
    productBacklogItemFindMany.mockResolvedValue([{ id: "b-42", displayId: 42 }])
    gitLinkFindUnique.mockResolvedValue({ state: "opened", pipeline: "failed" })
    const client = emptyClient({
      listMergeRequestPage: vi.fn().mockResolvedValue(mrPage([buildMr(1, 42, "opened")])),
      getMergeRequestPipeline: vi.fn().mockResolvedValue("failed"),
    })
    await syncRepository("r1", () => client, NOW)
    expect(notifyMock).not.toHaveBeenCalled()
  })

  it("does not auto-complete when the option is off, even if a merge request is newly merged", async () => {
    gitRepositoryFindUnique.mockResolvedValue(repoRow({ externalId: 7 })) // autoCompleteOnMerge: false
    productBacklogItemFindMany.mockResolvedValue([{ id: "b-42", displayId: 42 }])
    const client = emptyClient({ listMergeRequestPage: vi.fn().mockResolvedValue(mrPage([buildMr(1, 42, "merged")])) })
    const result = await syncRepository("r1", () => client, NOW)
    expect(updateTaskMock).not.toHaveBeenCalled()
    expect(result.completedTasks).toBe(0)
  })

  it("does not re-trigger auto-complete for a PBI whose MR was already merged before this sync", async () => {
    gitRepositoryFindUnique.mockResolvedValue(
      repoRow({ externalId: 7, project: { deletedAt: null, gitIntegration: { enabled: true, tokenCipher: "sealed-integration-token", autoCompleteOnMerge: true } } }),
    )
    productBacklogItemFindMany.mockResolvedValue([{ id: "b-42", displayId: 42 }])
    gitLinkFindUnique.mockResolvedValue({ state: "merged", pipeline: null }) // already merged before
    const client = emptyClient({ listMergeRequestPage: vi.fn().mockResolvedValue(mrPage([buildMr(1, 42, "merged")])) })
    await syncRepository("r1", () => client, NOW)
    expect(sprintBacklogItemFindMany).not.toHaveBeenCalled()
  })

  it("skips a task auto-complete failure and continues with the rest", async () => {
    gitRepositoryFindUnique.mockResolvedValue(
      repoRow({ externalId: 7, project: { deletedAt: null, gitIntegration: { enabled: true, tokenCipher: "sealed-integration-token", autoCompleteOnMerge: true } } }),
    )
    productBacklogItemFindMany.mockResolvedValue([{ id: "b-42", displayId: 42 }])
    gitLinkFindMany.mockImplementation(async (args: { where: { kind: string } }) => (args.where.kind === "mr" ? [{ state: "merged" }] : []))
    sprintBacklogItemFindMany.mockResolvedValue([
      { id: "t1", sprintId: "s1" },
      { id: "t2", sprintId: "s1" },
    ])
    updateTaskMock.mockRejectedValueOnce(new Error("version conflict")).mockResolvedValueOnce({})
    const client = emptyClient({ listMergeRequestPage: vi.fn().mockResolvedValue(mrPage([buildMr(1, 42, "merged")])) })
    const result = await syncRepository("r1", () => client, NOW)
    expect(updateTaskMock).toHaveBeenCalledTimes(2)
    expect(result.completedTasks).toBe(1)
  })

  it("attaches pipelines for at most the last 25 distinct merge requests of this sync", async () => {
    gitRepositoryFindUnique.mockResolvedValue(repoRow({ externalId: 7 }))
    const mrs = Array.from({ length: 30 }, (_, i) => buildMr(i + 1, i + 1))
    productBacklogItemFindMany.mockResolvedValue(Array.from({ length: 30 }, (_, i) => ({ id: `b${i + 1}`, displayId: i + 1 })))
    const pipeline = vi.fn().mockResolvedValue("success")
    const client = emptyClient({ listMergeRequestPage: vi.fn().mockResolvedValue(mrPage(mrs)), getMergeRequestPipeline: pipeline })
    await syncRepository("r1", () => client, NOW)
    expect(pipeline).toHaveBeenCalledTimes(25)
    expect(pipeline).not.toHaveBeenCalledWith(7, 1)
    expect(pipeline).not.toHaveBeenCalledWith(7, 5)
    expect(pipeline).toHaveBeenCalledWith(7, 6)
    expect(pipeline).toHaveBeenCalledWith(7, 30)
  })

  it("marks branch links whose branch is no longer listed as gone (kept, not deleted), and keeps the rest", async () => {
    gitRepositoryFindUnique.mockResolvedValue(repoRow({ externalId: 7 }))
    productBacklogItemFindMany.mockResolvedValue([{ id: "b-42", displayId: 42 }])
    gitLinkFindMany.mockImplementation(async (args: { where: { kind: string } }) =>
      args.where.kind === "branch"
        ? [
            { id: "link-keep", ref: "feature/PBI-42-x", backlogItemId: "b-42" },
            { id: "link-stale", ref: "feature/PBI-999-gone", backlogItemId: "b-999" },
          ]
        : [],
    )
    const client = emptyClient({ listBranches: vi.fn().mockResolvedValue(page([{ name: "feature/PBI-42-x", web_url: "u", commit: null }])) })
    await syncRepository("r1", () => client, NOW)
    expect(gitLinkFindMany).toHaveBeenCalledWith({ where: { repositoryId: "r1", kind: "branch", goneAt: null }, select: { id: true, ref: true, backlogItemId: true } })
    expect(gitLinkUpdateMany).toHaveBeenCalledWith({ where: { id: { in: ["link-stale"] }, goneAt: null }, data: { goneAt: NOW } })
    expect(gitLinkDeleteMany).not.toHaveBeenCalled()
  })

  it("a branch that comes back makes its gone link live again", async () => {
    gitRepositoryFindUnique.mockResolvedValue(repoRow({ externalId: 7 }))
    productBacklogItemFindMany.mockResolvedValue([{ id: "b-42", displayId: 42 }])
    gitLinkFindUnique.mockResolvedValue({ title: "feature/PBI-42-x", url: "u", state: null, pipeline: null, author: null, sourceBranch: null, occurredAt: NOW, mergedAt: null, goneAt: new Date(NOW.getTime() - DAY) })
    const client = emptyClient({ listBranches: vi.fn().mockResolvedValue(page([{ name: "feature/PBI-42-x", web_url: "u", commit: null }])) })
    await syncRepository("r1", () => client, NOW)
    expect(gitLinkUpsert).toHaveBeenCalledTimes(1)
    expect(gitLinkUpsert.mock.calls[0][0].update.goneAt).toBeNull()
  })

  it("never marks branches gone when the branch listing was truncated (it did not see them all)", async () => {
    gitRepositoryFindUnique.mockResolvedValue(repoRow({ externalId: 7 }))
    gitLinkFindMany.mockImplementation(async (args: { where: { kind: string } }) =>
      args.where.kind === "branch" ? [{ id: "link-unseen", ref: "feature/PBI-7-y", backlogItemId: "b-7" }] : [],
    )
    const client = emptyClient({ listBranches: vi.fn().mockResolvedValue(page([{ name: "feature/PBI-42-x", web_url: "u", commit: null }], true, 3)) })
    expect((await syncRepository("r1", () => client, NOW)).ok).toBe(true)
    expect(gitLinkUpdateMany).not.toHaveBeenCalled()
    expect(gitLinkDeleteMany).not.toHaveBeenCalled()
    expect(noopLog.warn).toHaveBeenCalledWith("git sync truncated", { repositoryId: "r1", kind: "branch", pages: 3, markedGone: false })
  })

  it("does not mark anything when nothing is gone", async () => {
    gitRepositoryFindUnique.mockResolvedValue(repoRow({ externalId: 7 }))
    const client = emptyClient()
    await syncRepository("r1", () => client, NOW)
    expect(gitLinkUpdateMany).not.toHaveBeenCalled()
    expect(gitLinkDeleteMany).not.toHaveBeenCalled()
  })

  it("writes a new branch link and publishes one 'git' real-time event for the project", async () => {
    gitRepositoryFindUnique.mockResolvedValue(repoRow({ externalId: 7 }))
    productBacklogItemFindMany.mockResolvedValue([{ id: "b-42", displayId: 42 }])
    const client = emptyClient({ listBranches: vi.fn().mockResolvedValue(page([{ name: "feature/PBI-42-x", web_url: "u", commit: null }])) })
    const result = await syncRepository("r1", () => client, NOW)
    expect(gitLinkUpsert).toHaveBeenCalledTimes(1)
    expect(result.links).toBe(1)
    expect(publishAfterCommit).toHaveBeenCalledTimes(1)
    expect(publishAfterCommit).toHaveBeenCalledWith({ type: "git", projectId: "p1", action: "sync" })
  })

  it("does not rewrite an unchanged link and publishes nothing when the sync changed nothing", async () => {
    gitRepositoryFindUnique.mockResolvedValue(repoRow({ externalId: 7 }))
    productBacklogItemFindMany.mockResolvedValue([{ id: "b-42", displayId: 42 }])
    const client = emptyClient({ listBranches: vi.fn().mockResolvedValue(page([{ name: "feature/PBI-42-x", web_url: "u", commit: null }])) })
    await syncRepository("r1", () => client, NOW)
    const stored = gitLinkUpsert.mock.calls[0][0].update
    vi.clearAllMocks()
    gitLinkFindUnique.mockResolvedValue({ ...stored })
    gitLinkFindMany.mockResolvedValue([])
    gitRepositoryUpdate.mockResolvedValue({})
    openMock.mockImplementation((sealed: string | null) => (sealed ? `plain(${sealed})` : null))

    const result = await syncRepository("r1", () => client, NOW)
    expect(result.links).toBe(1)
    expect(gitLinkUpsert).not.toHaveBeenCalled()
    expect(publishAfterCommit).not.toHaveBeenCalled()
  })

  it("publishes a 'git' event when only a branch link was marked gone", async () => {
    gitRepositoryFindUnique.mockResolvedValue(repoRow({ externalId: 7 }))
    gitLinkFindMany.mockImplementation(async (args: { where: { kind: string } }) =>
      args.where.kind === "branch" ? [{ id: "link-stale", ref: "feature/PBI-999-gone", backlogItemId: "b-999" }] : [],
    )
    await syncRepository("r1", () => emptyClient(), NOW)
    expect(publishAfterCommit).toHaveBeenCalledWith({ type: "git", projectId: "p1", action: "sync" })
  })

  it("isSameLink compares every written column (dates by time, null ≡ undefined)", () => {
    const data = { title: "t", url: "u", state: null, pipeline: "success", author: "a", sourceBranch: null, occurredAt: new Date(NOW), mergedAt: null, goneAt: null }
    expect(isSameLink(null, data)).toBe(false)
    expect(isSameLink({ ...data, occurredAt: new Date(NOW.getTime()) }, data)).toBe(true)
    expect(isSameLink({ ...data, mergedAt: undefined }, data)).toBe(true)
    expect(isSameLink({ ...data, pipeline: "failed" }, data)).toBe(false)
    expect(isSameLink({ ...data, occurredAt: new Date(NOW.getTime() + 1) }, data)).toBe(false)
    // A gone branch seen again is rewritten (goneAt cleared).
    expect(isSameLink({ ...data, goneAt: new Date(NOW) }, data)).toBe(false)
  })
})

describe("syncRepository — error handling", () => {
  it("maps a GitLabError to its kind and the Japanese explanation, and records lastError", async () => {
    gitRepositoryFindUnique.mockResolvedValue(repoRow({ externalId: 7 }))
    const client = emptyClient({ listMergeRequestPage: vi.fn().mockRejectedValue(new GitLabError("auth", "nope", 401)) })
    const result = await syncRepository("r1", () => client, NOW)
    expect(result.ok).toBe(false)
    expect(result.error).toBe("auth")
    expect(gitRepositoryUpdate).toHaveBeenCalledWith({
      where: { id: "r1" },
      data: expect.objectContaining({ lastError: expect.stringContaining("read_api"), lastErrorAt: expect.any(Date) }),
    })
    expect(noopLog.error).not.toHaveBeenCalled()
  })

  it("maps any other thrown error to kind 'http' and logs it", async () => {
    gitRepositoryFindUnique.mockResolvedValue(repoRow({ externalId: 7 }))
    const client = emptyClient({ listMergeRequestPage: vi.fn().mockRejectedValue(new Error("boom")) })
    const result = await syncRepository("r1", () => client, NOW)
    expect(result.error).toBe("http")
    expect(noopLog.error).toHaveBeenCalledWith("git sync failed", { repositoryId: "r1", error: "boom" })
  })

  it("does not propagate a failure to persist lastError (best effort)", async () => {
    gitRepositoryFindUnique.mockResolvedValue(repoRow({ externalId: 7 }))
    gitRepositoryUpdate.mockRejectedValue(new Error("db write failed"))
    const client = emptyClient({ listMergeRequestPage: vi.fn().mockRejectedValue(new GitLabError("network", "down")) })
    await expect(syncRepository("r1", () => client, NOW)).resolves.toMatchObject({ ok: false, error: "network" })
  })
})

describe("syncErrorMessage", () => {
  it.each([
    ["auth", /read_api/],
    ["not_found", /URL とトークン/],
    ["rate_limited", /利用制限/],
    ["network", /接続できません/],
  ] as const)("explains kind %s in Japanese", (kind, pattern) => {
    expect(syncErrorMessage(new GitLabError(kind, "x", 1))).toMatch(pattern)
  })

  it("falls back to a generic message including the HTTP status for an unknown kind", () => {
    expect(syncErrorMessage(new GitLabError("http", "x", 503))).toContain("503")
  })

  it("falls back to a generic message for a non-GitLabError", () => {
    expect(syncErrorMessage(new Error("whatever"))).toBe("同期中にエラーが発生しました")
  })
})

describe("syncProject", () => {
  it("syncs every repository of the project, in sortOrder, and returns the results in the same order", async () => {
    gitRepositoryFindMany.mockResolvedValue([{ id: "r1" }, { id: "r2" }])
    gitRepositoryFindUnique.mockResolvedValue(null) // each repo sync resolves "disabled" (simplest end-to-end path)
    const results = await syncProject("p1", vi.fn())
    expect(gitRepositoryFindMany).toHaveBeenCalledWith({ where: { projectId: "p1" }, select: { id: true }, orderBy: { sortOrder: "asc" } })
    expect(results).toEqual([
      { repositoryId: "r1", ok: false, links: 0, error: "disabled" },
      { repositoryId: "r2", ok: false, links: 0, error: "disabled" },
    ])
  })

  it("returns an empty array when the project has no repositories", async () => {
    gitRepositoryFindMany.mockResolvedValue([])
    expect(await syncProject("p1", vi.fn())).toEqual([])
  })
})

describe("syncRepository — tags", () => {
  it("stores the repository's tags and still succeeds when the tag lookup fails", async () => {
    gitRepositoryFindUnique.mockResolvedValue(repoRow({ externalId: 9, webUrl: "https://gitlab.example/g/r" }))
    const ok = emptyClient({ listTags: vi.fn().mockResolvedValue([{ name: "v1.0.0", commit: { committed_date: "2026-09-30T00:00:00Z" } }]) })
    expect((await syncRepository("r1", () => ok, NOW)).ok).toBe(true)
    expect(gitReleaseUpsert).toHaveBeenCalledWith(expect.objectContaining({ create: expect.objectContaining({ tag: "v1.0.0", projectId: "p1", repositoryId: "r1" }) }))
    expect(publishAfterCommit).toHaveBeenCalledWith({ type: "git", projectId: "p1", action: "sync" })

    const broken = emptyClient({ listTags: vi.fn().mockRejectedValue(new Error("boom")) })
    expect((await syncRepository("r1", () => broken, NOW)).ok).toBe(true)
  })
})
