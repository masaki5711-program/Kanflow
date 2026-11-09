import { readFileSync } from "node:fs"
import { join } from "node:path"
import { beforeEach, describe, expect, it, vi } from "vitest"
import type { DevConnection } from "../dev-source"
import { describeDevSourceContract } from "./dev-source-contract"
import { createFakeGitStation, INTEGRATION, oid, PROJECT_ID, REPO, REPO_ID, STATION, STATION_HOST, TOKEN, type FakeGitStation } from "./fake-gitstation"

const logs = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }
const noopLog = { ...logs, child: () => noopLog }
vi.mock("@/lib/logger", () => ({ logger: noopLog }))
process.env.GITSTATION_ALLOWED_HOSTS = STATION_HOST

const { createGitStationClient, GONE_REASONS, GitStationError, MAX_RESPONSE_BYTES } = await import("@/lib/git/gitstation-client")
const { gitStationSourceKind, createGitStationSource, decodeStationCursor, encodeStationCursor, readFeed, routeFeed, MAX_DEV_STATUS_PAGES, MAX_DETAILS_PER_PROJECT, MAX_FOLLOW_UPS_PER_READ, MAX_DEFECT_HOLDS } = await import("../gitstation-source")
const { CURSOR_INVALID_MESSAGE } = await import("@/lib/git/sync-messages")

/** GitStation's golden example (docs/api/integration-feed.example.json at GitStation main, I1c; synthetic). */
const GOLDEN = JSON.parse(readFileSync(join(import.meta.dirname, "fixtures", "gitstation-integration-feed.example.json"), "utf8")) as {
  page: { events: Record<string, unknown>[]; next_cursor: string; has_more: boolean }
  cursor: { cursor: string }
  gone: Record<string, unknown>
  invalid: Record<string, unknown>
}

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
  return createGitStationSource(connection(overrides), (o) => createGitStationClient({ ...o, fetchImpl: station.fetchImpl, sleep }))
}

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } })

/** The empty position: restart (head, state re-read, then the feed). */
const fresh = () => gitStationSourceKind.cursors.fromRow({ cursor: null }, NOW)
/** A position before everything the test pushes next. */
const here = (station: FakeGitStation) => encodeStationCursor(station.head())
/** Feed and state calls in order, without the binding check (resolve / bindings) and query strings. */
const feedCalls = (station: FakeGitStation) =>
  station.requests
    .map((r) => r.replace(/\?.*$/, "").replace("/api/v1", "").replace(`/integrations/${INTEGRATION}`, ""))
    .filter((r) => r !== "/namespaces/resolve" && !r.endsWith("/integration-bindings"))
const repo = (id: string, stationProjectId: number | null, projectId = PROJECT_ID) => ({ id, repoPath: `repo-${id}`, projectId, stationProjectId })

beforeEach(() => {
  for (const f of Object.values(logs)) f.mockClear()
  sleep.mockClear()
})

// ------------------------------------------------------------------ the shared contract

describeDevSourceContract("GitStation (fake GitStation)", () => {
  const station = createFakeGitStation()
  station.mergeRequest("merge_request.opened", 1, { title: "Login form (PBI-1)" })
  // Pushed while the state is re-read (after the head): the restarted read sees it.
  station.onHeadTaken(() => station.pushed(REPO, "refs/heads/main", [{ subject: "fix: lock (PBI-2)" }]))
  station.setBranches(REPO, ["feature/PBI-3-form", "main"])
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
      return json(200, { cursor: "aead.1" })
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

  it("reads the feed with `cursor` and `limit` only (GitStation refuses any other parameter)", async () => {
    const station = createFakeGitStation()
    const start = station.head()
    await clientOn(station).events(start)
    expect(station.requests).toEqual([`/api/v1/integrations/${INTEGRATION}/events?cursor=${start}&limit=500`])
  })

  it("parses GitStation's golden example page, cursor and errors", async () => {
    const answers = [json(200, GOLDEN.page), json(200, GOLDEN.cursor), json(410, GOLDEN.gone), json(400, GOLDEN.invalid)]
    const client = createGitStationClient({ apiBase: STATION, token: TOKEN, integrationId: INTEGRATION, fetchImpl: async () => answers.shift()!, sleep })
    const page = await client.events("AgAD")
    expect(page.malformed).toBe(0)
    expect(page.events.map((e) => [e.type, e.project_id, e.work_items])).toEqual([
      ["merge_request.closed", 12, [{ provider: "kanflow", project_id: "kf-1", ref: "PBI-123" }]],
      ["repository.pushed", 12, []],
    ])
    expect(page.nextCursor).toBe(GOLDEN.page.next_cursor)
    expect(await client.headCursor()).toBe(GOLDEN.cursor.cursor)
    await expect(client.events("AgAD")).rejects.toMatchObject({ kind: "gone", detail: { errorCode: "FG-INT-0007", reason: "visible_set_changed" } })
    await expect(client.events("AgAD")).rejects.toMatchObject({ kind: "cursor_invalid" })
  })

  it("an event without GitStation's numeric project id is malformed", async () => {
    const event = { ...GOLDEN.page.events[0], project_id: "app/portal" }
    const client = createGitStationClient({ apiBase: STATION, token: TOKEN, integrationId: INTEGRATION, fetchImpl: async () => json(200, { ...GOLDEN.page, events: [event] }), sleep })
    expect((await client.events("AgAD")).malformed).toBe(1)
  })

  it("resolves a path to a project id (a moved path to the project it moved to), refusing a group", async () => {
    const station = createFakeGitStation()
    const client = clientOn(station)
    await expect(client.resolveProject(REPO)).resolves.toEqual({ projectId: REPO_ID, canonicalPath: REPO, moved: false })
    await expect(client.resolveProject("app")).rejects.toMatchObject({ kind: "not_found" })
    station.move(REPO, "web/portal")
    await expect(client.resolveProject(REPO)).resolves.toEqual({ projectId: REPO_ID, canonicalPath: "web/portal", moved: true })
  })

  it("pages the merge request listing with before=<iid> and parses its items", async () => {
    const station = createFakeGitStation()
    for (let iid = 1; iid <= 150; iid++) station.mergeRequest("merge_request.opened", iid)
    const listing = await clientOn(station).listMergeRequests(REPO_ID, 5)
    expect(listing).toMatchObject({ truncated: false, skipped: 0 })
    expect(listing.items).toHaveLength(150)
    expect(feedCalls(station)).toEqual([`/projects/${REPO_ID}/merge-requests`, `/projects/${REPO_ID}/merge-requests`])
    expect(station.requests[1]).toContain("before=51")
    expect((await clientOn(station).listMergeRequests(REPO_ID, 1)).truncated).toBe(true)
  })

  it("builds GitStation's permalinks (they survive renames), each path segment encoded", () => {
    const client = clientOn(createFakeGitStation())
    expect(client.webUrl(12, "pull", "4")).toBe(`${STATION}/-/projects/12/pull/4`)
    expect(client.webUrl(12, "tree", "feature/PBI-1 x")).toBe(`${STATION}/-/projects/12/tree/feature/PBI-1%20x`)
    // A name can never walk the link to another page.
    expect(client.webUrl(12, "tree", "../../../admin/./x")).toBe(`${STATION}/-/projects/12/tree/admin/x`)
  })

  it("retries 503 and 429 after Retry-After (logged), then succeeds", async () => {
    const station = createFakeGitStation()
    const start = here(station)
    station.mergeRequest("merge_request.opened", 1)
    station.fail(`/integrations/${INTEGRATION}/events`, 503, { error_code: "FG-DB-0012" }, { "retry-after": "2" })
    station.fail(`/integrations/${INTEGRATION}/events`, 429, { error_code: "FG-WEB-0010" }, { "retry-after": "1" })
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

// ------------------------------------------------------------------ binding (locate)

describe("GitStation binding", () => {
  it("locate returns GitStation's project id when it is bound, for this integration, to exactly this Kanflow project", async () => {
    await expect(sourceOn(createFakeGitStation()).locate()).resolves.toBe(REPO_ID)
  })

  it("locate follows a moved path (logged) and refuses a path GitStation does not show", async () => {
    const station = createFakeGitStation()
    station.move(REPO, "web/portal")
    await expect(sourceOn(station).locate()).resolves.toBe(REPO_ID)
    expect(logs.info).toHaveBeenCalledWith("gitstation repository path moved", expect.objectContaining({ canonicalPath: "web/portal" }))
    await expect(sourceOn(station, { repoPath: "app/unknown" }).locate()).rejects.toBeInstanceOf(GitStationError)
  })

  it.each([
    ["another Kanflow project", ["another-project"]],
    ["several Kanflow projects", [PROJECT_ID, "another-project"]],
  ])("locate refuses a repository bound to %s", async (_label, bound) => {
    const station = createFakeGitStation()
    station.bind("app/other", bound)
    const source = sourceOn(station, { repoPath: "app/other" })
    let caught: unknown
    await source.locate().catch((e: unknown) => (caught = e))
    expect(source.describeError(caught)).toMatchObject({ kind: "not_bound", expected: true, message: expect.stringContaining("結び付けられていません") })
  })

  it("a repository bound only through another integration is not visible to this one (404)", async () => {
    const station = createFakeGitStation()
    station.bind("app/other", [PROJECT_ID], 8)
    const source = sourceOn(station, { repoPath: "app/other" })
    let caught: unknown
    await source.locate().catch((e: unknown) => (caught = e))
    expect(source.describeError(caught).kind).toBe("not_found")
  })

  it("refuses a binding of another integration id although the project is visible", async () => {
    const source = sourceOn(createFakeGitStation(), { stationIntegrationId: "70" })
    let caught: unknown
    await source.locate().catch((e: unknown) => (caught = e))
    expect(source.describeError(caught).kind).toBe("not_bound")
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
    // The state comes from the integration's development status (I1d): one listing for every repository.
    expect(feedCalls(station)).toEqual(["/events/cursor", "/dev-status", "/events", `/projects/${REPO_ID}/merge-requests/2`])
    expect(Object.fromEntries(changes.mergeRequests.map((m) => [m.ref, m.state]))).toEqual({ "1": "merged", "2": "opened" })
    expect(decodeStationCursor(changes.cursor)).toBe(station.head())
  })

  it("a re-read merged merge request is dated by GitStation's merge time (dev-status merged_at), its author unknown (kept)", async () => {
    const station = createFakeGitStation()
    station.mergeRequest("merge_request.opened", 1)
    const merged = station.mergeRequest("merge_request.merged", 1)
    station.mergeRequest("merge_request.updated", 1, { title: "Login form, later edit (PBI-1)" })
    station.prune()
    const changes = await sourceOn(station).readChanges(fresh(), NOW)
    expect(changes.mergeRequests).toEqual([expect.objectContaining({ ref: "1", state: "merged", author: null })])
    // The merge time is the merged event's, not the later update's.
    expect(Date.parse(changes.mergeRequests[0].mergedAt!)).toBeLessThan(Date.parse(changes.mergeRequests[0].updatedAt))
    expect(Date.parse(changes.mergeRequests[0].mergedAt!)).toBeGreaterThan(Date.parse(merged.occurred_at) - 120_000)
  })

  it("pages the development status (next_cursor) and takes each merge request once, whatever the number of its work items", async () => {
    const station = createFakeGitStation({ devStatusPageSize: 2 })
    for (let n = 1; n <= 5; n++) station.mergeRequest("merge_request.opened", n, { title: `MR ${n} (PBI-${n})` }, station.workItem(`PBI-${n}`))
    // MR 1 is linked to a second work item as well.
    station.mergeRequest("merge_request.updated", 1, { title: "MR 1 (PBI-1, PBI-9)" }, [...station.workItem("PBI-1"), ...station.workItem("PBI-9")])
    station.prune()
    const read = await readFeed(clientOn(station), fresh(), [REPO_ID])
    expect(feedCalls(station).filter((c) => c === "/dev-status")).toHaveLength(3)
    expect(read.snapshots.get(REPO_ID)!.map((m) => m.iid).sort()).toEqual([1, 2, 3, 4, 5])
    expect(station.requests.filter((r) => r.includes("/dev-status")).every((r) => r.includes("state=all"))).toBe(true)
  })

  it("a 410 while paging the development status starts the listing again from its first page (once)", async () => {
    const station = createFakeGitStation({ devStatusPageSize: 1 })
    station.mergeRequest("merge_request.opened", 1, {}, station.workItem("PBI-1"))
    station.mergeRequest("merge_request.opened", 2, { title: "B (PBI-2)" }, station.workItem("PBI-2"))
    let calls = 0
    const fetchImpl: typeof fetch = async (input, init) => {
      if (new URL(String(input)).pathname.endsWith("/dev-status") && ++calls === 2) return json(410, { error_code: "FG-INT-0007", reason: "visible_set_changed" })
      return station.fetchImpl(input, init)
    }
    const read = await readFeed(clientOn(station, fetchImpl), fresh(), [REPO_ID])
    expect(read.rereadFailures.size).toBe(0)
    expect(read.snapshots.get(REPO_ID)!.map((m) => m.iid).sort()).toEqual([1, 2])
    expect(logs.warn).toHaveBeenCalledWith("gitstation state re-read restarted", expect.objectContaining({ reason: "visible_set_changed" }))
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
    expect(feedCalls(station)).toEqual(["/events", "/events/cursor", "/dev-status", "/events"])
    expect(decodeStationCursor(changes.cursor)).toBe(station.head())
    expect(logs.warn).toHaveBeenCalledWith("gitstation feed restarted", expect.objectContaining({ reason }))
  })

  it("410 after the first page that cannot be recovered keeps the position the read STARTED from", async () => {
    const station = createFakeGitStation({ pageSize: 1 })
    const start = here(station)
    station.mergeRequest("merge_request.opened", 1)
    station.mergeRequest("merge_request.opened", 2)
    let eventCalls = 0
    const fetchImpl: typeof fetch = async (input, init) => {
      const path = new URL(String(input)).pathname
      if (path.endsWith("/events") && ++eventCalls === 2) return json(410, { error_code: "FG-INT-0007", reason: "retention" })
      if (path.endsWith("/events/cursor")) return new Response("{}", { status: 503, headers: { "retry-after": "999" } })
      return station.fetchImpl(input, init)
    }
    const read = await readFeed(clientOn(station, fetchImpl), start, [REPO_ID])
    expect(read.cursor).toBe(start)
    expect(read.events).toEqual([])
    expect(read.failures.map((f) => f.kind)).toEqual(["feed"])
  })

  it("a development status refused for good is a failure of every repository re-read; the 410 recovery still moves on (they are re-read later)", async () => {
    const station = createFakeGitStation()
    const api = station.bind("app/api")
    station.mergeRequest("merge_request.opened", 1)
    station.mergeRequest("merge_request.opened", 2, { project: "app/api" })
    const stale = here(station)
    station.failState("app/api")
    station.fail(`/integrations/${INTEGRATION}/events`, 410, { error_code: "FG-INT-0007", reason: "retention" })
    const read = await readFeed(clientOn(station), stale, [REPO_ID, api])
    expect(decodeStationCursor(read.cursor)).toBe(station.head())
    expect([...read.snapshots.keys()]).toEqual([])
    expect([...read.rereadFailures.keys()].sort()).toEqual([REPO_ID, api].sort())
    const routed = routeFeed(read, [repo("r1", REPO_ID), repo("r2", api)])
    expect(routed.changes.get("r1")!.failures.map((f) => f.kind)).toEqual(["mr"])
    expect(routed.changes.get("r2")!.failures.map((f) => f.kind)).toEqual(["mr"])
  })

  it("a PBI with more merge requests than the development status lists: that project is read through its own listing", async () => {
    const station = createFakeGitStation()
    const api = station.bind("app/api")
    for (let iid = 1; iid <= 3; iid++) station.mergeRequest("merge_request.opened", iid)
    station.mergeRequest("merge_request.opened", 4, { project: "app/api" })
    const real = clientOn(station)
    const client = { ...real, devStatusPage: async (cursor: string | null) => ({ ...(await real.devStatusPage(cursor)), truncatedItems: 1, truncatedProjects: [REPO_ID] }) }
    const read = await readFeed(client, fresh(), [REPO_ID, api])
    expect(feedCalls(station).filter((c) => c.endsWith("/merge-requests"))).toEqual([`/projects/${REPO_ID}/merge-requests`])
    expect(read.snapshots.get(REPO_ID)!.map((m) => m.iid).sort()).toEqual([1, 2, 3])
    expect(read.snapshots.get(api)!.map((m) => m.iid)).toEqual([4])
    expect(read.rereadFailures.size).toBe(0)
  })

  it("a project with no linked merge request gets an empty state (nothing of it is lost: an unlinked MR names no PBI)", async () => {
    const station = createFakeGitStation()
    const api = station.bind("app/api")
    station.mergeRequest("merge_request.opened", 1)
    const read = await readFeed(clientOn(station), fresh(), [REPO_ID, api])
    expect(read.snapshots.get(api)).toEqual([])
    expect(read.snapshots.get(REPO_ID)!.map((m) => m.iid)).toEqual([1])
  })

  it("a development status longer than the bound is a failure of the repositories (a cut-short state cannot be trusted)", async () => {
    const station = createFakeGitStation()
    let pages = 0
    const client = { ...clientOn(station), devStatusPage: async () => (pages++, { feedCursor: "c", mergeRequests: [], skipped: 0, truncatedItems: 0, truncatedProjects: [], nextCursor: `p${pages}` }) }
    const read = await readFeed(client, fresh(), [REPO_ID])
    expect(pages).toBe(MAX_DEV_STATUS_PAGES)
    expect((read.rereadFailures.get(REPO_ID) as InstanceType<typeof GitStationError>).kind).toBe("truncated")
    expect(logs.warn).toHaveBeenCalledWith("gitstation state re-read truncated", expect.objectContaining({ pages: MAX_DEV_STATUS_PAGES }))
  })

  it("re-reads only the marked repositories without restarting the feed", async () => {
    const station = createFakeGitStation()
    const api = station.bind("app/api")
    station.mergeRequest("merge_request.opened", 1, { project: "app/api" })
    const start = here(station)
    const read = await readFeed(clientOn(station), start, [REPO_ID, api], {}, [api])
    expect(feedCalls(station)).toEqual(["/dev-status", "/events"])
    expect([...read.snapshots.keys()]).toEqual([api])
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
    const read = await readFeed(clientOn(station), start, [REPO_ID])
    expect(read.events.map((e) => e.id)).toEqual(["evt_1"])
  })

  it("reads each merge request an event names once per read, whatever the number of its events", async () => {
    const station = createFakeGitStation()
    const start = here(station)
    station.mergeRequest("merge_request.opened", 1)
    station.mergeRequest("merge_request.approved", 1)
    station.mergeRequest("merge_request.updated", 1, { title: "Login form v2 (PBI-1)" })
    const changes = await sourceOn(station).readChanges(start, NOW)
    expect(feedCalls(station).filter((c) => c.includes("/merge-requests/"))).toEqual([`/projects/${REPO_ID}/merge-requests/1`])
    expect(changes.mergeRequests).toEqual([
      expect.objectContaining({ ref: "1", title: "Login form v2 (PBI-1)", state: "opened", url: `${STATION}/-/projects/${REPO_ID}/pull/1`, author: "Dev One", sourceBranch: "feature/PBI-1-login-form" }),
    ])
  })

  it("a project with many named merge requests is read through its listing instead of one read each", async () => {
    const station = createFakeGitStation()
    const start = here(station)
    for (let iid = 1; iid <= MAX_DETAILS_PER_PROJECT + 1; iid++) station.mergeRequest("merge_request.opened", iid)
    const changes = await sourceOn(station).readChanges(start, NOW)
    expect(changes.mergeRequests).toHaveLength(MAX_DETAILS_PER_PROJECT + 1)
    expect(feedCalls(station).filter((c) => c.includes("/merge-requests"))).toEqual([`/projects/${REPO_ID}/merge-requests`])
  })

  it("a merge request GitStation does not show (404) is the project's failure (its state is re-read), never a silent skip", async () => {
    const station = createFakeGitStation()
    const start = here(station)
    station.push("merge_request.closed", { merge_request_id: 199, iid: 99 })
    station.mergeRequest("merge_request.opened", 2)
    const changes = await sourceOn(station).readChanges(start, NOW)
    expect(decodeStationCursor(changes.cursor)).toBe(station.head())
    expect(changes.failures.map((f) => f.kind)).toEqual(["mr"])
    expect(sourceOn(station).describeError(changes.failures[0].error).kind).toBe("not_found")
  })

  it.each([
    ["a body Kanflow does not understand", 200, { iid: "x" }],
    ["a server error", 500, { error_code: "FG-SYS-0001" }],
  ])("%s on a named merge request holds the read a few times (a hiccup), then never again: it is the project's failure", async (_label, status, body) => {
    const station = createFakeGitStation()
    const start = here(station)
    station.mergeRequest("merge_request.opened", 1)
    station.fail(`/projects/${REPO_ID}/merge-requests/1`, status, body, {}, 2)
    const first = await readFeed(clientOn(station), start, [REPO_ID], {}, [], 0)
    expect(first.cursor).toBe(start)
    expect(first.failures.map((f) => f.kind)).toEqual(["feed"])
    const after = await readFeed(clientOn(station), start, [REPO_ID], {}, [], MAX_DEFECT_HOLDS)
    expect(decodeStationCursor(after.cursor)).toBe(station.head())
    expect([...after.rereadFailures.keys()]).toEqual([REPO_ID])
  })

  it("a pushed commit that is gone (force-pushed ref, 404) skips that ref only; the project's other pushes are read", async () => {
    const station = createFakeGitStation()
    const start = here(station)
    station.pushed(REPO, "refs/heads/feature/PBI-1-a", [{ subject: "a (PBI-1)" }])
    station.pushed(REPO, "refs/heads/feature/PBI-2-b", [{ subject: "b (PBI-2)" }])
    station.fail(`/projects/${REPO_ID}/repository/commits`, 404, {})
    const changes = await sourceOn(station).readChanges(start, NOW)
    expect(changes.failures).toEqual([])
    expect(changes.commits.map((c) => c.title)).toEqual(["b (PBI-2)"])
  })

  it("a merge request that fails the project does not drop that project's pushed commits", async () => {
    const station = createFakeGitStation()
    const start = here(station)
    station.mergeRequest("merge_request.opened", 1)
    station.pushed(REPO, "refs/heads/main", [{ subject: "c (PBI-1)" }])
    station.fail(`/projects/${REPO_ID}/merge-requests/1`, 404, {})
    const changes = await sourceOn(station).readChanges(start, NOW)
    expect(changes.failures.map((f) => f.kind)).toEqual(["mr"])
    expect(changes.commits.map((c) => c.title)).toEqual(["c (PBI-1)"])
  })

  it("a transient failure of the state re-read on a restart holds the read (the position stays empty), never a day-long back-off", async () => {
    const station = createFakeGitStation()
    station.mergeRequest("merge_request.opened", 1)
    station.fail(`/integrations/${INTEGRATION}/dev-status`, 503, {}, { "retry-after": "999" })
    const changes = await sourceOn(station).readChanges(fresh(), NOW)
    expect(changes.cursor).toBe(fresh())
    expect(changes.mergeRequests).toEqual([])
    expect(sourceOn(station).describeError(changes.failures[0].error).kind).toBe("unavailable")
  })

  it("stops taking feed pages once the follow-up reads of one poll are enough; the rest is read next poll", async () => {
    const station = createFakeGitStation({ pageSize: 50 })
    const start = here(station)
    for (let iid = 1; iid <= MAX_FOLLOW_UPS_PER_READ + 50; iid++) station.mergeRequest("merge_request.opened", iid)
    const source = sourceOn(station)
    const first = await source.readChanges(start, NOW)
    expect(first.failures).toEqual([])
    expect(first.mergeRequests).toHaveLength(MAX_FOLLOW_UPS_PER_READ)
    expect(decodeStationCursor(first.cursor)).not.toBe(station.head())
    const second = await source.readChanges(first.cursor, NOW)
    expect(second.mergeRequests).toHaveLength(50)
    expect(decodeStationCursor(second.cursor)).toBe(station.head())
  })

  it("never takes a listed merge request of another project (its link would point there)", async () => {
    const station = createFakeGitStation()
    const fetchImpl: typeof fetch = async (input, init) => {
      if (new URL(String(input)).pathname.endsWith(`/projects/${REPO_ID}/merge-requests`)) {
        const mr = { project_id: 99, iid: 1, title: "x", state: "open", source_branch: "b", created_at: "2026-10-01T00:00:00Z", updated_at: "2026-10-01T00:00:00Z" }
        return json(200, { merge_requests: [mr], next_before: null })
      }
      return station.fetchImpl(input, init)
    }
    expect(await clientOn(station, fetchImpl).listMergeRequests(REPO_ID, 1)).toEqual({ items: [], truncated: false, skipped: 1 })
  })

  it("a transient failure reading a named merge request holds the read at its start (re-read idempotently)", async () => {
    const station = createFakeGitStation()
    const start = here(station)
    station.mergeRequest("merge_request.opened", 1)
    station.fail(`/projects/${REPO_ID}/merge-requests/1`, 503, {}, { "retry-after": "999" })
    const changes = await sourceOn(station).readChanges(start, NOW)
    expect(changes.cursor).toBe(start)
    expect(changes.mergeRequests).toEqual([])
    expect(changes.failures.map((f) => f.kind)).toEqual(["feed"])
  })

  it("a refused (403) merge request read is that repository's failure, re-read later; the cursor moves on", async () => {
    const station = createFakeGitStation()
    const start = here(station)
    station.mergeRequest("merge_request.opened", 1)
    station.fail(`/projects/${REPO_ID}/merge-requests/1`, 403, { error_code: "FG-AUTHZ-0001" })
    const changes = await sourceOn(station).readChanges(start, NOW)
    expect(decodeStationCursor(changes.cursor)).toBe(station.head())
    expect(changes.failures.map((f) => f.kind)).toEqual(["mr"])
    expect(changes.mergeRequests).toEqual([])
  })

  it("reads pushed commits' subjects from the history of the new commit (each sha once)", async () => {
    const station = createFakeGitStation()
    const start = here(station)
    const e = station.pushed(REPO, "refs/heads/feature/PBI-2-lock", [{ subject: "fix: lock (PBI-2)" }, { subject: "wip" }], station.workItem("PBI-2"))
    const changes = await sourceOn(station).readChanges(start, NOW)
    const [newest, older] = (e.data.refs as { commits: string[] }[])[0].commits
    expect(changes.commits).toEqual([
      { sha: newest, title: "fix: lock (PBI-2)", message: "fix: lock (PBI-2)", url: `${STATION}/-/projects/${REPO_ID}/commit/${newest}`, author: "Dev One", committedAt: expect.any(String) },
      expect.objectContaining({ sha: older, title: "wip" }),
    ])
    expect(feedCalls(station).filter((c) => c.endsWith("/repository/commits"))).toHaveLength(1)
  })

  it("a deleted branch (new = zeros) or a push without listed commits reads no history", async () => {
    const station = createFakeGitStation()
    const start = here(station)
    station.push("repository.pushed", { repository_id: 3, refs: [{ ref: "refs/heads/x", old: oid(1), new: "0".repeat(40), kind: "deleted", commits: [], commits_truncated: false }] }, [])
    // The golden example's push lists no commits at all.
    station.push("repository.pushed", { repository_id: 3, refs: [{ ref: "refs/heads/main", kind: "fast_forward" }], total_refs: 1, refs_truncated: false }, [])
    const changes = await sourceOn(station).readChanges(start, NOW)
    expect(changes.commits).toEqual([])
    expect(feedCalls(station).filter((c) => c.endsWith("/repository/commits"))).toEqual([])
  })

  it("a push GitStation cut short (commits_truncated) is a logged gap", async () => {
    const station = createFakeGitStation()
    const start = here(station)
    station.pushed(REPO, "refs/heads/main", [{ subject: "a (PBI-1)" }], [], { commits_truncated: true })
    const changes = await sourceOn(station).readChanges(start, NOW)
    expect(changes.commits).toHaveLength(1)
    expect(logs.warn).toHaveBeenCalledWith("gitstation pushed commits not all read", expect.objectContaining({ truncatedPushes: 1 }))
  })

  it("skips event types Kanflow does not use (unknown ones included) without failing", async () => {
    const station = createFakeGitStation()
    const start = here(station)
    station.push("deployment.succeeded", { repository_id: 3 })
    station.push("work_item.linked", { merge_request_id: 101, iid: 1 })
    station.mergeRequest("merge_request.opened", 2)
    const changes = await sourceOn(station).readChanges(start, NOW)
    expect(changes.failures).toEqual([])
    expect(changes.mergeRequests.map((m) => m.ref)).toEqual(["2"])
  })

  it("skips events of an unexpected shape, logged once with the count", async () => {
    const station = createFakeGitStation()
    station.mergeRequest("merge_request.opened", 3)
    const good = { ...station.events[0], id: "evt_y" }
    station.rawEvents({ events: [{ id: "evt_x", type: "merge_request.opened" }, "junk", good], next_cursor: "aead.next", has_more: false })
    const changes = await sourceOn(station).readChanges(here(station), NOW)
    expect(changes.mergeRequests.map((m) => m.ref)).toEqual(["3"])
    expect(logs.warn).toHaveBeenCalledWith("gitstation events of an unexpected shape skipped", expect.objectContaining({ count: 2, samples: [{ id: "evt_x", type: "merge_request.opened" }, { id: null, type: null }] }))
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

  it("takes only the repository's own GitStation project from a feed spanning several projects", async () => {
    const station = createFakeGitStation()
    station.bind("app/api", ["another-project"])
    const start = here(station)
    station.mergeRequest("merge_request.opened", 1, { project: "app/api" }, station.workItem("PBI-1", "another-project"))
    station.mergeRequest("merge_request.opened", 2)
    const changes = await sourceOn(station).readChanges(start, NOW)
    expect(changes.mergeRequests.map((m) => m.ref)).toEqual(["2"])
    // The other project's merge request was not even read.
    expect(feedCalls(station).filter((c) => c.includes("/merge-requests/"))).toEqual([`/projects/${REPO_ID}/merge-requests/2`])
  })

  it("routes by project id, not by work items: a merge request whose PBI link ended still gets its state", async () => {
    const station = createFakeGitStation()
    const start = here(station)
    station.mergeRequest("merge_request.closed", 1, {}, [])
    const changes = await sourceOn(station).readChanges(start, NOW)
    expect(changes.mergeRequests).toEqual([expect.objectContaining({ ref: "1", state: "closed" })])
  })

  it("warns once per read, with samples, about events naming one of these projects but matching no repository", async () => {
    const station = createFakeGitStation()
    const start = here(station)
    const unregistered = station.bind("app/unregistered")
    station.mergeRequest("merge_request.opened", 7, { project: "app/unregistered" })
    const read = await readFeed(clientOn(station), start, [REPO_ID])
    routeFeed(read, [repo("r1", REPO_ID), repo("r2", 99)], { feedId: "f1" })
    const calls = logs.warn.mock.calls.filter((c) => c[0] === "gitstation events match no repository")
    expect(calls).toEqual([["gitstation events match no repository", { feedId: "f1", count: 1, samples: [{ id: "evt_1", stationProjectId: unregistered }] }]])
  })

  it("logs an unusable event once per read with its id and type, however many repositories it reaches", async () => {
    const station = createFakeGitStation()
    const start = here(station)
    station.push("merge_request.updated", { merge_request_id: 1, fields: ["title"] })
    const read = await readFeed(clientOn(station), start, [REPO_ID])
    routeFeed(read, [repo("r1", REPO_ID), repo("r2", REPO_ID, "p2")])
    const calls = logs.warn.mock.calls.filter((c) => c[0] === "gitstation events not usable")
    expect(calls).toEqual([["gitstation events not usable", { count: 1, samples: [{ id: "evt_1", type: "merge_request.updated" }] }]])
  })

  it("counts and logs re-read items that do not parse", async () => {
    const client = clientOn(createFakeGitStation())
    const ok = { project_id: REPO_ID, iid: 4, title: "ok", state: "open", source_branch: "b", created_at: "2026-10-01T00:00:00Z", updated_at: "2026-10-01T00:00:00Z" }
    const read = {
      start: fresh(),
      events: [],
      snapshots: new Map([[REPO_ID, [{ ...ok, iid: 3, state: "weird" }, ok]]]),
      rereadFailures: new Map(),
      details: new Map(),
      commits: new Map(),
      links: client.webUrl,
      cursor: fresh(),
      failures: [],
      restarted: null,
    }
    const routed = routeFeed(read, [repo("r1", REPO_ID)])
    expect(routed.changes.get("r1")!.mergeRequests.map((m) => m.ref)).toEqual(["4"])
    expect(logs.warn).toHaveBeenCalledWith("gitstation state items not usable", { count: 1 })
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

  it("lists the PBI branches (GitStation's refs have no search) with their permalinks", async () => {
    const station = createFakeGitStation()
    station.setBranches(REPO, ["main", "feature/PBI-3-form", "fix/pbi-4"])
    const listing = await sourceOn(station).listBranches(NOW)
    expect(listing).toEqual({
      complete: true,
      items: [
        { name: "feature/PBI-3-form", url: `${STATION}/-/projects/${REPO_ID}/tree/feature/PBI-3-form`, headTitle: null, headAuthor: null, headCommittedAt: null },
        expect.objectContaining({ name: "fix/pbi-4" }),
      ],
    })
  })

  it("lists tags without a date (GitStation has no release data): the stored date is kept", async () => {
    const station = createFakeGitStation()
    station.setTags(REPO, ["v1.0.0"])
    const listing = await sourceOn(station).listReleaseTags(`${STATION}/${REPO}`, NOW)
    expect(listing).toEqual({ complete: true, drafts: [{ tag: "v1.0.0", name: null, description: null, url: `${STATION}/-/projects/${REPO_ID}/tree/v1.0.0`, releasedAt: null }] })
  })
})

describe("GitStation messages", () => {
  it("truncated and host_not_allowed have their own messages, shown in the viewer's language (ja / en / id)", async () => {
    const { syncMessageKey } = await import("@/lib/git/sync-messages")
    const { ja, en, id } = await import("@/lib/i18n/git")
    const source = sourceOn(createFakeGitStation())
    for (const kind of ["truncated", "host_not_allowed"] as const) {
      const info = source.describeError(new GitStationError(kind, "x"))
      expect(info.expected).toBe(false)
      const key = syncMessageKey(info.message)
      expect(key).not.toBeNull()
      for (const t of [ja, en, id]) expect(t[key!].length).toBeGreaterThan(10)
      expect(ja[key!]).toBe(info.message)
    }
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

  it("the MR's creation time is its open time and survives the later merge (plan 12 E1)", async () => {
    const station = createFakeGitStation()
    const start = here(station)
    station.mergeRequest("merge_request.opened", 1)
    station.mergeRequest("merge_request.merged", 1)
    const changes = await sourceOn(station).readChanges(start, NOW)
    const listed = await clientOn(station).getMergeRequest(REPO_ID, 1)
    expect(changes.mergeRequests).toEqual([expect.objectContaining({ ref: "1", state: "merged", openedAt: listed.created_at })])
  })

  it("close → reopen → merge are read in order and end merged, dated by the merged event", async () => {
    const station = createFakeGitStation()
    const start = here(station)
    station.mergeRequest("merge_request.opened", 1)
    const source = sourceOn(station)
    const first = await source.readChanges(start, NOW)
    station.mergeRequest("merge_request.closed", 1)
    station.mergeRequest("merge_request.reopened", 1)
    const merged = station.mergeRequest("merge_request.merged", 1)
    const read = await readFeed(clientOn(station), first.cursor, [REPO_ID])
    expect(read.events.map((e) => e.type)).toEqual(["merge_request.closed", "merge_request.reopened", "merge_request.merged"])
    const changes = await source.readChanges(first.cursor, NOW)
    expect(changes.mergeRequests).toEqual([expect.objectContaining({ ref: "1", state: "merged", mergedAt: merged.occurred_at })])
  })

  it("a merge seen before its merged event (a backlog) has no merge time yet: the stored one, or the next read's, is used", async () => {
    const station = createFakeGitStation({ pageSize: 1 })
    const start = here(station)
    station.mergeRequest("merge_request.opened", 1)
    for (let i = 0; i < 10; i++) station.push("deployment.succeeded", {})
    station.mergeRequest("merge_request.merged", 1)
    const changes = await sourceOn(station).readChanges(start, NOW)
    expect(changes.mergeRequests).toEqual([expect.objectContaining({ ref: "1", state: "merged", mergedAt: null })])
  })

  it("a merge that deletes the source branch keeps the merge request link (branch deletion carries no state change)", async () => {
    const station = createFakeGitStation()
    const start = here(station)
    station.mergeRequest("merge_request.opened", 1)
    station.mergeRequest("merge_request.merged", 1)
    station.push("merge_request.source_branch_deleted", { merge_request_id: 101, iid: 1 })
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
    const read = await readFeed(clientOn(station), first.cursor, [REPO_ID])
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
