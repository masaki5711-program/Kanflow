import { beforeEach, describe, expect, it, vi } from "vitest"
import type { DevConnection, DevCursor } from "../dev-source"
import { describeDevSourceContract } from "./dev-source-contract"
import { createFakeGitStation, INTEGRATION, PROJECT_ID, REPO, STATION, STATION_HOST, TOKEN, type FakeGitStation } from "./fake-gitstation"

const logs = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }
const noopLog = { ...logs, child: () => noopLog }
vi.mock("@/lib/logger", () => ({ logger: noopLog }))
process.env.GITSTATION_ALLOWED_HOSTS = STATION_HOST

const { createGitStationClient, GONE_REASONS, GitStationError, MAX_RESPONSE_BYTES } = await import("@/lib/git/gitstation-client")
const { gitStationSourceKind, decodeStationCursor, encodeStationCursor, readFeed, routeFeed, MAX_STATE_PAGES } = await import("../gitstation-source")
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

const clientOn = (station: FakeGitStation, fetchImpl: typeof fetch = station.fetchImpl) =>
  createGitStationClient({ apiBase: STATION, token: TOKEN, integrationId: INTEGRATION, fetchImpl, sleep })

function sourceOn(station: FakeGitStation, overrides: Partial<DevConnection> = {}) {
  return gitStationSourceKind.connect(connection(overrides), {
    gitstation: (o) => createGitStationClient({ ...o, fetchImpl: station.fetchImpl, sleep }),
  })
}

/** The empty position: restart (head, state re-read, then the feed). */
const fresh = () => gitStationSourceKind.cursors.fromRow({ cursor: null }, NOW)
/** A position before everything the test pushes next. */
const here = (station: FakeGitStation) => encodeStationCursor(station.head())
const integrationCalls = (station: FakeGitStation) =>
  station.requests.filter((r) => r.includes("/integrations/")).map((r) => r.replace(/\?.*$/, "").replace(`/api/v1/integrations/${INTEGRATION}`, ""))

beforeEach(() => {
  for (const f of Object.values(logs)) f.mockClear()
  sleep.mockClear()
})

// ------------------------------------------------------------------ the shared contract

describeDevSourceContract("GitStation (fake GitStation)", () => {
  const station = createFakeGitStation()
  station.mergeRequest("merge_request.opened", 1, { title: "Login form (PBI-1)" })
  // Linked while the state is re-read (after the head): the restarted read sees it.
  station.onHeadTaken(() =>
    station.push("commit.linked", { project: REPO, sha: "a1b2c3", title: "fix: lock (PBI-2)", message: "fix: lock (PBI-2)", url: `${STATION}/${REPO}/-/commit/a1b2c3`, author_name: "Dev One", committed_at: "2026-10-01T00:00:00Z" }, station.workItem("PBI-2")),
  )
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
  it("is gitstation:v1:<GitStation cursor>, the empty position meaning 'restart'", () => {
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

  it("refuses a base URL outside GITSTATION_ALLOWED_HOSTS before any request (the token goes nowhere else)", () => {
    const fetchImpl = vi.fn()
    for (const apiBase of ["https://evil.example", "http://gitstation.example", "https://gitstation.example:8443", "https://user@gitstation.example", "https://gitstation.example/x"]) {
      expect(() => createGitStationClient({ apiBase, token: TOKEN, integrationId: INTEGRATION, fetchImpl: fetchImpl as never })).toThrow(expect.objectContaining({ kind: "host_not_allowed" }))
    }
    expect(() => createGitStationClient({ apiBase: STATION, token: TOKEN, integrationId: INTEGRATION, allowedHosts: [] })).toThrow(expect.objectContaining({ kind: "host_not_allowed" }))
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it("refuses a response larger than the cap without parsing it", async () => {
    const fetchImpl: typeof fetch = async () => new Response("{}", { status: 200, headers: { "content-length": String(MAX_RESPONSE_BYTES + 1) } })
    await expect(createGitStationClient({ apiBase: STATION, token: TOKEN, integrationId: INTEGRATION, fetchImpl }).headCursor()).rejects.toMatchObject({ kind: "invalid_response" })
  })

  it("retries 503 and 429 after Retry-After (logged), then succeeds", async () => {
    const station = createFakeGitStation()
    const start = here(station)
    station.mergeRequest("merge_request.opened", 1)
    station.fail(`/integrations/${INTEGRATION}/events`, 503, { error_code: "FG-DB-0012" }, { "retry-after": "2" })
    station.fail(`/integrations/${INTEGRATION}/events`, 429, {}, { "retry-after": "1" })
    const changes = await sourceOn(station).readChanges(start, NOW)
    expect(changes.failures).toEqual([])
    expect(changes.mergeRequests).toHaveLength(1)
    expect(sleep).toHaveBeenNthCalledWith(1, 2000)
    expect(sleep).toHaveBeenNthCalledWith(2, 1000)
    expect(logs.warn).toHaveBeenCalledWith("gitstation request retried", { status: 503, waitSec: 2, attempt: 1 })
  })

  it("gives up on a transient answer after the retries (the next poll tries again) and keeps the position", async () => {
    const station = createFakeGitStation()
    station.mergeRequest("merge_request.opened", 1)
    station.fail(`/integrations/${INTEGRATION}/events`, 503, {}, { "retry-after": "1" }, 5)
    const start = here(station)
    const changes = await sourceOn(station).readChanges(start, NOW)
    expect(changes.failures).toHaveLength(1)
    expect(changes.cursor).toBe(start)
    expect(sourceOn(station).describeError(changes.failures[0].error)).toMatchObject({ kind: "unavailable", expected: true })
  })

  it("does not wait for a Retry-After longer than a poll should block", async () => {
    const station = createFakeGitStation()
    station.fail(`/integrations/${INTEGRATION}/events`, 429, {}, { "retry-after": "120" })
    const changes = await sourceOn(station).readChanges(here(station), NOW)
    expect(sleep).not.toHaveBeenCalled()
    expect(sourceOn(station).describeError(changes.failures[0].error).kind).toBe("rate_limited")
  })
})

// ------------------------------------------------------------------ restart (empty position, 410)

describe("GitStation restart", () => {
  it("an empty position takes the head first, re-reads the state (merge requests older than the retention too), then reads from the head", async () => {
    const station = createFakeGitStation()
    station.mergeRequest("merge_request.opened", 1)
    station.mergeRequest("merge_request.merged", 1)
    station.prune() // GitStation no longer keeps those events; the state does
    station.onHeadTaken(() => station.mergeRequest("merge_request.opened", 2))
    const changes = await sourceOn(station).readChanges(fresh(), NOW)
    expect(integrationCalls(station)).toEqual(["/events/cursor", "/dev_status", "/events"])
    expect(Object.fromEntries(changes.mergeRequests.map((m) => [m.ref, m.state]))).toEqual({ "1": "merged", "2": "opened" })
    expect(decodeStationCursor(changes.cursor)).toBe(station.head())
  })

  it("an empty position whose head cannot be taken stays empty (nothing read, nothing skipped)", async () => {
    const station = createFakeGitStation()
    station.fail(`/integrations/${INTEGRATION}/events/cursor`, 503, {}, {}, 5)
    const changes = await sourceOn(station).readChanges(fresh(), NOW)
    expect(changes.cursor).toBe(fresh())
    expect(changes.failures.map((f) => f.kind)).toEqual(["feed"])
  })

  it.each(GONE_REASONS)("410 %s: takes the head cursor first, re-reads the state, then reads on — logged, never a silent jump", async (reason) => {
    const station = createFakeGitStation()
    station.mergeRequest("merge_request.opened", 1)
    station.mergeRequest("merge_request.closed", 1)
    const stale = here(station)
    station.mergeRequest("merge_request.opened", 2)
    station.fail(`/integrations/${INTEGRATION}/events`, 410, { error_code: "FG-INT-0007", reason })
    const changes = await sourceOn(station).readChanges(stale, NOW)
    expect(changes.failures).toEqual([])
    expect(Object.fromEntries(changes.mergeRequests.map((m) => [m.ref, m.state]))).toEqual({ "1": "closed", "2": "opened" })
    expect(integrationCalls(station)).toEqual(["/events", "/events/cursor", "/dev_status", "/events"])
    expect(decodeStationCursor(changes.cursor)).toBe(station.head())
    expect(logs.warn).toHaveBeenCalledWith("gitstation feed restarted", expect.objectContaining({ reason }))
  })

  it("410 after the first page that cannot be recovered keeps the position the read STARTED from, with what it read", async () => {
    const station = createFakeGitStation({ pageSize: 1 })
    const start = here(station)
    station.mergeRequest("merge_request.opened", 1)
    station.mergeRequest("merge_request.opened", 2)
    let eventCalls = 0
    const fetchImpl: typeof fetch = async (input, init) => {
      const path = new URL(String(input)).pathname
      if (path.endsWith("/events") && ++eventCalls === 2) return new Response(JSON.stringify({ error_code: "FG-INT-0007", reason: "retention" }), { status: 410 })
      if (path.endsWith("/events/cursor")) return new Response("{}", { status: 503, headers: { "retry-after": "999" } })
      return station.fetchImpl(input, init)
    }
    const read = await readFeed(clientOn(station, fetchImpl), start, [REPO])
    expect(read.cursor).toBe(start)
    expect(read.events.map((e) => e.id)).toEqual(["evt_1"])
    expect(read.failures.map((f) => f.kind)).toEqual(["feed"])
  })

  it("one repository's failing state re-read does not block the 410 recovery of the others (isolated, reported on it)", async () => {
    const station = createFakeGitStation()
    station.mergeRequest("merge_request.opened", 1)
    station.mergeRequest("merge_request.opened", 2, { project: "app/api" })
    const stale = here(station)
    station.failState("app/api")
    station.fail(`/integrations/${INTEGRATION}/events`, 410, { error_code: "FG-INT-0007", reason: "retention" })
    const read = await readFeed(clientOn(station), stale, [REPO, "app/api"])
    expect(decodeStationCursor(read.cursor)).toBe(station.head())
    expect([...read.snapshots.keys()]).toEqual([REPO])
    expect([...read.rereadFailures.keys()]).toEqual(["app/api"])
    const routed = routeFeed(read, [{ id: "r1", repoPath: REPO, projectId: PROJECT_ID }, { id: "r2", repoPath: "app/api", projectId: PROJECT_ID }], NOW)
    expect(routed.changes.get("r1")!.failures).toEqual([])
    expect(routed.changes.get("r2")!.failures.map((f) => f.kind)).toEqual(["mr"])
  })

  it("a state listing longer than the bound is a failure of that repository (a cut-short state cannot be trusted)", async () => {
    const station = createFakeGitStation()
    const client = { ...clientOn(station), listMergeRequests: async () => ({ items: [], truncated: true }) }
    const read = await readFeed(client, fresh(), [REPO])
    expect((read.rereadFailures.get(REPO) as InstanceType<typeof GitStationError>).kind).toBe("truncated")
    expect(logs.warn).toHaveBeenCalledWith("gitstation state re-read truncated", expect.objectContaining({ pages: MAX_STATE_PAGES }))
  })

  it("re-reads only the marked repositories without restarting the feed", async () => {
    const station = createFakeGitStation()
    station.mergeRequest("merge_request.opened", 1, { project: "app/api" })
    const start = here(station)
    const read = await readFeed(clientOn(station), start, [REPO, "app/api"], {}, ["app/api"])
    expect(integrationCalls(station)).toEqual(["/dev_status", "/events"])
    expect([...read.snapshots.keys()]).toEqual(["app/api"])
    expect(read.restarted).toBeNull()
  })
})

// ------------------------------------------------------------------ feed semantics

describe("GitStation feed", () => {
  it("dedupes an event delivered twice (at least once) by its id", async () => {
    const station = createFakeGitStation()
    const start = here(station)
    station.mergeRequest("merge_request.opened", 1)
    const again = { ...station.events[0] }
    station.push(again.type, again.data, again.work_items, again.id)
    const read = await readFeed(clientOn(station), start, [REPO])
    expect(read.events.map((e) => e.id)).toEqual(["evt_1"])
  })

  it("skips event types Kanflow does not use (unknown ones included) without failing", async () => {
    const station = createFakeGitStation()
    const start = here(station)
    station.push("merge_request.conflict_predicted_v9", { project: REPO, iid: 1, title: "x", url: `${STATION}/x` })
    station.push("deployment.succeeded", { project: REPO })
    station.mergeRequest("merge_request.opened", 2)
    const changes = await sourceOn(station).readChanges(start, NOW)
    expect(changes.failures).toEqual([])
    expect(changes.mergeRequests.map((m) => m.ref)).toEqual(["2"])
  })

  it("skips events of an unexpected shape, logged once with the count", async () => {
    const station = createFakeGitStation()
    station.rawEvents({ events: [{ id: "evt_x", type: "merge_request.opened" }, "junk", { id: "evt_y", type: "merge_request.opened", occurred_at: "2026-10-01T00:00:00Z", data: { project: REPO, iid: 3, title: "t", url: `${STATION}/t` }, work_items: station.workItem("PBI-1") }], next_cursor: "aead.next", has_more: false })
    const changes = await sourceOn(station).readChanges(here(station), NOW)
    expect(changes.mergeRequests.map((m) => m.ref)).toEqual(["3"])
    expect(logs.warn).toHaveBeenCalledWith("gitstation events of an unexpected shape skipped", expect.objectContaining({ count: 2 }))
  })

  it("an empty or over-long next_cursor is invalid_response (not 'resync'), keeping the position", async () => {
    for (const next of ["", "x".repeat(3000)]) {
      const station = createFakeGitStation()
      station.rawEvents({ events: [], next_cursor: next, has_more: false })
      const start = here(station)
      const changes = await sourceOn(station).readChanges(start, NOW)
      expect(changes.cursor).toBe(start)
      const info = sourceOn(station).describeError(changes.failures[0].error)
      expect(info.kind).toBe("invalid_response")
      expect(info.message).not.toContain("過去分を再同期")
    }
  })

  it("has_more with a cursor that did not move is a failure, not an endless loop", async () => {
    const station = createFakeGitStation()
    const start = here(station)
    station.rawEvents({ events: [], next_cursor: decodeStationCursor(start), has_more: true })
    const changes = await sourceOn(station).readChanges(start, NOW)
    expect(changes.cursor).toBe(start)
    expect(sourceOn(station).describeError(changes.failures[0].error).kind).toBe("invalid_response")
  })

  it("takes only events naming a work item of the repository's own Kanflow project", async () => {
    const station = createFakeGitStation()
    const start = here(station)
    station.mergeRequest("merge_request.opened", 1, {}, station.workItem("PBI-1", "another-project"))
    station.mergeRequest("merge_request.opened", 2, {}, [])
    station.mergeRequest("merge_request.opened", 3)
    const changes = await sourceOn(station).readChanges(start, NOW)
    expect(changes.mergeRequests.map((m) => m.ref)).toEqual(["3"])
  })

  it("takes only the repository's own path from a feed spanning several repositories", async () => {
    const station = createFakeGitStation()
    const start = here(station)
    station.mergeRequest("merge_request.opened", 1, { project: "app/api" })
    station.mergeRequest("merge_request.opened", 2)
    const changes = await sourceOn(station).readChanges(start, NOW)
    expect(changes.mergeRequests.map((m) => m.ref)).toEqual(["2"])
  })

  it("warns once per read, with samples, about events naming one of these projects but matching no repository", async () => {
    const station = createFakeGitStation()
    const start = here(station)
    station.mergeRequest("merge_request.opened", 7, { project: "app/unregistered" })
    const read = await readFeed(clientOn(station), start, [REPO])
    routeFeed(read, [{ id: "r1", repoPath: REPO, projectId: PROJECT_ID }, { id: "r2", repoPath: "app/api", projectId: PROJECT_ID }], NOW, { feedId: "f1" })
    const calls = logs.warn.mock.calls.filter((c) => c[0] === "gitstation events match no repository")
    expect(calls).toEqual([["gitstation events match no repository", { feedId: "f1", count: 1, samples: [{ id: "evt_1", path: "app/unregistered" }] }]])
  })

  it("logs an unusable event once per read with its id and type, however many repositories it reaches", async () => {
    const station = createFakeGitStation()
    const start = here(station)
    station.push("merge_request.updated", { project: REPO, title: "no iid" }, [...station.workItem("PBI-1"), ...station.workItem("PBI-1", "p2")])
    const read = await readFeed(clientOn(station), start, [REPO])
    routeFeed(read, [{ id: "r1", repoPath: REPO, projectId: PROJECT_ID }, { id: "r2", repoPath: REPO, projectId: "p2" }], NOW)
    const calls = logs.warn.mock.calls.filter((c) => c[0] === "gitstation events not usable")
    expect(calls).toEqual([["gitstation events not usable", { count: 1, samples: [{ id: "evt_1", type: "merge_request.updated" }] }]])
  })

  it("counts and logs re-read items that do not parse", async () => {
    const read = { start: fresh(), events: [], snapshots: new Map([[REPO, [{ project: REPO, iid: "x" } as never, { project: REPO, iid: 4, title: "ok", state: "open", url: `${STATION}/4`, source_branch: "b" }]]]), rereadFailures: new Map(), cursor: fresh(), failures: [], restarted: null }
    const routed = routeFeed(read, [{ id: "r1", repoPath: REPO, projectId: PROJECT_ID }], NOW)
    expect(routed.changes.get("r1")!.mergeRequests.map((m) => m.ref)).toEqual(["4"])
    expect(logs.warn).toHaveBeenCalledWith("gitstation state items not usable", { count: 1 })
  })

  it("takes the state from lifecycle events only: a later event's data.state does not change a known state", async () => {
    const station = createFakeGitStation()
    const start = here(station)
    station.mergeRequest("merge_request.opened", 1)
    station.push("merge_request.approved", { project: REPO, iid: 1, state: "closed" })
    const changes = await sourceOn(station).readChanges(start, NOW)
    expect(changes.mergeRequests).toEqual([expect.objectContaining({ ref: "1", state: "opened" })])
  })

  it("continues from the cursor it returned: nothing is read twice, nothing is skipped", async () => {
    const station = createFakeGitStation()
    const start = here(station)
    station.mergeRequest("merge_request.opened", 1)
    const source = sourceOn(station)
    const first = await source.readChanges(start, NOW)
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
    const start = here(station)
    const changes = await sourceOn(station).readChanges(start, NOW)
    expect(changes.cursor).toBe(start)
    const info = sourceOn(station).describeError(changes.failures[0].error)
    expect(info).toMatchObject({ kind: "cursor", expected: false, message: CURSOR_INVALID_MESSAGE })
    expect(info.message).toContain("過去分を再同期")
  })

  it("a missing integration id is a failure with its own message, not a request", async () => {
    const station = createFakeGitStation()
    const source = sourceOn(station, { stationIntegrationId: null })
    let caught: unknown
    await source.readChanges(here(station), NOW).catch((e: unknown) => (caught = e))
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

  it.each([[["another-project"]], [[PROJECT_ID, "another-project"]], [[]]])("locate refuses a repository not bound to exactly this Kanflow project (%j)", async (bound) => {
    const station = createFakeGitStation()
    station.bind("app/other", bound)
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
    const start = here(station)
    station.mergeRequest("merge_request.opened", 1)
    const source = sourceOn(station)
    const first = await source.readChanges(start, NOW)
    expect(first.mergeRequests[0].state).toBe("opened")
    station.mergeRequest("merge_request.closed", 1)
    const second = await source.readChanges(first.cursor, NOW)
    expect(station.events.at(-1)?.type).toBe("merge_request.closed")
    expect(second.mergeRequests).toEqual([expect.objectContaining({ ref: "1", state: "closed", mergedAt: null })])
  })

  it("close → reopen → merge are read in order and end merged", async () => {
    const station = createFakeGitStation()
    const start = here(station)
    station.mergeRequest("merge_request.opened", 1)
    const source = sourceOn(station)
    const first = await source.readChanges(start, NOW)
    station.mergeRequest("merge_request.closed", 1)
    station.mergeRequest("merge_request.reopened", 1)
    const merged = station.mergeRequest("merge_request.merged", 1)
    const read = await readFeed(clientOn(station), first.cursor as DevCursor, [REPO])
    expect(read.events.map((e) => e.type)).toEqual(["merge_request.closed", "merge_request.reopened", "merge_request.merged"])
    const changes = await source.readChanges(first.cursor, NOW)
    expect(changes.mergeRequests).toEqual([expect.objectContaining({ ref: "1", state: "merged", mergedAt: merged.data.merged_at })])
  })

  it("a merge that deletes the source branch keeps the merge request link (branch deletion carries no state change)", async () => {
    const station = createFakeGitStation()
    const start = here(station)
    station.mergeRequest("merge_request.opened", 1)
    station.mergeRequest("merge_request.merged", 1)
    station.push("merge_request.source_branch_deleted", { project: REPO, iid: 1 })
    station.setBranches(REPO, [])
    const source = sourceOn(station)
    const changes = await source.readChanges(start, NOW)
    expect(changes.mergeRequests).toEqual([expect.objectContaining({ ref: "1", state: "merged", sourceBranch: "feature/PBI-1-login-form" })])
    expect((await source.listBranches(NOW)).items).toEqual([])
  })

  it("open → close inside one poll interval: both events come back and the merge request ends closed", async () => {
    const station = createFakeGitStation()
    const source = sourceOn(station)
    const first = await source.readChanges(here(station), NOW)
    station.mergeRequest("merge_request.opened", 5)
    station.mergeRequest("merge_request.closed", 5)
    const read = await readFeed(clientOn(station), first.cursor, [REPO])
    expect(read.events.map((e) => e.type)).toEqual(["merge_request.opened", "merge_request.closed"])
    const changes = await source.readChanges(first.cursor, NOW)
    expect(changes.mergeRequests).toEqual([expect.objectContaining({ ref: "5", state: "closed" })])
    expect(changes.freshMergeRequestRefs.has("5")).toBe(true)
  })

  it("a cursor older than the retention answers 410 and the state is re-read (closed merge requests included)", async () => {
    const station = createFakeGitStation()
    station.mergeRequest("merge_request.opened", 1)
    const stale = here(station)
    station.mergeRequest("merge_request.closed", 1)
    station.prune()
    station.fail(`/integrations/${INTEGRATION}/events`, 410, { error_code: "FG-INT-0007", reason: "retention" })
    const changes = await sourceOn(station).readChanges(stale, NOW)
    expect(changes.failures).toEqual([])
    expect(changes.mergeRequests).toEqual([expect.objectContaining({ ref: "1", state: "closed" })])
  })
})
