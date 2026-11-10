import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { ACCEPTANCE_COMMIT_MISSING_MESSAGE, ACCEPTANCE_REPORT_REFUSED_MESSAGE, STATION_NOT_BOUND_MESSAGE, STATION_UNAVAILABLE_MESSAGE } from "@/lib/git/sync-messages"
import { createFakeGitStation, INTEGRATION, oid, REPO, TOKEN, type FakeGitStation } from "./fake-gitstation"

/** What the services log: an operator learns of a failure nobody is shown from these lines only. */
const logSpy = vi.hoisted(() => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }))
vi.mock("@/lib/logger", async (orig) => {
  const logger = { ...logSpy, child: () => logger, isLevelEnabled: () => true, flush: async () => undefined }
  return { ...(await orig<typeof import("@/lib/logger")>()), logger }
})

/**
 * This file's own GitStation address. The feed sync reads every repository of a feed (address +
 * integration + token) in the database, so sharing the address of gitstation-feed-sync.db.test.ts
 * would put these repositories into the feed that file asserts on while both run.
 */
const STATION_HOST = "gitstation-acceptance.example"
const STATION = `https://${STATION_HOST}`

/** A second repository of the same Kanflow project (bound in GitStation only by the tests that use it). */
const REPO2 = "app/tools"

/**
 * The check `kanflow/acceptance` against a REAL PostgreSQL and a fake GitStation. Skipped unless
 * KANFLOW_DB_TESTS=1 and DATABASE_* point at a migrated, disposable test database (synthetic
 * rows only, removed afterwards), e.g. a database of ops/test-env/compose.yml:
 *
 *   KANFLOW_DB_TESTS=1 npx vitest run src/services/git/__tests__/acceptance-check.db.test.ts
 *
 * What it pins (docs/integration/gitstation-acceptance-check.md): one check run per open merge
 * request linked to PBIs, on its current head commit (read before every write), written again
 * only when the commit or the judgement changed; nothing at all for a merge request linked to a
 * confidential PBI (D-5), also when it becomes confidential while the tick runs; a failure stored
 * on the merge request and tried again after a growing wait, a repository's failure holding all of
 * its merge requests but no other repository; off unless the project switched it on.
 */
const enabled = process.env.KANFLOW_DB_TESTS === "1"

describe.skipIf(!enabled)("acceptance check on a real database (KANFLOW_DB_TESTS=1)", () => {
  const tag = `a1test-${Date.now().toString(36)}`
  const ids = {
    project: `${tag}-p`,
    other: `${tag}-q`,
    repo: `${tag}-r`,
    repo2: `${tag}-r2`,
    user: `${tag}-u`,
    sprint: `${tag}-s`,
    ready: `${tag}-b11`,
    bare: `${tag}-b12`,
    secret: `${tag}-b13`,
    foreign: `${tag}-b21`,
  }
  const pbiIds = [ids.ready, ids.bare, ids.secret, ids.foreign]
  /** Text of the confidential PBI: must never leave Kanflow. */
  const SECRET_TEXT = "synthetic-confidential-initiative"
  const actor = { userId: ids.user, userName: "synthetic", systemRole: "admin" }
  const NOTHING = { reported: 0, unchanged: 0, failed: 0, waiting: 0 }
  const T0 = new Date("2026-11-10T00:00:00.000Z")
  const at = (minutes: number) => new Date(T0.getTime() + minutes * 60_000)

  let prisma: typeof import("@/lib/prisma").prisma
  let acceptance: typeof import("../acceptance-check.service")
  let service: typeof import("../git.service")
  let createGitStationClient: typeof import("@/lib/git/gitstation-client").createGitStationClient
  let station: FakeGitStation
  let fetchImpl: typeof fetch
  const clients = () => ({ gitstation: (o: { apiBase: string; token: string; integrationId: string }) => createGitStationClient({ ...o, fetchImpl, sleep: async () => undefined }) })
  const tick = (minutes: number) => acceptance.reportAcceptanceChecks(clients(), at(minutes))

  const stationProject = () => station.projectId(REPO)
  /** Reads of one merge request (its head commit). */
  const mrReads = () => station.requests.filter((r) => /\/merge-requests\/\d+$/.test(r))
  const quiet = () => {
    station.requests.length = 0
  }
  const rowOf = (iid: number) => prisma.gitAcceptanceReport.findUnique({ where: { repositoryId_mrRef: { repositoryId: ids.repo, mrRef: String(iid) } } })
  const rows = () => prisma.gitAcceptanceReport.findMany({ where: { repositoryId: ids.repo }, orderBy: { mrRef: "asc" } })
  const checkOn = (sha: string) => station.checks.filter((c) => c.sha === sha)
  const settingsError = async () => (await service.getGitSettings(ids.project)).acceptanceCheckError
  const REFUSED = { error_code: "FG-AUTH-0003", user_message: "check namespace", request_id: "r" }
  const COMMIT_MISSING = { error_code: "FG-REPO-0023", user_message: "commit", request_id: "r" }

  /** Ready for acceptance: a task in an open sprint and one criterion with its evidence decided. */
  async function ready(pbiId: string) {
    await prisma.sprintBacklogItem.create({ data: { sprintId: ids.sprint, pbItemId: pbiId, taskName: "synthetic task" } })
    await prisma.acceptanceCriterion.create({ data: { pbiId, seq: 1, text: "synthetic criterion", evidenceKind: "test" } })
  }
  /** Back to what `ready` started from: no task, no criterion. */
  async function unready(pbiId: string) {
    await prisma.acceptanceCriterion.deleteMany({ where: { pbiId } })
    await prisma.sprintBacklogItem.deleteMany({ where: { pbItemId: pbiId } })
  }
  /** The link the sync stores for a merge request and a PBI. */
  const link = (iid: number | string, pbiId: string, occurredAt = T0, state = "opened", repositoryId = ids.repo) =>
    prisma.gitLink.create({
      data: { projectId: ids.project, repositoryId, backlogItemId: pbiId, kind: "mr", ref: String(iid), title: `synthetic MR ${iid}`, url: `${STATION}/${REPO}/-/merge_requests/${iid}`, state, occurredAt },
    })
  /** A merge request open in GitStation (head commit `oid(iid)`) and linked to a PBI in Kanflow. */
  async function open(iid: number, pbiId: string) {
    station.mergeRequest("merge_request.opened", iid)
    await link(iid, pbiId)
  }
  /** The same in the second repository. */
  async function openInSecond(iid: number, pbiId: string) {
    station.mergeRequest("merge_request.opened", iid, { project: REPO2 })
    await link(iid, pbiId, T0, "opened", ids.repo2)
  }
  /** Something that happens while a tick runs: `change` runs once, right before the first request to a matching path reaches GitStation. */
  function beforeRequest(path: RegExp, change: () => Promise<unknown>) {
    const inner = fetchImpl
    let done = false
    fetchImpl = async (input, init) => {
      if (!done && path.test(new URL(String(input)).pathname)) {
        done = true
        await change()
      }
      return inner(input, init)
    }
  }

  beforeAll(async () => {
    process.env.INTEGRATION_SECRET_KEY ||= "synthetic-k3-test-key"
    process.env.GITSTATION_ALLOWED_HOSTS = STATION_HOST
    prisma = (await import("@/lib/prisma")).prisma
    acceptance = await import("../acceptance-check.service")
    service = await import("../git.service")
    createGitStationClient = (await import("@/lib/git/gitstation-client")).createGitStationClient
    const { seal } = await import("@/lib/secret-box")
    await prisma.user.create({ data: { id: ids.user, name: tag, email: `${tag}@example.test`, password: "synthetic", role: "admin" } })
    await prisma.project.create({ data: { id: ids.project, name: ids.project } })
    await prisma.project.create({ data: { id: ids.other, name: ids.other } })
    await prisma.gitIntegration.create({
      data: { projectId: ids.project, enabled: true, provider: "gitstation", stationIntegrationId: INTEGRATION, tokenCipher: seal(TOKEN), stationAcceptanceCheck: true },
    })
    await prisma.productBacklogItem.createMany({
      data: [
        { id: ids.ready, projectId: ids.project, displayId: 11, initiative: "synthetic ready" },
        { id: ids.bare, projectId: ids.project, displayId: 12, initiative: "synthetic bare" },
        { id: ids.secret, projectId: ids.project, displayId: 13, initiative: SECRET_TEXT },
        { id: ids.foreign, projectId: ids.other, displayId: 21, initiative: "synthetic foreign" },
      ],
    })
    await prisma.gitRepository.create({ data: { id: ids.repo, projectId: ids.project, name: REPO, webUrl: `${STATION}/${REPO}`, apiBase: STATION, repoPath: REPO, sortOrder: 0 } })
    await prisma.gitRepository.create({ data: { id: ids.repo2, projectId: ids.project, name: REPO2, webUrl: `${STATION}/${REPO2}`, apiBase: STATION, repoPath: REPO2, sortOrder: 1 } })
    await prisma.sprint.create({ data: { id: ids.sprint, projectId: ids.project, sprintName: "synthetic sprint", startDate: T0, endDate: at(14 * 24 * 60), status: "active" } })
  })

  afterAll(async () => {
    if (!prisma) return
    const projects = [ids.project, ids.other]
    await prisma.gitLink.deleteMany({ where: { projectId: { in: projects } } })
    // The report rows go with their repository.
    await prisma.gitRepository.deleteMany({ where: { projectId: { in: projects } } })
    await prisma.gitIntegration.deleteMany({ where: { projectId: { in: projects } } })
    // A feed sync of another test file may have opened a feed for this address.
    await prisma.gitStationFeed.deleteMany({ where: { apiBase: STATION } })
    await prisma.activityLog.deleteMany({ where: { projectId: { in: projects } } }).catch(() => undefined)
    await prisma.acceptanceCriterion.deleteMany({ where: { pbiId: { in: pbiIds } } })
    await prisma.sprintBacklogItem.deleteMany({ where: { pbItemId: { in: pbiIds } } })
    await prisma.sprint.deleteMany({ where: { id: ids.sprint } })
    await prisma.productBacklogItem.deleteMany({ where: { id: { in: pbiIds } } })
    await prisma.project.deleteMany({ where: { id: { in: projects } } })
    await prisma.user.deleteMany({ where: { id: ids.user } })
  })

  beforeEach(async () => {
    station = createFakeGitStation({ origin: STATION })
    fetchImpl = station.fetchImpl
    station.bind(REPO, [ids.project])
    for (const spy of Object.values(logSpy)) spy.mockClear()
    await prisma.gitAcceptanceReport.deleteMany({ where: { repositoryId: { in: [ids.repo, ids.repo2] } } })
    await prisma.gitLink.deleteMany({ where: { projectId: ids.project } })
    await prisma.acceptanceCriterion.deleteMany({ where: { pbiId: { in: pbiIds } } })
    await prisma.sprintBacklogItem.deleteMany({ where: { pbItemId: { in: pbiIds } } })
    await prisma.activityLog.deleteMany({ where: { projectId: ids.project } })
    await prisma.productBacklogItem.updateMany({ where: { id: { in: pbiIds } }, data: { confidential: false, deletedAt: null } })
    await prisma.gitIntegration.update({ where: { projectId: ids.project }, data: { enabled: true, provider: "gitstation", stationAcceptanceCheck: true } })
    await ready(ids.ready)
    await ready(ids.secret)
    await prisma.productBacklogItem.update({ where: { id: ids.secret }, data: { confidential: true } })
  })

  it("writes one check run per open merge request on its head commit: success when ready, action_required when not — and nothing more while nothing changes", async () => {
    await open(1, ids.ready)
    await open(2, ids.bare)
    expect(await tick(0)).toEqual({ ...NOTHING, reported: 2 })

    const [good] = checkOn(oid(1))
    const [bad] = checkOn(oid(2))
    expect(station.checks).toHaveLength(2)
    expect(good).toMatchObject({ projectId: stationProject(), status: 201 })
    expect(good.body).toEqual({ name: "kanflow/acceptance", status: "completed", conclusion: "success", summary: expect.stringContaining("PBI-11") })
    expect(bad.body).toEqual({ name: "kanflow/acceptance", status: "completed", conclusion: "action_required", summary: expect.stringContaining("PBI-12") })
    // Keys only: no title, no text of a PBI.
    expect(JSON.stringify(station.checks)).not.toContain("synthetic")

    const row = await rowOf(1)
    expect(row).toMatchObject({ headSha: oid(1), conclusion: "success", reportedAt: at(0), mrSeenAt: T0, headCheckedAt: at(0), lastError: null, lastErrorAt: null, retryAt: null })
    expect(row?.digest).toBe(acceptance.verdictDigest({ conclusion: "success", summary: String(good.body.summary) }))
    expect(await rowOf(2)).toMatchObject({ headSha: oid(2), conclusion: "action_required", reportedAt: at(0) })

    // The next tick: the same links, the same judgement — GitStation is not asked anything.
    quiet()
    expect(await tick(3)).toEqual({ ...NOTHING, unchanged: 2 })
    expect(station.requests).toEqual([])
    expect(station.checks).toHaveLength(2)
  })

  it("a changed judgement is written again on the head commit as it is now: the merge request is read before every write", async () => {
    await open(1, ids.ready)
    await open(2, ids.bare)
    await tick(0)
    await ready(ids.bare)
    quiet()

    expect(await tick(3)).toEqual({ ...NOTHING, reported: 1, unchanged: 1 })
    expect(mrReads()).toEqual([`/api/v1/projects/${stationProject()}/merge-requests/2`])
    const written = checkOn(oid(2))
    // The same project + commit + name: GitStation updates the run (200).
    expect(written.map((c) => [c.status, c.body.conclusion])).toEqual([
      [201, "action_required"],
      [200, "success"],
    ])
    expect(await rowOf(2)).toMatchObject({ conclusion: "success", reportedAt: at(3), headCheckedAt: at(3) })
  })

  it("a changed judgement goes to the commit pushed meanwhile, not to the one remembered from the last report", async () => {
    await open(2, ids.bare)
    await tick(0)
    // A push the links do not show yet, and the PBI became ready.
    station.moveHead(2, oid(702))
    await ready(ids.bare)

    expect(await tick(3)).toEqual({ ...NOTHING, reported: 1 })
    expect(checkOn(oid(2)).map((c) => c.body.conclusion)).toEqual(["action_required"])
    expect(checkOn(oid(702)).map((c) => [c.status, c.body.conclusion])).toEqual([[201, "success"]])
    expect(await rowOf(2)).toMatchObject({ headSha: oid(702), conclusion: "success", reportedAt: at(3) })
  })

  it("a push moves the check to the new head commit: at once when the link changed, after HEAD_RECHECK_MS otherwise", async () => {
    await open(1, ids.ready)
    await tick(0)

    // The sync saw the merge request change (its link's occurredAt moved): the head is read on the next tick.
    station.moveHead(1, oid(701))
    await prisma.gitLink.updateMany({ where: { repositoryId: ids.repo, ref: "1" }, data: { occurredAt: at(1) } })
    quiet()
    expect(await tick(3)).toEqual({ ...NOTHING, reported: 1 })
    expect(mrReads()).toHaveLength(1)
    expect(checkOn(oid(701)).map((c) => [c.status, c.body.conclusion])).toEqual([[201, "success"]])
    expect(await rowOf(1)).toMatchObject({ headSha: oid(701), mrSeenAt: at(1), headCheckedAt: at(3), reportedAt: at(3) })

    // A push the links do not show: nothing until the head is due to be read again.
    station.moveHead(1, oid(702))
    quiet()
    expect(await tick(10)).toEqual({ ...NOTHING, unchanged: 1 })
    expect(station.requests).toEqual([])
    expect(await tick(34)).toEqual({ ...NOTHING, reported: 1 })
    expect(checkOn(oid(702))).toHaveLength(1)
    expect(await rowOf(1)).toMatchObject({ headSha: oid(702), headCheckedAt: at(34), reportedAt: at(34) })

    // Due again, and the head did not move: read, not written.
    quiet()
    expect(await tick(65)).toEqual({ ...NOTHING, unchanged: 1 })
    expect(mrReads()).toHaveLength(1)
    expect(station.checks).toHaveLength(3)
    expect(await rowOf(1)).toMatchObject({ headSha: oid(702), headCheckedAt: at(65), reportedAt: at(34) })
  })

  it("D-5: a merge request linked to a confidential PBI gets no check run, no request and no row — also beside other PBIs, also once the PBI is deleted", async () => {
    await open(1, ids.ready)
    await open(2, ids.secret)
    await open(3, ids.ready)
    await link(3, ids.secret)

    expect(await tick(0)).toEqual({ ...NOTHING, reported: 1 })
    expect(station.checks.map((c) => c.sha)).toEqual([oid(1)])
    expect(mrReads()).toEqual([`/api/v1/projects/${stationProject()}/merge-requests/1`])
    expect((await rows()).map((r) => r.mrRef)).toEqual(["1"])
    const sent = JSON.stringify(station.checks)
    expect(sent).not.toContain("PBI-13")
    expect(sent).not.toContain(SECRET_TEXT)

    await prisma.productBacklogItem.update({ where: { id: ids.secret }, data: { deletedAt: at(1) } })
    quiet()
    expect(await tick(3)).toEqual({ ...NOTHING, unchanged: 1 })
    expect(station.requests).toEqual([])
    expect((await rows()).map((r) => r.mrRef)).toEqual(["1"])
  })

  it("D-5: confidentiality is read at use time — a PBI made confidential after a report is never reported on again, and the earlier report stays", async () => {
    await open(1, ids.bare)
    expect(await tick(0)).toEqual({ ...NOTHING, reported: 1 })
    const before = await rowOf(1)

    // The judgement would change (the PBI is ready now), and the head would be due — neither is sent.
    await ready(ids.bare)
    await prisma.productBacklogItem.update({ where: { id: ids.bare }, data: { confidential: true } })
    quiet()
    expect(await tick(3)).toEqual(NOTHING)
    expect(await tick(43)).toEqual(NOTHING)
    expect(station.requests).toEqual([])
    expect(station.checks).toHaveLength(1)
    expect(await rowOf(1)).toEqual(before)
  })

  it("D-5: a PBI made confidential while the tick runs (after the judgement, before the send) is not reported on", async () => {
    await open(1, ids.bare)
    beforeRequest(/\/merge-requests\/1$/, () => prisma.productBacklogItem.update({ where: { id: ids.bare }, data: { confidential: true } }))

    expect(await tick(0)).toEqual({ ...NOTHING, waiting: 1 })
    expect(mrReads()).toHaveLength(1)
    expect(station.checks).toEqual([])
    expect(await rows()).toEqual([])

    quiet()
    expect(await tick(3)).toEqual(NOTHING)
    expect(station.requests).toEqual([])
  })

  it("D-5: a merge request linked to a confidential PBI while the tick runs is not reported on either", async () => {
    await open(1, ids.ready)
    beforeRequest(/\/merge-requests\/1$/, () => link(1, ids.secret))

    expect(await tick(0)).toEqual({ ...NOTHING, waiting: 1 })
    expect(station.checks).toEqual([])
    expect(await rows()).toEqual([])
  })

  it("D-5: a failure stored for a merge request is cleared once nothing is said about it any more", async () => {
    await open(1, ids.ready)
    station.fail(`/projects/${stationProject()}/commits/`, 404, COMMIT_MISSING)
    expect(await tick(0)).toEqual({ ...NOTHING, failed: 1 })
    expect(await settingsError()).toEqual({ message: ACCEPTANCE_COMMIT_MISSING_MESSAGE, at: at(0).toISOString() })

    await link(1, ids.secret)
    quiet()
    expect(await tick(3)).toEqual(NOTHING)
    expect(station.requests).toEqual([])
    expect(await rowOf(1)).toMatchObject({ lastError: null, lastErrorAt: null, retryAt: null, failures: 0, reportedAt: null })
    expect(await settingsError()).toBeNull()
  })

  it("D-5: a merge request linked to a PBI of another project (not readable here) is not reported either", async () => {
    await open(1, ids.foreign)
    await open(2, ids.ready)
    await link(2, ids.foreign)

    expect(await tick(0)).toEqual(NOTHING)
    expect(station.requests).toEqual([])
    expect(await rows()).toEqual([])
  })

  it("deleted PBIs are left out of the judgement; with every linked PBI deleted the check asks to look at the links", async () => {
    await open(1, ids.ready)
    await link(1, ids.bare)
    await open(2, ids.bare)
    await prisma.productBacklogItem.update({ where: { id: ids.bare }, data: { deletedAt: T0 } })

    expect(await tick(0)).toEqual({ ...NOTHING, reported: 2 })
    const [one] = checkOn(oid(1))
    const [two] = checkOn(oid(2))
    expect(one.body.conclusion).toBe("success")
    expect(one.body.summary).toContain("PBI-11")
    expect(one.body.summary).not.toContain("PBI-12")
    expect(two.body.conclusion).toBe("action_required")
    expect(two.body.summary).toContain("すべて削除")
  })

  it("a merge request GitStation no longer has open gets no check; that is remembered, not asked again every tick", async () => {
    await open(1, ids.ready)
    // Closed in GitStation; the feed has not told Kanflow yet (the link still says opened).
    station.mergeRequest("merge_request.closed", 1)

    expect(await tick(0)).toEqual({ ...NOTHING, unchanged: 1 })
    expect(station.checks).toEqual([])
    expect(await rowOf(1)).toMatchObject({ headSha: null, conclusion: null, digest: null, reportedAt: null, headCheckedAt: at(0), lastError: null })

    quiet()
    expect(await tick(3)).toEqual({ ...NOTHING, unchanged: 1 })
    expect(station.requests).toEqual([])
  })

  it("a refused report (403: namespace not granted) is stored, shown in the Git settings, and makes the whole repository wait PERMANENT_RETRY_MS — one refusal, not one per merge request and tick", async () => {
    await open(1, ids.ready)
    await open(2, ids.ready)
    await open(3, ids.ready)
    station.fail(`/projects/${stationProject()}/commits/`, 403, REFUSED)

    expect(await tick(0)).toEqual({ ...NOTHING, failed: 1, waiting: 2 })
    expect(station.checks).toEqual([])
    const stored = await rows()
    expect(stored).toHaveLength(1)
    expect(stored[0]).toMatchObject({
      lastError: ACCEPTANCE_REPORT_REFUSED_MESSAGE,
      lastErrorAt: at(0),
      retryAt: at(60),
      failures: 1,
      repositoryWide: true,
      headSha: null,
      conclusion: null,
      reportedAt: null,
    })
    expect(await settingsError()).toEqual({ message: ACCEPTANCE_REPORT_REFUSED_MESSAGE, at: at(0).toISOString() })

    // The refusal is the service account's: none of the repository's merge requests is tried before the wait is over.
    quiet()
    expect(await tick(3)).toEqual({ ...NOTHING, waiting: 3 })
    expect(await tick(59)).toEqual({ ...NOTHING, waiting: 3 })
    expect(station.requests).toEqual([])
    expect(await settingsError()).not.toBeNull()

    expect(await tick(61)).toEqual({ ...NOTHING, reported: 3 })
    expect(new Set(station.checks.map((c) => c.sha))).toEqual(new Set([oid(1), oid(2), oid(3)]))
    expect((await rows()).every((r) => r.lastError === null && r.retryAt === null && r.failures === 0 && !r.repositoryWide && r.conclusion === "success")).toBe(true)
    expect(await settingsError()).toBeNull()
  })

  it("a head commit GitStation does not find (404 on the report) fails that merge request only; its head is read again on the next tick", async () => {
    await open(1, ids.ready)
    await open(2, ids.ready)
    await open(3, ids.ready)
    station.fail(`/projects/${stationProject()}/commits/`, 404, COMMIT_MISSING)

    expect(await tick(0)).toEqual({ ...NOTHING, reported: 2, failed: 1 })
    const failed = await prisma.gitAcceptanceReport.findFirstOrThrow({ where: { repositoryId: ids.repo, lastError: { not: null } } })
    expect(failed).toMatchObject({ lastError: ACCEPTANCE_COMMIT_MISSING_MESSAGE, lastErrorAt: at(0), retryAt: null, failures: 1, repositoryWide: false, headCheckedAt: null, reportedAt: null })

    quiet()
    expect(await tick(3)).toEqual({ ...NOTHING, reported: 1, unchanged: 2 })
    expect(mrReads()).toEqual([`/api/v1/projects/${stationProject()}/merge-requests/${failed.mrRef}`])
    expect(station.checks).toHaveLength(3)
    expect((await rows()).every((r) => r.lastError === null && r.conclusion === "success")).toBe(true)
  })

  it("a merge request that keeps failing waits longer each time (next tick, 10 min, 20 min) and starts over after a success", async () => {
    await open(1, ids.ready)
    station.fail(`/projects/${stationProject()}/commits/`, 404, COMMIT_MISSING, undefined, 3)

    expect(await tick(0)).toEqual({ ...NOTHING, failed: 1 })
    expect(await rowOf(1)).toMatchObject({ failures: 1, retryAt: null })
    expect(await tick(3)).toEqual({ ...NOTHING, failed: 1 })
    expect(await rowOf(1)).toMatchObject({ failures: 2, lastErrorAt: at(3), retryAt: at(13) })

    quiet()
    expect(await tick(6)).toEqual({ ...NOTHING, waiting: 1 })
    expect(station.requests).toEqual([])

    expect(await tick(13)).toEqual({ ...NOTHING, failed: 1 })
    expect(await rowOf(1)).toMatchObject({ failures: 3, retryAt: at(33), repositoryWide: false })
    expect(await tick(30)).toEqual({ ...NOTHING, waiting: 1 })

    expect(await tick(33)).toEqual({ ...NOTHING, reported: 1 })
    expect(await rowOf(1)).toMatchObject({ failures: 0, retryAt: null, lastError: null, conclusion: "success" })
  })

  it("the wait after `failures` consecutive failures: none, 10, 20, 40 min, at most PERMANENT_RETRY_MS — and that long at once for a refusal", () => {
    const min = (n: number) => n * 60_000
    expect(acceptance.PERMANENT_RETRY_MS).toBe(min(60))
    expect([1, 2, 3, 4, 5, 6, 40].map((n) => acceptance.retryDelayMs(n, false))).toEqual([0, min(10), min(20), min(40), min(60), min(60), min(60)])
    expect([1, 2, 40].map((n) => acceptance.retryDelayMs(n, true))).toEqual([min(60), min(60), min(60)])
  })

  it("a stored failure is cleared without asking GitStation when what was to be sent is what GitStation already has", async () => {
    await open(1, ids.bare)
    expect(await tick(0)).toEqual({ ...NOTHING, reported: 1 })
    await ready(ids.bare)
    station.fail(`/projects/${stationProject()}/commits/`, 404, COMMIT_MISSING)
    expect(await tick(3)).toEqual({ ...NOTHING, failed: 1 })
    expect(await rowOf(1)).toMatchObject({ lastError: ACCEPTANCE_COMMIT_MISSING_MESSAGE, conclusion: "action_required", reportedAt: at(0) })
    expect(await settingsError()).not.toBeNull()

    // The judgement is the reported one again: there is nothing left to send, so nothing failed any more.
    await unready(ids.bare)
    quiet()
    expect(await tick(6)).toEqual({ ...NOTHING, unchanged: 1 })
    expect(station.requests).toEqual([])
    expect(await rowOf(1)).toMatchObject({ lastError: null, lastErrorAt: null, failures: 0, conclusion: "action_required", reportedAt: at(0) })
    expect(await settingsError()).toBeNull()
  })

  it("the repository's wait stays on its row when nothing is said about that merge request any more: the other merge requests still wait", async () => {
    await open(1, ids.bare)
    station.fail(`/projects/${stationProject()}/commits/`, 403, REFUSED)
    expect(await tick(0)).toEqual({ ...NOTHING, failed: 1 })
    expect(await rowOf(1)).toMatchObject({ repositoryWide: true, retryAt: at(60) })

    // D-5 ends what is said about merge request 1 — the refusal was the service account's, not this merge request's.
    await prisma.productBacklogItem.update({ where: { id: ids.bare }, data: { confidential: true } })
    await open(2, ids.ready)
    quiet()
    expect(await tick(3)).toEqual({ ...NOTHING, waiting: 1 })
    expect(station.requests).toEqual([])
    expect(await rowOf(1)).toMatchObject({ lastError: ACCEPTANCE_REPORT_REFUSED_MESSAGE, repositoryWide: true, retryAt: at(60) })

    // The wait over: the failure goes from the row nothing is said about, the other merge request is reported.
    expect(await tick(61)).toEqual({ ...NOTHING, reported: 1 })
    expect(checkOn(oid(2))).toHaveLength(1)
    expect(checkOn(oid(1))).toEqual([])
    expect(await rowOf(1)).toMatchObject({ lastError: null, retryAt: null, failures: 0, repositoryWide: false, reportedAt: null })
  })

  it("a failure that is not GitStation's answer is logged with its cause and the step it happened in; nothing is stored and the next tick tries again", async () => {
    await open(1, ids.ready)
    const bug = new TypeError("synthetic bug while sending")
    const broken = {
      gitstation: (o: { apiBase: string; token: string; integrationId: string }) => ({
        ...clients().gitstation(o),
        reportCheck: async () => {
          throw bug
        },
      }),
    }

    expect(await acceptance.reportAcceptanceChecks(broken, at(0))).toEqual({ ...NOTHING, failed: 1 })
    // The cause itself, not the wrapper around it: the log keeps an error's name, message and stack only.
    expect(logSpy.error).toHaveBeenCalledWith("acceptance check failed", { repositoryId: ids.repo, mrRef: "1", stage: "report", error: bug })
    expect(await rows()).toEqual([])
    expect(await settingsError()).toBeNull()

    expect(await tick(3)).toEqual({ ...NOTHING, reported: 1 })
  })

  it("a report GitStation took but Kanflow could not note down counts as reported, is logged, and is sent again on the next tick", async () => {
    await open(1, ids.ready)
    const repository = await prisma.gitRepository.findUniqueOrThrow({ where: { id: ids.repo } })
    // The note cannot be written (here: its repository row is gone while the report is on its way — a foreign key error).
    beforeRequest(/\/commits\/[0-9a-f]+\/checks$/, () => prisma.gitRepository.delete({ where: { id: ids.repo } }))
    try {
      expect(await tick(0)).toEqual({ ...NOTHING, reported: 1 })
    } finally {
      await prisma.gitRepository.create({ data: repository })
    }
    expect(checkOn(oid(1)).map((c) => c.status)).toEqual([201])
    expect(logSpy.error).toHaveBeenCalledWith("acceptance check reported but not recorded", { repositoryId: ids.repo, mrRef: "1", error: expect.any(Error) })
    expect(await rows()).toEqual([])

    // Nothing says it was sent: it goes out again, and GitStation overwrites its check run.
    await link(1, ids.ready)
    expect(await tick(3)).toEqual({ ...NOTHING, reported: 1 })
    expect(checkOn(oid(1)).map((c) => c.status)).toEqual([201, 200])
    expect(await rowOf(1)).toMatchObject({ conclusion: "success", headSha: oid(1), reportedAt: at(3), lastError: null })
  })

  it("GitStation unavailable while reading a merge request: stored in Japanese, the repository waits, everything is reported on the next tick", async () => {
    await open(1, ids.ready)
    await open(2, ids.ready)
    await open(3, ids.ready)
    // The three calls of one read (the client retries a 503 twice).
    station.fail(`/projects/${stationProject()}/merge-requests/`, 503, {}, { "retry-after": "1" }, 3)

    expect(await tick(0)).toEqual({ ...NOTHING, failed: 1, waiting: 2 })
    expect(mrReads()).toHaveLength(3)
    const stored = await rows()
    expect(stored).toHaveLength(1)
    expect(stored[0]).toMatchObject({ lastError: STATION_UNAVAILABLE_MESSAGE, lastErrorAt: at(0), retryAt: null, failures: 1, repositoryWide: true })
    expect(STATION_UNAVAILABLE_MESSAGE).toBe("GitStation が一時的に利用できません。次回の同期で再試行します。")

    expect(await tick(3)).toEqual({ ...NOTHING, reported: 3 })
    expect((await rows()).every((r) => r.lastError === null && r.lastErrorAt === null && r.failures === 0 && !r.repositoryWide)).toBe(true)
  })

  it("GitStation still unavailable on the next tick: the failures count for the repository, whichever merge request met them, and all of them wait", async () => {
    await open(1, ids.ready)
    await open(2, ids.ready)
    await open(3, ids.ready)
    // Two reads, three calls each.
    station.fail(`/projects/${stationProject()}/merge-requests/`, 503, {}, { "retry-after": "1" }, 6)

    expect(await tick(0)).toEqual({ ...NOTHING, failed: 1, waiting: 2 })
    // The merge request that failed is tried last: the second failure meets another one.
    expect(await tick(3)).toEqual({ ...NOTHING, failed: 1, waiting: 2 })
    const stored = (await rows()).sort((a, b) => a.failures - b.failures)
    expect(stored.map((r) => [r.failures, r.repositoryWide, r.retryAt])).toEqual([
      [1, true, null],
      [2, true, at(13)],
    ])

    quiet()
    expect(await tick(6)).toEqual({ ...NOTHING, waiting: 3 })
    expect(station.requests).toEqual([])

    expect(await tick(13)).toEqual({ ...NOTHING, reported: 3 })
    expect((await rows()).every((r) => r.lastError === null && r.retryAt === null && r.failures === 0 && !r.repositoryWide)).toBe(true)
    expect(await settingsError()).toBeNull()
  })

  it("a repository GitStation refuses does not hold up another one: it costs one request per wait, the other repository is reported in full", async () => {
    station.bind(REPO2, [ids.project])
    await open(1, ids.ready)
    await open(2, ids.ready)
    await open(3, ids.ready)
    await openInSecond(51, ids.ready)
    await openInSecond(52, ids.bare)
    station.fail(`/projects/${stationProject()}/commits/`, 403, REFUSED, undefined, 99)

    expect(await tick(0)).toEqual({ ...NOTHING, reported: 2, failed: 1, waiting: 2 })
    const second = station.projectId(REPO2)
    expect(station.checks.map((c) => [c.projectId, c.sha, c.body.conclusion])).toEqual([
      [second, oid(51), "success"],
      [second, oid(52), "action_required"],
    ])
    expect(station.requests.filter((r) => r.startsWith(`/api/v1/projects/${stationProject()}/commits/`))).toHaveLength(1)

    // While the first repository waits, the second one goes on as usual.
    await ready(ids.bare)
    quiet()
    expect(await tick(3)).toEqual({ ...NOTHING, reported: 1, unchanged: 1, waiting: 3 })
    expect(station.requests.some((r) => r.startsWith(`/api/v1/projects/${stationProject()}/`))).toBe(false)
    expect(station.checks[2]).toMatchObject({ projectId: second, sha: oid(52), status: 200 })
  })

  it("a repository with more merge requests than a tick takes does not use up the tick: the repositories take turns", async () => {
    station.bind(REPO2, [ids.project])
    for (let iid = 1; iid <= acceptance.MAX_MRS_PER_TICK; iid++) await open(iid, ids.ready)
    await openInSecond(51, ids.ready)
    await openInSecond(52, ids.ready)

    expect(await tick(0)).toEqual({ ...NOTHING, reported: acceptance.MAX_MRS_PER_TICK, waiting: 2 })
    const second = station.projectId(REPO2)
    expect(station.checks.filter((c) => c.projectId === second).map((c) => c.sha).sort()).toEqual([oid(51), oid(52)])
    // In turn from the start, not after the first repository is done.
    expect(station.checks.slice(0, 4).map((c) => c.projectId)).toEqual([stationProject(), second, stationProject(), second])

    expect(await tick(3)).toEqual({ ...NOTHING, reported: 2, unchanged: acceptance.MAX_MRS_PER_TICK })
  })

  it("off unless the project switched it on, and only for a project that reads GitStation", async () => {
    await open(1, ids.ready)
    await prisma.gitIntegration.update({ where: { projectId: ids.project }, data: { stationAcceptanceCheck: false } })
    expect(await tick(0)).toEqual(NOTHING)

    await prisma.gitIntegration.update({ where: { projectId: ids.project }, data: { stationAcceptanceCheck: true, provider: "gitlab" } })
    expect(await tick(3)).toEqual(NOTHING)

    await prisma.gitIntegration.update({ where: { projectId: ids.project }, data: { provider: "gitstation", enabled: false } })
    expect(await tick(6)).toEqual(NOTHING)

    expect(station.requests).toEqual([])
    expect(await rows()).toEqual([])
  })

  it("switching it off in the settings forgets what was reported (and is logged); switched on again, every open merge request is reported afresh", async () => {
    await open(1, ids.ready)
    expect(await tick(0)).toEqual({ ...NOTHING, reported: 1 })

    const off = await service.updateGitSettings(ids.project, { stationAcceptanceCheck: false }, actor)
    expect(off).toMatchObject({ stationAcceptanceCheck: false, acceptanceCheckError: null })
    expect(await rows()).toEqual([])
    const logged = await prisma.activityLog.findMany({ where: { projectId: ids.project } })
    expect(logged.map((l) => l.diff).join("\n")).toContain("git.stationAcceptanceCheck")
    quiet()
    expect(await tick(3)).toEqual(NOTHING)
    expect(station.requests).toEqual([])

    await service.updateGitSettings(ids.project, { stationAcceptanceCheck: true }, actor)
    expect(await tick(6)).toEqual({ ...NOTHING, reported: 1 })
    // The check run of before is still in GitStation: the new report updates it.
    expect(checkOn(oid(1)).map((c) => c.status)).toEqual([201, 200])
  })

  it("switched off while a tick runs, before the send: nothing is sent and no row comes back", async () => {
    await open(1, ids.ready)
    beforeRequest(/\/merge-requests\/1$/, () => service.updateGitSettings(ids.project, { stationAcceptanceCheck: false }, actor))

    expect(await tick(0)).toEqual({ ...NOTHING, waiting: 1 })
    expect(station.checks).toEqual([])
    expect(await rows()).toEqual([])
  })

  it("switched off while the report is on its way: the tick does not bring back a row the settings change removed", async () => {
    await open(1, ids.ready)
    await open(2, ids.ready)
    await tick(0)
    await ready(ids.bare)
    // Both merge requests have something new to say.
    await link(1, ids.bare)
    await link(2, ids.bare)
    beforeRequest(/\/checks$/, () => service.updateGitSettings(ids.project, { stationAcceptanceCheck: false }, actor))

    // The report already on its way arrives; nothing is remembered of it, and the tick's other merge request is not sent.
    expect(await tick(3)).toEqual({ ...NOTHING, reported: 1, waiting: 1 })
    expect(station.checks).toHaveLength(3)
    expect(await rows()).toEqual([])
  })

  it("a failure is not stored either once the check was switched off", async () => {
    await open(1, ids.ready)
    station.fail(`/projects/${stationProject()}/commits/`, 403, REFUSED)
    beforeRequest(/\/checks$/, () => service.updateGitSettings(ids.project, { stationAcceptanceCheck: false }, actor))

    expect(await tick(0)).toEqual({ ...NOTHING, failed: 1 })
    expect(await rows()).toEqual([])
    expect(await settingsError()).toBeNull()
  })

  it("a repository GitStation binds to another Kanflow project is not written to — no merge request read, no check — and the settings say why", async () => {
    await open(1, ids.ready)
    await open(2, ids.ready)
    station.bind(REPO, [ids.other])

    expect(await tick(0)).toEqual({ ...NOTHING, failed: 1, waiting: 1 })
    expect(mrReads()).toEqual([])
    expect(station.checks).toEqual([])
    const stored = await rows()
    expect(stored).toHaveLength(1)
    expect(stored[0]).toMatchObject({ lastError: STATION_NOT_BOUND_MESSAGE, lastErrorAt: at(0), retryAt: at(60), failures: 1, repositoryWide: true, headSha: null, reportedAt: null })
    expect(await settingsError()).toEqual({ message: STATION_NOT_BOUND_MESSAGE, at: at(0).toISOString() })

    // Not asked again before the wait is over; bound again by then, everything is reported.
    quiet()
    expect(await tick(3)).toEqual({ ...NOTHING, waiting: 2 })
    expect(station.requests).toEqual([])
    station.bind(REPO, [ids.project])
    expect(await tick(60)).toEqual({ ...NOTHING, reported: 2 })
    expect(await settingsError()).toBeNull()
  })

  it("a project without a readable token is not asked and nothing is stored (the sync shows that one)", async () => {
    await open(1, ids.ready)
    const { tokenCipher } = await prisma.gitIntegration.findUniqueOrThrow({ where: { projectId: ids.project }, select: { tokenCipher: true } })
    await prisma.gitIntegration.update({ where: { projectId: ids.project }, data: { tokenCipher: null } })
    try {
      expect(await tick(0)).toEqual({ ...NOTHING, waiting: 1 })
      expect(station.requests).toEqual([])
      expect(await rows()).toEqual([])
      // One line per repository and tick, so that an operator can tell why nothing is reported.
      expect(logSpy.warn.mock.calls.filter(([message]) => message === "acceptance check skipped: no readable token")).toEqual([["acceptance check skipped: no readable token", { repositoryId: ids.repo }]])
    } finally {
      await prisma.gitIntegration.update({ where: { projectId: ids.project }, data: { tokenCipher } })
    }
  })

  it("only open merge request links count: a merged one's row is removed, a ref that is not a merge request number is ignored", async () => {
    await open(1, ids.ready)
    await link("0", ids.ready)
    await link("not-a-number", ids.ready)
    expect(await tick(0)).toEqual({ ...NOTHING, reported: 1 })
    expect((await rows()).map((r) => r.mrRef)).toEqual(["1"])

    await prisma.gitLink.updateMany({ where: { repositoryId: ids.repo, ref: "1" }, data: { state: "merged" } })
    quiet()
    expect(await tick(3)).toEqual(NOTHING)
    expect(station.requests).toEqual([])
    expect(await rows()).toEqual([])
  })

  it("at most MAX_MRS_PER_TICK merge requests are sent in one tick; the rest follow on the next one", async () => {
    const count = acceptance.MAX_MRS_PER_TICK + 1
    for (let iid = 1; iid <= count; iid++) await open(iid, ids.ready)

    expect(await tick(0)).toEqual({ ...NOTHING, reported: acceptance.MAX_MRS_PER_TICK, waiting: 1 })
    expect(await tick(3)).toEqual({ ...NOTHING, reported: 1, unchanged: acceptance.MAX_MRS_PER_TICK })
    expect(new Set(station.checks.map((c) => c.sha)).size).toBe(count)
    expect(await rows()).toHaveLength(count)
  })
})
