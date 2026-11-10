import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const gitRepositoryFindMany = vi.fn()
const noopLog = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), child: () => noopLog }

vi.mock("@/lib/prisma", () => ({ prisma: { gitRepository: { findMany: (...a: unknown[]) => gitRepositoryFindMany(...a) } } }))
vi.mock("@/lib/logger", () => ({ logger: noopLog }))
vi.mock("@/services/git/git.service", () => ({ pollIntervalSec: vi.fn(() => 180) }))
vi.mock("@/services/sprint-backlog/sprint-backlog.service", () => ({ updateTask: vi.fn() }))
vi.mock("@/services/git/acceptance-check.service", () => ({ reportAcceptanceChecks: vi.fn(async () => ({ reported: 0, unchanged: 0, failed: 0, waiting: 0 })) }))

const { shouldStartGitPoller, runGitSyncTick } = await import("../poller")
const { reportAcceptanceChecks } = await import("@/services/git/acceptance-check.service")
/** No GitStation feed in these tests (the feed pass has its own tests). */
const noFeeds = vi.fn(async () => [])

beforeEach(() => {
  vi.clearAllMocks()
  gitRepositoryFindMany.mockResolvedValue([])
})

describe("shouldStartGitPoller", () => {
  it("is disabled by GIT_SYNC=off, case-insensitively, regardless of NODE_ENV", () => {
    expect(shouldStartGitPoller({ GIT_SYNC: "off", NODE_ENV: "production" })).toEqual({ start: false, reason: "GIT_SYNC=off" })
    expect(shouldStartGitPoller({ GIT_SYNC: "OFF", NODE_ENV: "production" })).toEqual({ start: false, reason: "GIT_SYNC=off" })
  })

  it("is disabled outside production unless GIT_SYNC_IN_DEV=true", () => {
    expect(shouldStartGitPoller({ NODE_ENV: "development" })).toEqual({ start: false, reason: "dev (set GIT_SYNC_IN_DEV=true)" })
    expect(shouldStartGitPoller({ NODE_ENV: "test" })).toEqual({ start: false, reason: "dev (set GIT_SYNC_IN_DEV=true)" })
    expect(shouldStartGitPoller({} as unknown as NodeJS.ProcessEnv)).toEqual({ start: false, reason: "dev (set GIT_SYNC_IN_DEV=true)" })
  })

  it("starts in development when GIT_SYNC_IN_DEV=true", () => {
    expect(shouldStartGitPoller({ NODE_ENV: "development", GIT_SYNC_IN_DEV: "true" })).toEqual({ start: true, reason: "default" })
  })

  it("starts in production by default", () => {
    expect(shouldStartGitPoller({ NODE_ENV: "production" })).toEqual({ start: true, reason: "default" })
  })
})

describe("runGitSyncTick", () => {
  it("queries only enabled, live projects' repositories, oldest-synced first", async () => {
    gitRepositoryFindMany.mockResolvedValue([{ id: "r1" }, { id: "r2" }])
    const sync = vi.fn().mockResolvedValue({ repositoryId: "x", ok: true, links: 0 })
    const count = await runGitSyncTick(sync, noFeeds)
    expect(count).toBe(2)
    expect(gitRepositoryFindMany).toHaveBeenCalledWith({
      where: { project: { deletedAt: null, gitIntegration: { enabled: true, provider: { not: "gitstation" } } } },
      select: { id: true },
      orderBy: { syncedAt: { sort: "asc", nulls: "first" } },
    })
    expect(sync).toHaveBeenNthCalledWith(1, "r1")
    expect(sync).toHaveBeenNthCalledWith(2, "r2")
  })

  it("reads every GitStation feed once per tick after the GitLab repositories and warns for their failures", async () => {
    gitRepositoryFindMany.mockResolvedValue([{ id: "r1" }])
    const sync = vi.fn().mockResolvedValue({ repositoryId: "r1", ok: true, links: 0 })
    const feeds = vi.fn(async () => [
      { repositoryId: "g1", ok: true, links: 1 },
      { repositoryId: "g2", ok: false, links: 0, error: "auth" },
    ])
    expect(await runGitSyncTick(sync, feeds)).toBe(3)
    expect(feeds).toHaveBeenCalledTimes(1)
    expect(noopLog.warn).toHaveBeenCalledWith("repository sync failed", { repositoryId: "g2", error: "auth" })
  })

  it("logs a warning for a repository sync failure that is not merely 'disabled'", async () => {
    gitRepositoryFindMany.mockResolvedValue([{ id: "r1" }])
    const sync = vi.fn().mockResolvedValue({ repositoryId: "r1", ok: false, links: 0, error: "auth" })
    await runGitSyncTick(sync, noFeeds)
    expect(noopLog.warn).toHaveBeenCalledWith("repository sync failed", { repositoryId: "r1", error: "auth" })
  })

  it("does not warn when a repository is simply disabled", async () => {
    gitRepositoryFindMany.mockResolvedValue([{ id: "r1" }])
    const sync = vi.fn().mockResolvedValue({ repositoryId: "r1", ok: false, links: 0, error: "disabled" })
    await runGitSyncTick(sync, noFeeds)
    expect(noopLog.warn).not.toHaveBeenCalled()
  })

  it("does not warn every tick for a provider Kanflow cannot read (the sync refused it and logged it once)", async () => {
    gitRepositoryFindMany.mockResolvedValue([{ id: "r1" }])
    const sync = vi.fn().mockResolvedValue({ repositoryId: "r1", ok: false, links: 0, error: "provider" })
    await runGitSyncTick(sync, noFeeds)
    expect(noopLog.warn).not.toHaveBeenCalled()
  })

  it("returns 0 and logs an error when the repository lookup itself fails", async () => {
    gitRepositoryFindMany.mockRejectedValue(new Error("db down"))
    const sync = vi.fn()
    const count = await runGitSyncTick(sync, noFeeds)
    expect(count).toBe(0)
    expect(sync).not.toHaveBeenCalled()
    expect(noopLog.error).toHaveBeenCalledWith("git sync tick failed", { error: "db down" })
  })

  it("never overlaps: a tick already running makes a concurrent call return 0 immediately", async () => {
    gitRepositoryFindMany.mockResolvedValue([{ id: "r1" }])
    let release!: () => void
    const gate = new Promise<void>((resolve) => (release = resolve))
    const slowSync = vi.fn().mockImplementation(async () => {
      await gate
      return { repositoryId: "r1", ok: true, links: 0 }
    })

    const first = runGitSyncTick(slowSync, noFeeds)
    const second = runGitSyncTick(slowSync, noFeeds)
    const secondResult = await second
    expect(secondResult).toBe(0)
    expect(gitRepositoryFindMany).toHaveBeenCalledTimes(1)

    release()
    await first
  })

  it("allows a new tick to run again once the previous one finished", async () => {
    gitRepositoryFindMany.mockResolvedValue([{ id: "r1" }])
    const sync = vi.fn().mockResolvedValue({ repositoryId: "r1", ok: true, links: 0 })
    await runGitSyncTick(sync, noFeeds)
    await runGitSyncTick(sync, noFeeds)
    expect(gitRepositoryFindMany).toHaveBeenCalledTimes(2)
  })

  it("reports the acceptance checks once per tick, after the repositories and the feeds", async () => {
    gitRepositoryFindMany.mockResolvedValue([{ id: "r1" }])
    const order: string[] = []
    const sync = vi.fn(async () => {
      order.push("sync")
      return { repositoryId: "r1", ok: true, links: 0 }
    })
    const feeds = vi.fn(async () => {
      order.push("feeds")
      return []
    })
    const report = vi.fn(async () => {
      order.push("acceptance")
    })
    expect(await runGitSyncTick(sync, feeds, report)).toBe(1)
    expect(order).toEqual(["sync", "feeds", "acceptance"])
    expect(report).toHaveBeenCalledTimes(1)
  })

  it("uses the acceptance check service when no reporter is passed", async () => {
    await runGitSyncTick(vi.fn(), noFeeds)
    expect(reportAcceptanceChecks).toHaveBeenCalledTimes(1)
    expect(reportAcceptanceChecks).toHaveBeenCalledWith()
  })

  it("a failing acceptance report is logged and never fails the tick", async () => {
    gitRepositoryFindMany.mockResolvedValue([{ id: "r1" }])
    const sync = vi.fn().mockResolvedValue({ repositoryId: "r1", ok: true, links: 0 })
    const boom = new Error("boom")
    const report = vi.fn(async () => {
      throw boom
    })
    expect(await runGitSyncTick(sync, noFeeds, report)).toBe(1)
    // The error itself, so the log keeps its stack.
    expect(noopLog.error).toHaveBeenCalledWith("acceptance check tick failed", { error: boom })
    // The next tick runs as usual (the failure did not leave the tick marked as running).
    const again = vi.fn(async () => undefined)
    expect(await runGitSyncTick(sync, noFeeds, again)).toBe(1)
    expect(again).toHaveBeenCalledTimes(1)
  })

  it("does not report when the tick itself fails (the repository lookup rejects)", async () => {
    gitRepositoryFindMany.mockRejectedValue(new Error("db down"))
    const report = vi.fn(async () => undefined)
    expect(await runGitSyncTick(vi.fn(), noFeeds, report)).toBe(0)
    expect(report).not.toHaveBeenCalled()
  })
})

describe("startGitPoller", () => {
  /** Fresh module instance per test: `timer` is private module state with no reset hook. */
  async function freshPoller() {
    vi.resetModules()
    return import("../poller")
  }

  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it("schedules a first pass after 30s and a recurring interval at the configured poll interval", async () => {
    const poller = await freshPoller()
    const setTimeoutSpy = vi.spyOn(global, "setTimeout")
    const setIntervalSpy = vi.spyOn(global, "setInterval")
    poller.startGitPoller()
    expect(setTimeoutSpy).toHaveBeenCalledWith(expect.any(Function), 30_000)
    expect(setIntervalSpy).toHaveBeenCalledWith(expect.any(Function), 180_000)
  })

  it("is idempotent: calling it again does not schedule a second interval", async () => {
    const poller = await freshPoller()
    const setIntervalSpy = vi.spyOn(global, "setInterval")
    poller.startGitPoller()
    expect(setIntervalSpy).toHaveBeenCalledTimes(1)
    poller.startGitPoller()
    expect(setIntervalSpy).toHaveBeenCalledTimes(1)
  })
})
