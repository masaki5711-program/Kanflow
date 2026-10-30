import { describe, expect, it, vi } from "vitest"
import type { DevConnection, DevCursor } from "../dev-source"
import { describeDevSourceContract } from "./dev-source-contract"

const noopLog = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), child: () => noopLog }
vi.mock("@/lib/logger", () => ({ logger: noopLog }))

const { createGitLabSource, decodeGitLabCursor, encodeGitLabCursor, gitLabCursorCodec, gitLabSourceKind, InvalidCursorError } = await import("../gitlab-source")
const { cursorsFromRow, cursorsToRow, resetForResync } = await import("../git-sync-cursors")
const { GitLabError } = await import("@/lib/git/gitlab-client")

const NOW = new Date("2026-10-01T00:00:00.000Z")
const DAY = 86_400_000
const CONNECTION: DevConnection = { repositoryId: "r1", apiBase: "https://gitlab.example", repoPath: "g/r", externalId: 7, token: "t" }

/** A GitLab project with one PBI merge request, commit and branch (or one that fails every request). */
function fakeClient(fail = false) {
  const reject = () => Promise.reject(new GitLabError("network", "down"))
  const when = <T>(value: T) => vi.fn(() => (fail ? reject() : Promise.resolve(value)))
  return {
    getProject: when({ id: 7 }),
    listMergeRequestPage: when({
      items: [{ iid: 4, title: "PBI-1 login", description: null, state: "opened", web_url: "https://gitlab.example/mr/4", source_branch: "feature/PBI-1", updated_at: "2026-09-30T00:00:00.000Z", merged_at: null, author: { username: "dev" } }],
      hasMore: false,
      serverTime: NOW,
    }),
    listCommits: when({ items: [{ id: "c".repeat(40), short_id: "cccc", title: "PBI-2 fix", message: "PBI-2 fix", web_url: "https://gitlab.example/c", author_name: "Dev", committed_date: "2026-09-30T00:00:00.000Z" }], truncated: false, pages: 1 }),
    listBranches: when({ items: [{ name: "feature/PBI-3-x", web_url: "https://gitlab.example/b", commit: { title: "wip", author_name: "Dev", committed_date: "2026-09-30T00:00:00.000Z" } }], truncated: false, pages: 1 }),
    getMergeRequestPipeline: when("success"),
    listTags: when([{ name: "v1", commit: { committed_date: "2026-09-01T00:00:00Z" } }]),
    listReleases: when([]),
  }
}

type FakeClient = ReturnType<typeof fakeClient>
const connected = (client: FakeClient, connection = CONNECTION) => createGitLabSource(connection, () => client as never)

describeDevSourceContract("GitLab", () => ({
  kind: gitLabSourceKind,
  freshRow: {},
  corruptRow: { mrCursorAt: new Date(Number.NaN), mrCursorSeen: 0, commitCursorAt: new Date(Number.NaN), commitWindowSec: 600 },
  healthy: () => connected(fakeClient()),
  failing: () => connected(fakeClient(true)),
  now: NOW,
}))

describe("GitLab cursor (opaque to the sync, stored in the per-listing columns)", () => {
  const row = {
    syncCursor: null,
    mrCursorAt: new Date("2026-09-20T00:00:00.000Z"),
    mrCursorSeen: 3,
    commitCursorAt: new Date("2026-09-25T00:00:00.000Z"),
    commitWindowSec: 3600,
    commitSkips: 1,
    lookbackCursorAt: new Date("2026-09-18T00:00:00.000Z"),
    lookbackWindowSec: 600,
    lookbackAt: new Date("2026-09-30T00:00:00.000Z"),
  }

  it("round-trips every column exactly as the K3 columns did", () => {
    const cursor = gitLabCursorCodec.fromRow(row, NOW)
    expect(gitLabCursorCodec.toRow(cursor)).toEqual(cursorsToRow(cursorsFromRow(row, NOW)))
    expect(decodeGitLabCursor(cursor)).toEqual(cursorsFromRow(row, NOW))
  })

  it("a never-synced or legacy (syncCursor only) row gets the same start as before", () => {
    const legacy = new Date("2026-09-10T00:00:00.000Z")
    expect(decodeGitLabCursor(gitLabCursorCodec.fromRow({}, NOW))).toEqual(cursorsFromRow({}, NOW))
    expect(decodeGitLabCursor(gitLabCursorCodec.fromRow({ syncCursor: legacy }, NOW))).toEqual(cursorsFromRow({ syncCursor: legacy }, NOW))
  })

  it("restart is the 過去分を再同期 reset, computed from the columns", () => {
    expect(gitLabCursorCodec.restart(row, NOW)).toEqual(cursorsToRow(resetForResync(cursorsFromRow(row, NOW), NOW)))
  })

  it("restart of a row with an unreadable commit position restarts commits 90 days back too", () => {
    const columns = gitLabCursorCodec.restart({ commitCursorAt: new Date(Number.NaN), commitWindowSec: 600 }, NOW)
    const from = new Date(NOW.getTime() - 90 * DAY)
    expect(columns).toMatchObject({ mrCursorAt: from, commitCursorAt: from, commitSkips: 0, lookbackCursorAt: from, lookbackAt: NOW })
  })

  it("a stored date that is not a date is an InvalidCursorError, not a crash or a silent restart", () => {
    expect(() => gitLabCursorCodec.fromRow({ mrCursorAt: new Date(Number.NaN) }, NOW)).toThrow(InvalidCursorError)
  })

  it.each([
    ["another provider's cursor", "gitstation:v1:{}"],
    ["malformed JSON", "gitlab:v1:{"],
    ["a missing date", 'gitlab:v1:{"mr":{"seen":0},"commit":{"at":"2026-01-01T00:00:00Z","widthSec":60,"skips":0}}'],
    ["a negative count", 'gitlab:v1:{"mr":{"at":"2026-01-01T00:00:00Z","seen":-1},"commit":{"at":"2026-01-01T00:00:00Z","widthSec":60,"skips":0}}'],
  ])("rejects %s with InvalidCursorError", (_label, cursor) => {
    expect(() => decodeGitLabCursor(cursor)).toThrow(InvalidCursorError)
  })

  it("encode / decode keep millisecond precision", () => {
    const c = cursorsFromRow({ mrCursorAt: new Date("2026-09-20T00:00:00.123Z"), mrCursorSeen: 0 }, NOW)
    expect(decodeGitLabCursor(encodeGitLabCursor(c))).toEqual(c)
  })
})

describe("GitLabSource", () => {
  it("resolves the GitLab project id once when it is not stored yet", async () => {
    const client = fakeClient()
    const source = connected(client, { ...CONNECTION, externalId: null })
    expect(await source.locate()).toBe(7)
    await source.listBranches(NOW)
    expect(client.getProject).toHaveBeenCalledTimes(1)
    expect(client.getProject).toHaveBeenCalledWith("g/r")
  })

  it("normalizes GitLab records (iid → ref, author name or username, branch head commit)", async () => {
    const source = connected(fakeClient())
    const changes = await source.readChanges(gitLabCursorCodec.fromRow({}, NOW), NOW)
    expect(changes.mergeRequests[0]).toEqual({
      ref: "4",
      title: "PBI-1 login",
      state: "opened",
      url: "https://gitlab.example/mr/4",
      sourceBranch: "feature/PBI-1",
      author: "dev",
      updatedAt: "2026-09-30T00:00:00.000Z",
      mergedAt: null,
    })
    expect((await source.listBranches(NOW)).items[0]).toEqual({ name: "feature/PBI-3-x", url: "https://gitlab.example/b", headTitle: "wip", headAuthor: "Dev", headCommittedAt: "2026-09-30T00:00:00.000Z" })
  })

  it("a truncated branch list is not complete (no branch may be marked gone)", async () => {
    const client = fakeClient()
    client.listBranches.mockResolvedValueOnce({ items: [], truncated: true, pages: 3 })
    expect((await connected(client).listBranches(NOW)).complete).toBe(false)
  })

  it("asks GitLab for the pipeline by the merge request iid", async () => {
    const client = fakeClient()
    expect(await connected(client).pipelineStatus("4")).toBe("success")
    expect(client.getMergeRequestPipeline).toHaveBeenCalledWith(7, 4)
  })

  it("reads tags as release drafts; a short list is complete", async () => {
    const listing = await connected(fakeClient()).listReleaseTags("https://gitlab.example/g/r", NOW)
    expect(listing.complete).toBe(true)
    expect(listing.drafts).toEqual([expect.objectContaining({ tag: "v1", url: "https://gitlab.example/g/r/-/tags/v1" })])
  })

  it("failed listings are reported, not logged by the source (the sync logs each once)", async () => {
    const changes = await connected(fakeClient(true)).readChanges(gitLabCursorCodec.fromRow({ lookbackAt: NOW }, NOW), NOW)
    expect(changes.failures.map((f) => f.kind)).toEqual(["mr", "commit"])
    expect(noopLog.warn).not.toHaveBeenCalledWith("git sync listing failed", expect.anything())
  })

  it("describes GitLab answers as expected (warning) and anything else as a defect (error)", () => {
    const source = connected(fakeClient())
    expect(source.describeError(new GitLabError("forbidden", "403", 403))).toMatchObject({ kind: "forbidden", expected: true, status: 403, message: expect.stringContaining("権限") })
    expect(source.describeError(new TypeError("x"))).toEqual({ kind: "http", expected: false, message: "同期中にエラーが発生しました" })
  })

  it("an invalid cursor fails readChanges instead of re-reading from scratch", async () => {
    const client = fakeClient()
    await expect(connected(client).readChanges("gitlab:v1:{" as DevCursor, NOW)).rejects.toBeInstanceOf(InvalidCursorError)
    expect(client.listMergeRequestPage).not.toHaveBeenCalled()
  })

  it("commit windows stay bounded by GitLab's clock as before (cursor 10 min behind)", async () => {
    const changes = await connected(fakeClient()).readChanges(gitLabCursorCodec.fromRow({ commitCursorAt: new Date(NOW.getTime() - DAY), lookbackAt: NOW }, NOW), NOW)
    expect(decodeGitLabCursor(changes.cursor).commit.at).toEqual(new Date(NOW.getTime() - 10 * 60_000))
  })
})
