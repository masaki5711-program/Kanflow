import { beforeEach, describe, expect, it, vi } from "vitest"
import type { DevConnection, DevCursor } from "../dev-source"
import { describeDevSourceContract } from "./dev-source-contract"
import { createFakeGitStation, INTEGRATION, PROJECT_ID, REPO, STATION, TOKEN, type FakeGitStation } from "./fake-gitstation"

const logs = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }
const noopLog = { ...logs, child: () => noopLog }
vi.mock("@/lib/logger", () => ({ logger: noopLog }))

const { createGitStationClient, GONE_REASONS, GitStationError } = await import("@/lib/git/gitstation-client")
const { gitStationSourceKind, decodeStationCursor, encodeStationCursor, readFeed } = await import("../gitstation-source")
const { CURSOR_INVALID_MESSAGE } = await import("@/lib/git/sync-messages")

const NOW = new Date("2026-10-02T00:00:00.000Z")
const sleep = vi.fn(async () => undefined)

const connection = (overrides: Partial<DevConnection> = {}): DevConnection => ({
  repositoryId: "r1",
  projectId: PROJECT_ID,
  apiBase: STATION,
  repoPath: REPO,
  externalId: null,
  token: TOKEN,
  stationIntegrationId: INTEGRATION,
  ...overrides,
})

function sourceOn(station: FakeGitStation, overrides: Partial<DevConnection> = {}) {
  return gitStationSourceKind.connect(connection(overrides), {
    gitstation: (o) => createGitStationClient({ ...o, fetchImpl: station.fetchImpl, sleep }),
  })
}

const fresh = () => gitStationSourceKind.cursors.fromRow({ cursor: null }, NOW)

beforeEach(() => {
  for (const f of Object.values(logs)) f.mockClear()
  sleep.mockClear()
})

// ------------------------------------------------------------------ the shared contract

describeDevSourceContract("GitStation (fake GitStation)", () => {
  const station = createFakeGitStation()
  station.mergeRequest("merge_request.opened", 1, { title: "Login form (PBI-1)" })
  station.push("commit.linked", { project: REPO, sha: "a1b2c3", title: "fix: lock (PBI-2)", message: "fix: lock (PBI-2)", url: `${STATION}/${REPO}/-/commit/a1b2c3`, author_name: "Dev One", committed_at: "2026-10-01T00:00:00Z" }, station.workItem("PBI-2"))
  station.setBranches(REPO, [{ name: "feature/PBI-3-form", url: `${STATION}/${REPO}/-/tree/feature/PBI-3-form`, commit: { title: "wip", author_name: "Dev One", committed_at: "2026-10-01T00:00:00Z" } }])
  const down: typeof fetch = async () => {
    throw new TypeError("connect ECONNREFUSED")
  }
  return {
    kind: gitStationSourceKind,
    freshRow: { cursor: null },
    corruptRow: { cursor: "not-a-gitstation-cursor" },
    healthy: () => sourceOn(station),
    failing: () => gitStationSourceKind.connect(connection(), { gitstation: (o) => createGitStationClient({ ...o, fetchImpl: down, sleep }) }),
    now: NOW,
  }
})

// ------------------------------------------------------------------ cursor and client

describe("GitStation cursor", () => {
  it("is gitstation:v1:<GitStation cursor>, the empty position meaning 'from the beginning'", () => {
    expect(encodeStationCursor("aead.xyz")).toBe("gitstation:v1:aead.xyz")
    expect(decodeStationCursor("gitstation:v1:aead.xyz")).toBe("aead.xyz")
    expect(decodeStationCursor("gitstation:v1:")).toBeNull()
    expect(() => decodeStationCursor("gitlab:v1:{}")).toThrow()
  })

  it("restart (過去分を再同期) clears the position without reading it", () => {
    expect(gitStationSourceKind.cursors.restart({ cursor: "garbage" }, NOW)).toEqual({ cursor: null })
  })
})

describe("GitStation client", () => {
  it("sends the service-account token as Bearer and never follows a redirect", async () => {
    const seen: RequestInit[] = []
    const fetchImpl: typeof fetch = async (_url, init) => {
      seen.push(init ?? {})
      return new Response(JSON.stringify({ cursor: "aead.1" }), { status: 200 })
    }
    await createGitStationClient({ apiBase: STATION, token: TOKEN, integrationId: INTEGRATION, fetchImpl }).headCursor()
    expect(new Headers(seen[0].headers).get("authorization")).toBe(`Bearer ${TOKEN}`)
    expect(seen[0].redirect).toBe("error")
  })

  it("retries 503 and 429 after Retry-After, then succeeds", async () => {
    const station = createFakeGitStation()
    station.mergeRequest("merge_request.opened", 1)
    station.fail(`/integrations/${INTEGRATION}/events`, 503, { error_code: "FG-DB-0012" }, { "retry-after": "2" })
    station.fail(`/integrations/${INTEGRATION}/events`, 429, {}, { "retry-after": "1" })
    const changes = await sourceOn(station).readChanges(fresh(), NOW)
    expect(changes.failures).toEqual([])
    expect(changes.mergeRequests).toHaveLength(1)
    expect(sleep).toHaveBeenNthCalledWith(1, 2000)
    expect(sleep).toHaveBeenNthCalledWith(2, 1000)
  })

  it("gives up on a transient answer after the retries (the next poll tries again) and keeps the position", async () => {
    const station = createFakeGitStation()
    station.mergeRequest("merge_request.opened", 1)
    station.fail(`/integrations/${INTEGRATION}/events`, 503, {}, { "retry-after": "1" }, 5)
    const start = encodeStationCursor(station.head())
    const changes = await sourceOn(station).readChanges(start, NOW)
    expect(changes.failures).toHaveLength(1)
    expect(changes.cursor).toBe(start)
    const info = sourceOn(station).describeError(changes.failures[0].error)
    expect(info).toMatchObject({ kind: "unavailable", expected: true })
  })

  it("does not wait for a Retry-After longer than a poll should block", async () => {
    const station = createFakeGitStation()
    station.fail(`/integrations/${INTEGRATION}/events`, 429, {}, { "retry-after": "120" })
    const changes = await sourceOn(station).readChanges(fresh(), NOW)
    expect(sleep).not.toHaveBeenCalled()
    expect(sourceOn(station).describeError(changes.failures[0].error).kind).toBe("rate_limited")
  })
})

// ------------------------------------------------------------------ feed semantics

describe("GitStation feed", () => {
  it("dedupes an event delivered twice (at least once) by its id", async () => {
    const station = createFakeGitStation()
    station.mergeRequest("merge_request.opened", 1)
    const again = { ...station.events[0] }
    station.push(again.type, again.data, again.work_items, again.id)
    const client = createGitStationClient({ apiBase: STATION, token: TOKEN, integrationId: INTEGRATION, fetchImpl: station.fetchImpl, sleep })
    const read = await readFeed(client, fresh(), [REPO])
    expect(read.events.map((e) => e.id)).toEqual(["evt_1"])
  })

  it("skips event types Kanflow does not use (unknown ones included) without failing", async () => {
    const station = createFakeGitStation()
    station.push("merge_request.conflict_predicted_v9", { project: REPO, iid: 1, title: "x", url: `${STATION}/x` })
    station.push("deployment.succeeded", { project: REPO })
    station.mergeRequest("merge_request.opened", 2)
    const changes = await sourceOn(station).readChanges(fresh(), NOW)
    expect(changes.failures).toEqual([])
    expect(changes.mergeRequests.map((m) => m.ref)).toEqual(["2"])
  })

  it("takes only events naming a work item of the repository's own Kanflow project", async () => {
    const station = createFakeGitStation()
    station.mergeRequest("merge_request.opened", 1, {}, station.workItem("PBI-1", "another-project"))
    station.mergeRequest("merge_request.opened", 2, {}, [])
    station.mergeRequest("merge_request.opened", 3)
    const changes = await sourceOn(station).readChanges(fresh(), NOW)
    expect(changes.mergeRequests.map((m) => m.ref)).toEqual(["3"])
  })

  it("takes only the repository's own path from a feed spanning several repositories", async () => {
    const station = createFakeGitStation()
    station.mergeRequest("merge_request.opened", 1, { project: "app/api" })
    station.mergeRequest("merge_request.opened", 2)
    const changes = await sourceOn(station).readChanges(fresh(), NOW)
    expect(changes.mergeRequests.map((m) => m.ref)).toEqual(["2"])
  })

  it("continues from the cursor it returned: nothing is read twice, nothing is skipped", async () => {
    const station = createFakeGitStation()
    station.mergeRequest("merge_request.opened", 1)
    const source = sourceOn(station)
    const first = await source.readChanges(fresh(), NOW)
    station.mergeRequest("merge_request.opened", 2)
    const second = await source.readChanges(first.cursor, NOW)
    expect(second.mergeRequests.map((m) => m.ref)).toEqual(["2"])
    const third = await source.readChanges(second.cursor, NOW)
    expect(third.mergeRequests).toEqual([])
    expect(third.cursor).toBe(second.cursor)
  })

  it("400 FG-INT-0008 keeps the position and asks for 過去分を再同期", async () => {
    const station = createFakeGitStation()
    station.fail(`/integrations/${INTEGRATION}/events`, 400, { error_code: "FG-INT-0008" })
    const start = encodeStationCursor(station.head())
    const changes = await sourceOn(station).readChanges(start, NOW)
    expect(changes.cursor).toBe(start)
    const info = sourceOn(station).describeError(changes.failures[0].error)
    expect(info).toMatchObject({ kind: "cursor", expected: false, message: CURSOR_INVALID_MESSAGE })
    expect(info.message).toContain("過去分を再同期")
  })

  it.each(GONE_REASONS)("410 %s: takes the head cursor first, re-reads the state, then reads on — logged, never a silent jump", async (reason) => {
    const station = createFakeGitStation()
    station.mergeRequest("merge_request.opened", 1)
    station.mergeRequest("merge_request.closed", 1)
    const stale = encodeStationCursor(station.head())
    station.mergeRequest("merge_request.opened", 2)
    station.fail(`/integrations/${INTEGRATION}/events`, 410, { error_code: "FG-INT-0007", reason })
    const changes = await sourceOn(station).readChanges(stale, NOW)
    expect(changes.failures).toEqual([])
    // State re-read: both merge requests with their current state.
    expect(Object.fromEntries(changes.mergeRequests.map((m) => [m.ref, m.state]))).toEqual({ "1": "closed", "2": "opened" })
    const order = station.requests.filter((r) => r.includes("/integrations/")).map((r) => r.replace(/\?.*$/, "").replace(`/api/v1/integrations/${INTEGRATION}`, ""))
    expect(order).toEqual(["/events", "/events/cursor", "/dev_status", "/events"])
    expect(decodeStationCursor(changes.cursor)).toBe(station.head())
    expect(logs.warn).toHaveBeenCalledWith("gitstation feed restarted", expect.objectContaining({ reason }))
  })

  it("410 whose state re-read fails reports the failure and keeps the old position (recovered next time)", async () => {
    const station = createFakeGitStation()
    station.mergeRequest("merge_request.opened", 1)
    const stale = encodeStationCursor(station.head())
    station.fail(`/integrations/${INTEGRATION}/events`, 410, { error_code: "FG-INT-0007", reason: "retention" })
    station.fail(`/integrations/${INTEGRATION}/dev_status`, 403, {})
    const changes = await sourceOn(station).readChanges(stale, NOW)
    expect(changes.failures.map((f) => f.kind)).toEqual(["mr"])
    expect(changes.cursor).toBe(stale)
  })

  it("a missing integration id is a failure with its own message, not a request", async () => {
    const station = createFakeGitStation()
    const source = sourceOn(station, { stationIntegrationId: null })
    let caught: unknown
    await source.readChanges(fresh(), NOW).catch((e: unknown) => (caught = e))
    expect(source.describeError(caught).message).toContain("連携 ID")
    expect(station.requests).toEqual([])
  })

  it("pipelines are not in the feed until M4: the status is null", async () => {
    expect(await sourceOn(createFakeGitStation()).pipelineStatus("1")).toBeNull()
  })

  it("maps tags with their release (name, description, date) and a bare tag with its commit date", async () => {
    const station = createFakeGitStation()
    station.setTags(REPO, [
      { name: "v1.0.0", url: `${STATION}/${REPO}/-/tags/v1.0.0`, commit: { committed_at: "2026-09-01T00:00:00Z" }, release: { name: "First", description: "notes", released_at: "2026-09-02T00:00:00Z" } },
      { name: "v1.0.1", url: `${STATION}/${REPO}/-/tags/v1.0.1`, commit: { committed_at: "2026-09-10T00:00:00Z" } },
    ])
    const listing = await sourceOn(station).listReleaseTags(`${STATION}/${REPO}`, NOW)
    expect(listing.complete).toBe(true)
    expect(listing.drafts).toEqual([
      { tag: "v1.0.0", name: "First", description: "notes", url: `${STATION}/${REPO}/-/tags/v1.0.0`, releasedAt: new Date("2026-09-02T00:00:00Z") },
      { tag: "v1.0.1", name: null, description: null, url: `${STATION}/${REPO}/-/tags/v1.0.1`, releasedAt: new Date("2026-09-10T00:00:00Z") },
    ])
  })

  it("locate checks the repository is visible and returns no numeric id (GitStation ids are opaque)", async () => {
    const station = createFakeGitStation()
    await expect(sourceOn(station).locate()).resolves.toBeNull()
    await expect(sourceOn(station, { repoPath: "app/unbound" }).locate()).rejects.toBeInstanceOf(GitStationError)
  })

  it("locate refuses a repository GitStation binds to another Kanflow project (the service-account token is shared)", async () => {
    const station = createFakeGitStation()
    station.bind("app/other", ["another-project"])
    const source = sourceOn(station, { repoPath: "app/other" })
    let caught: unknown
    await source.locate().catch((e: unknown) => (caught = e))
    expect(source.describeError(caught)).toMatchObject({ kind: "not_bound", expected: true, message: expect.stringContaining("結び付けられていません") })
  })
})

// ------------------------------------------------------------------ 02 §8.2 regression tests

describe("02 §8.2 regression: nothing is lost after a merge request is processed", () => {
  it("a merge request closed without merging comes back as merge_request.closed and shows as closed", async () => {
    const station = createFakeGitStation()
    station.mergeRequest("merge_request.opened", 1)
    const source = sourceOn(station)
    const first = await source.readChanges(fresh(), NOW)
    expect(first.mergeRequests[0].state).toBe("opened")
    station.mergeRequest("merge_request.closed", 1)
    const second = await source.readChanges(first.cursor, NOW)
    expect(station.events.at(-1)?.type).toBe("merge_request.closed")
    expect(second.mergeRequests).toEqual([expect.objectContaining({ ref: "1", state: "closed", mergedAt: null })])
  })

  it("close → reopen → merge are read in order and end merged", async () => {
    const station = createFakeGitStation()
    station.mergeRequest("merge_request.opened", 1)
    const source = sourceOn(station)
    const first = await source.readChanges(fresh(), NOW)
    station.mergeRequest("merge_request.closed", 1)
    station.mergeRequest("merge_request.reopened", 1)
    const merged = station.mergeRequest("merge_request.merged", 1)
    const client = createGitStationClient({ apiBase: STATION, token: TOKEN, integrationId: INTEGRATION, fetchImpl: station.fetchImpl, sleep })
    const read = await readFeed(client, first.cursor as DevCursor, [REPO])
    expect(read.events.map((e) => e.type)).toEqual(["merge_request.closed", "merge_request.reopened", "merge_request.merged"])
    const changes = await source.readChanges(first.cursor, NOW)
    expect(changes.mergeRequests).toEqual([expect.objectContaining({ ref: "1", state: "merged", mergedAt: merged.data.merged_at })])
  })

  it("a merge that deletes the source branch keeps the merge request link (branch deletion carries no state change)", async () => {
    const station = createFakeGitStation()
    station.mergeRequest("merge_request.opened", 1)
    station.mergeRequest("merge_request.merged", 1)
    station.push("merge_request.source_branch_deleted", { project: REPO, iid: 1 })
    station.setBranches(REPO, [])
    const source = sourceOn(station)
    const changes = await source.readChanges(fresh(), NOW)
    expect(changes.mergeRequests).toEqual([expect.objectContaining({ ref: "1", state: "merged", sourceBranch: "feature/PBI-1-login-form" })])
    expect((await source.listBranches(NOW)).items).toEqual([])
  })

  it("open → close inside one poll interval: both events come back and the merge request ends closed", async () => {
    const station = createFakeGitStation()
    const source = sourceOn(station)
    const first = await source.readChanges(fresh(), NOW)
    station.mergeRequest("merge_request.opened", 5)
    station.mergeRequest("merge_request.closed", 5)
    const client = createGitStationClient({ apiBase: STATION, token: TOKEN, integrationId: INTEGRATION, fetchImpl: station.fetchImpl, sleep })
    const read = await readFeed(client, first.cursor, [REPO])
    expect(read.events.map((e) => e.type)).toEqual(["merge_request.opened", "merge_request.closed"])
    const changes = await source.readChanges(first.cursor, NOW)
    expect(changes.mergeRequests).toEqual([expect.objectContaining({ ref: "5", state: "closed" })])
    expect(changes.freshMergeRequestRefs.has("5")).toBe(true)
  })

  it("a cursor older than the retention answers 410 and the state is re-read (closed merge requests included)", async () => {
    const station = createFakeGitStation()
    station.mergeRequest("merge_request.opened", 1)
    const stale = encodeStationCursor(station.head())
    station.mergeRequest("merge_request.closed", 1)
    station.prune()
    station.fail(`/integrations/${INTEGRATION}/events`, 410, { error_code: "FG-INT-0007", reason: "retention" })
    const changes = await sourceOn(station).readChanges(stale, NOW)
    expect(changes.failures).toEqual([])
    expect(changes.mergeRequests).toEqual([expect.objectContaining({ ref: "1", state: "closed" })])
  })
})
