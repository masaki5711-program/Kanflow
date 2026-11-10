import {
  createGitStationClient,
  GitStationError,
  isObjectId,
  MAX_CURSOR_LENGTH,
  type GitStationCheckRun,
  type GitStationClient,
  type GitStationClientOptions,
  type GitStationDevStatusPage,
  type GitStationEvent,
  type GitStationMergeRequest,
} from "@/lib/git/gitstation-client"
import {
  CURSOR_INVALID_MESSAGE,
  STATION_AUTH_MESSAGE,
  STATION_FORBIDDEN_MESSAGE,
  STATION_GONE_MESSAGE,
  STATION_HOST_NOT_ALLOWED_MESSAGE,
  STATION_INVALID_RESPONSE_MESSAGE,
  STATION_MISSING_INTEGRATION_MESSAGE,
  STATION_NETWORK_MESSAGE,
  STATION_NOT_BOUND_MESSAGE,
  STATION_NOT_FOUND_MESSAGE,
  STATION_RATE_LIMITED_MESSAGE,
  STATION_TRUNCATED_MESSAGE,
  STATION_UNAVAILABLE_MESSAGE,
  stationHttpMessage,
  SYNC_FAILED_MESSAGE,
} from "@/lib/git/sync-messages"
import { logger } from "@/lib/logger"
import { headShaOf } from "./git-links"
import type {
  DevBranchListing,
  DevChangedPaths,
  DevChanges,
  DevClients,
  DevCommit,
  DevConnection,
  DevCursor,
  DevCursorCodec,
  DevListingFailure,
  DevMergeRequest,
  DevReleaseListing,
  DevSource,
  DevSourceErrorInfo,
  DevSourceKind,
} from "./dev-source"

/**
 * GitStationSource: the DevSource of GitStation (plan 02 §5.7 / §11.2, plan 11 K3; GitStation M3
 * I1c). Instead of polling each repository's current state it reads the integration's EVENT FEED
 * with an opaque cursor, so a merge request closed (or opened and closed) between two polls is never
 * missed (02 §8.2). The feed spans every repository bound to the integration: gitstation-feed-sync
 * reads it ONCE per poll and hands each Kanflow repository its slice (`changesFor`); this module's
 * per-repository `readChanges` does the same for one repository (contract tests, a one-off read).
 *
 * The feed is the change signal; what it does not carry is read through GitStation's API:
 * - merge_request.* events carry ids only (never the title): each merge request an event names is
 *   read once per read (`/merge-requests/{iid}`; a project with many is read through its listing
 *   instead). Its CURRENT state is what Kanflow records; the merged event's time is its merge time.
 * - repository.pushed lists the new commit ids per ref (at most 20): their subjects come from the
 *   history (`/repository/commits?ref=<new>`). A push beyond that (commits_truncated) is a gap, logged.
 * - check.completed names a commit only (N2): its merge request is the one whose head that commit is (in this read,
 *   else Kanflow's stored head, git_link.headSha) and is read like a named one; its dot comes from the head's check
 *   runs (`/commits/{sha}/checks`, `checksVerdict`). Any other type is counted per type (debug) and skipped.
 * - links are GitStation's permalinks (`/-/projects/{id}/…`): its API returns no web URLs.
 *
 * Cursor: "gitstation:v1:<GitStation cursor>", stored on git_station_feed.cursor. The empty
 * position ("gitstation:v1:", first read or 過去分を再同期) and a 410 (retention / epoch_mismatch /
 * ahead_of_head / visible_set_changed) restart the feed as 02 §11.2 and GitStation's dev-status.md prescribe,
 * logged — never a silent jump: take `/events/cursor` first, re-read the merge requests linked to work items
 * through the integration's development status (`/integrations/{id}/dev-status`, I1d: one listing for every
 * repository, with merge times), then read the feed from the position taken first. Commits pushed before that position are not re-read
 * (gap, documented). A 400 FG-INT-0008 keeps the position and asks for 過去分を再同期.
 *
 * Events are routed by GitStation's numeric project id. A repository is read only while GitStation
 * binds its project, for THIS integration, to exactly its own Kanflow project (`locate`, checked on
 * every poll): the token is shared by every project of the integration, so another Kanflow project
 * registering the same path never sees anything of it.
 */
const log = logger.child({ module: "git-sync" })

export type GitStationClientFactory = (options: Pick<GitStationClientOptions, "apiBase" | "token" | "integrationId">) => GitStationClient
export const defaultGitStationClientFactory: GitStationClientFactory = (o) => createGitStationClient(o)

/** Feed pages per read (500 events each): a backlog continues on the next poll. */
export const MAX_FEED_PAGES = 10
/** Merge request listing pages (100 each) per repository when the state is re-read. */
export const MAX_STATE_PAGES = 20
/** Pages of the integration's development status one state re-read reads (100 work items each). */
export const MAX_DEV_STATUS_PAGES = 50
/** Merge requests of one project read one by one in a read; beyond, the project's listing is read. */
export const MAX_DETAILS_PER_PROJECT = 20
/**
 * Follow-up reads (named merge requests + pushed refs) a read takes on: once reached, no further
 * feed page is read in this poll (the rest is a backlog for the next one) — nothing is dropped,
 * and one busy repository cannot starve the others or outlast the feed's lease.
 */
export const MAX_FOLLOW_UPS_PER_READ = 300
const SAMPLES = 5
/** Distinct unused event types counted per read (the feed decides the names: bounded); the rest count as OTHER_TYPES. */
const MAX_UNUSED_TYPES = 20
const OTHER_TYPES = "(other)"
/** Unused event types this process already named at info (bounded). */
const seenUnusedTypes = new Set<string>()
const MAX_SEEN_TYPES = 100

// ------------------------------------------------------------------ cursor

const CURSOR_PREFIX = "gitstation:v1:"
/** GitStation cursors are opaque AEAD strings; this only bounds what is stored. */
const MAX_STATION_CURSOR = MAX_CURSOR_LENGTH

export class InvalidStationCursorError extends Error {
  constructor(reason: string) {
    super(`not a GitStation feed cursor: ${reason}`)
    this.name = "InvalidStationCursorError"
  }
}

/** null = (re)start position. */
export function encodeStationCursor(stationCursor: string | null): DevCursor {
  if (stationCursor !== null && (stationCursor.length === 0 || stationCursor.length > MAX_STATION_CURSOR)) throw new InvalidStationCursorError("bad length")
  return `${CURSOR_PREFIX}${stationCursor ?? ""}` as DevCursor
}

export function decodeStationCursor(cursor: string): string | null {
  if (typeof cursor !== "string" || !cursor.startsWith(CURSOR_PREFIX)) throw new InvalidStationCursorError("unknown prefix")
  const rest = cursor.slice(CURSOR_PREFIX.length)
  if (rest.length > MAX_STATION_CURSOR) throw new InvalidStationCursorError("too long")
  return rest === "" ? null : rest
}

/** Columns of git_station_feed the codec reads and writes. */
interface FeedCursorColumns {
  cursor: string | null
}

export const gitStationCursorCodec: DevCursorCodec = {
  fromRow: (row) => {
    const stored = (row as Partial<FeedCursorColumns>).cursor
    if (stored === null || stored === undefined) return encodeStationCursor(null)
    decodeStationCursor(stored)
    return stored as DevCursor
  },
  toRow: (cursor): FeedCursorColumns => {
    decodeStationCursor(cursor)
    return { cursor }
  },
  /** 過去分を再同期: from the row alone (never decoding it) — the next read re-reads the state. */
  restart: (): FeedCursorColumns => ({ cursor: null }),
}

// ------------------------------------------------------------------ feed read

/** GitStation's permalink builder (the client's `webUrl`). */
export type StationLinks = (projectId: number, ...segments: string[]) => string

export interface FeedRead {
  /** The position the read started from (held when a read cannot be trusted). */
  start: DevCursor
  /** Events in feed order, each id once. */
  events: GitStationEvent[]
  /** Re-read merge requests per GitStation project id: applied before the events. */
  snapshots: Map<number, GitStationMergeRequest[]>
  /** Projects whose state re-read (or whose reads for this read's events) failed: that repository only. */
  rereadFailures: Map<number, unknown>
  /** The current merge request of each one an event of this read names ("<project id>!<iid>"). */
  details: Map<string, GitStationMergeRequest>
  /**
   * N2: the merge requests ("<project id>!<iid>", in `details`) each check.completed event of this read is about —
   * those whose head is the checked commit. Absent / empty = no known merge request has that head (a check on a
   * branch without a merge request, or on an older head).
   */
  checkTargets: Map<string, string[]>
  /**
   * N2: merge requests read for check events per GitStation project id (keys of `details`), matched or not — each is
   * written fresh (an open link without a stored head gets one, so later checks find it).
   */
  checkReads: Map<number, string[]>
  /** Pushed commits per GitStation project id (each sha once). */
  commits: Map<number, DevCommit[]>
  links: StationLinks
  /** Where the next read continues; never past anything not returned. */
  cursor: DevCursor
  /** Failures of the feed itself (every repository of the read shows them). */
  failures: DevListingFailure[]
  /** Why the whole feed was restarted in this read ("restart" for an empty position, or the 410 reason), else null. */
  restarted: string | null
}

const isMergeRequestEvent = (e: GitStationEvent) => e.type.startsWith("merge_request.")
const PUSHED = "repository.pushed"
/** N2: a check run reached a conclusion different from its previous one (data: head_sha, name, conclusion …; no MR). */
const CHECK_COMPLETED = "check.completed"
/** The checked commit of a check.completed event (lower-case), else null. */
const checkedHead = (e: GitStationEvent): string | null => (e.type === CHECK_COMPLETED ? headShaOf(typeof e.data.head_sha === "string" ? e.data.head_sha : null) : null)

/**
 * N2: what Kanflow stored about the open merge requests of one GitStation project (the repositories of this read
 * bound to it): per checked commit, the iids whose stored head it is; and some open ones with no stored head yet
 * (read so their head is known — then matched like the others). The feed sync answers from the database.
 */
export type HeadResolver = (stationProjectId: number, heads: readonly string[]) => Promise<{ byHead: Map<string, number[]>; headless: number[] }>

/** Merge requests read for check events per read (beyond: the dot waits for the merge request's next event). */
export const MAX_CHECK_READS = 20
const detailKey = (projectId: number, iid: number) => `${projectId}!${iid}`
const isIid = (v: unknown): v is number => typeof v === "number" && Number.isSafeInteger(v) && v > 0
const ZERO_OID = /^0+$/

/** Consecutive held reads after which a server error / unreadable answer stops holding the shared feed. */
export const MAX_DEFECT_HOLDS = 3

/** A failure that may go away by reading again (network, 429, 503): it always holds the read. */
const isTransient = (err: unknown) => err instanceof GitStationError && (err.kind === "network" || err.kind === "unavailable" || err.kind === "rate_limited")
/** A server error or an answer Kanflow cannot read: held a few times (it may be a hiccup), then not (it may be for good). */
const isDefect = (err: unknown) => err instanceof GitStationError && (err.kind === "invalid_response" || (err.kind === "http" && (err.status ?? 0) >= 500))

const truncatedState = () => new GitStationError("truncated", "more merge requests than one read takes")

/** Thrown for a failure that holds the whole read at its start (re-read idempotently next poll). */
class HoldRead extends Error {
  constructor(readonly reason: unknown) {
    super("gitstation read held")
    this.name = "HoldRead"
  }
}

/**
 * Holds the read (throws HoldRead) for a transient failure, and for a server error / unreadable
 * answer while the feed has been held fewer than MAX_DEFECT_HOLDS times in a row (feed-sync counts
 * and escalates them). Anything else — 401 / 403 / 404, or a defect that persists — would hold the
 * shared feed for good: it is returned as a failure of that one project (its state is re-read later).
 */
function projectFailure(err: unknown, holdsSoFar: number): unknown {
  if (isTransient(err) || (isDefect(err) && holdsSoFar < MAX_DEFECT_HOLDS)) throw new HoldRead(err)
  return err
}

/**
 * Re-reads the merge requests of the given projects from the integration's development status (GitStation I1d,
 * docs/api/dev-status.md): every merge request linked to a work item of the bound Kanflow projects, any state, with
 * its merge time — one paged listing for the whole integration instead of one listing per project. A project with
 * no linked merge request gets an empty snapshot (an unlinked merge request names no PBI: Kanflow would not link it
 * either; both sides match PBI keys with the same rule, GitStation docs/api/pbi-ref-vectors.json). A listing that
 * fails for good (or is longer than MAX_DEV_STATUS_PAGES: a cut-short state cannot be trusted) is a failure of every
 * project asked for; a transient failure holds the read.
 */
async function rereadProjects(client: GitStationClient, projects: Iterable<number>, context: Record<string, unknown>, holdsSoFar: number) {
  const wanted = new Set(projects)
  const snapshots = new Map<number, GitStationMergeRequest[]>()
  const failures = new Map<number, unknown>()
  if (wanted.size === 0) return { snapshots, failures }
  let truncatedProjects: Set<number>
  try {
    const read = await readDevStatus(client, context)
    truncatedProjects = read.truncatedProjects
    for (const projectId of wanted) snapshots.set(projectId, [])
    for (const mr of read.mergeRequests) snapshots.get(mr.project_id)?.push(mr)
  } catch (error) {
    const failure = projectFailure(error, holdsSoFar)
    for (const projectId of wanted) failures.set(projectId, failure)
    return { snapshots, failures }
  }
  // A PBI with more than 100 linked merge requests: its projects are read through their own listing instead (bounded).
  for (const projectId of truncatedProjects) {
    if (!wanted.has(projectId)) continue
    try {
      const listing = await client.listMergeRequests(projectId, MAX_STATE_PAGES)
      if (listing.truncated) throw truncatedState()
      snapshots.set(projectId, listing.items)
    } catch (error) {
      snapshots.delete(projectId)
      failures.set(projectId, projectFailure(error, holdsSoFar))
    }
  }
  // Not a failure (a project may have no linked merge request), but worth seeing: a project the service account
  // no longer sees, or an allow-list without merge_request.*, also lists nothing — its stored links are kept as they are.
  const empty = [...snapshots].filter(([, mrs]) => mrs.length === 0).map(([id]) => id)
  if (empty.length > 0) log.info("gitstation state re-read found no linked merge requests", { ...context, stationProjectIds: empty })
  return { snapshots, failures }
}

/**
 * Every page of the integration's development status. A 410 while paging (the visible set changed, retention, …)
 * starts the listing again from its first page, once (docs/api/dev-status.md: "2 の途中で 410 になったら最初から").
 */
async function readDevStatus(client: GitStationClient, context: Record<string, unknown>): Promise<{ mergeRequests: GitStationMergeRequest[]; truncatedProjects: Set<number> }> {
  for (let attempt = 0; ; attempt++) {
    const all = new Map<string, GitStationMergeRequest>()
    let skipped = 0
    let truncatedItems = 0
    const truncatedProjects = new Set<number>()
    try {
      let cursor: string | null = null
      for (let page = 0; ; page++) {
        if (page >= MAX_DEV_STATUS_PAGES) {
          log.warn("gitstation state re-read truncated", { ...context, pages: MAX_DEV_STATUS_PAGES })
          throw truncatedState()
        }
        const result: GitStationDevStatusPage = await client.devStatusPage(cursor)
        for (const mr of result.mergeRequests) all.set(detailKey(mr.project_id, mr.iid), mr)
        skipped += result.skipped
        truncatedItems += result.truncatedItems
        for (const id of result.truncatedProjects) truncatedProjects.add(id)
        if (result.nextCursor === null) break
        cursor = result.nextCursor
      }
    } catch (error) {
      if (attempt === 0 && error instanceof GitStationError && error.kind === "gone") {
        log.warn("gitstation state re-read restarted", { ...context, reason: error.detail.reason })
        continue
      }
      throw error
    }
    if (skipped > 0) log.warn("gitstation state items not usable", { ...context, count: skipped })
    // More than 100 linked merge requests on one PBI: those projects are listed on their own (rereadProjects).
    if (truncatedItems > 0) log.warn("gitstation work items with more merge requests than listed", { ...context, count: truncatedItems, stationProjectIds: [...truncatedProjects] })
    return { mergeRequests: [...all.values()], truncatedProjects }
  }
}

/** Follow-up reads the events of `projects` need (one per named merge request, one per pushed ref with commits). */
function followUps(events: readonly GitStationEvent[], projects: ReadonlySet<number>): number {
  const mrs = new Set<string>()
  const heads = new Set<string>()
  let refs = 0
  for (const e of events) {
    if (!projects.has(e.project_id)) continue
    if (isMergeRequestEvent(e) && isIid(e.data.iid)) mrs.add(detailKey(e.project_id, e.data.iid))
    else if (e.type === PUSHED && Array.isArray(e.data.refs)) refs += e.data.refs.length
    else if (checkedHead(e) !== null) heads.add(`${e.project_id}@${checkedHead(e)}`)
  }
  // A checked commit is read at most once (the merge request whose head it is), usually not at all.
  return mrs.size + refs + heads.size
}

/**
 * Reads what the events of `projects` name and do not carry: the merge requests (current state) and
 * the pushed commits. A failure that holds (projectFailure) holds the read (HoldRead); any other on a
 * merge request is that project's failure (its merge requests are re-read later). A commit that is not
 * found skips that ref only; a project whose commits may not be read loses this read's pushes (gap, logged).
 */
async function enrich(
  client: GitStationClient,
  events: readonly GitStationEvent[],
  projects: ReadonlySet<number>,
  rereadFailures: Map<number, unknown>,
  context: Record<string, unknown>,
  holdsSoFar: number,
  resolveHeads?: HeadResolver,
) {
  const details = new Map<string, GitStationMergeRequest>()
  const commits = new Map<number, Map<string, DevCommit>>()
  const refuse = (projectId: number, err: unknown) => {
    if (!rereadFailures.has(projectId)) rereadFailures.set(projectId, err)
  }

  // Merge requests, per project.
  const iids = new Map<number, Set<number>>()
  for (const e of events) {
    if (!isMergeRequestEvent(e) || !projects.has(e.project_id) || !isIid(e.data.iid)) continue
    iids.set(e.project_id, (iids.get(e.project_id) ?? new Set<number>()).add(e.data.iid))
  }
  for (const [projectId, wanted] of iids) {
    if (rereadFailures.has(projectId)) continue
    try {
      if (wanted.size > MAX_DETAILS_PER_PROJECT) {
        // Many merge requests: one listing is cheaper than one read each, and as current.
        const listing = await client.listMergeRequests(projectId, MAX_STATE_PAGES)
        if (listing.skipped > 0) log.warn("gitstation state items not usable", { ...context, stationProjectId: projectId, count: listing.skipped })
        if (listing.truncated) {
          refuse(projectId, truncatedState())
          continue
        }
        for (const mr of listing.items) if (wanted.has(mr.iid)) details.set(detailKey(projectId, mr.iid), mr)
        continue
      }
      // A merge request GitStation does not show (404) means the project is no longer readable as
      // bound: the project's failure, so its state is re-read — never a silent skip.
      for (const iid of wanted) details.set(detailKey(projectId, iid), await client.getMergeRequest(projectId, iid))
    } catch (err) {
      refuse(projectId, projectFailure(err, holdsSoFar))
    }
  }

  const checked = await checkedMergeRequests(client, events, projects, details, rereadFailures, resolveHeads, context)

  // Pushed commits: the ids the event lists, their subjects from the history of the new commit.
  let truncatedPushes = 0
  let missing = 0
  let unreadable = 0
  const skippedPushes = new Map<number, number>()
  /** Projects whose commits may not be read (401 / 403, or a defect that persists). */
  const noCommits = new Set<number>()
  for (const e of events) {
    if (e.type !== PUSHED || !projects.has(e.project_id)) continue
    if (noCommits.has(e.project_id)) {
      skippedPushes.set(e.project_id, (skippedPushes.get(e.project_id) ?? 0) + 1)
      continue
    }
    for (const raw of Array.isArray(e.data.refs) ? e.data.refs : []) {
      if (!raw || typeof raw !== "object") {
        unreadable++
        continue
      }
      const r = raw as Record<string, unknown>
      if (r.commits_truncated === true) truncatedPushes++
      const listed = Array.isArray(r.commits) ? r.commits : []
      const wanted = new Set(listed.filter(isObjectId))
      unreadable += listed.length - wanted.size
      if (wanted.size === 0) continue
      if (!isObjectId(r.new) || ZERO_OID.test(r.new)) {
        unreadable += wanted.size
        continue
      }
      const own = commits.get(e.project_id) ?? new Map<string, DevCommit>()
      commits.set(e.project_id, own)
      for (const sha of own.keys()) wanted.delete(sha)
      if (wanted.size === 0) continue
      try {
        for (const c of await client.commits(e.project_id, r.new)) {
          if (!wanted.delete(c.oid)) continue
          own.set(c.oid, { sha: c.oid, title: c.subject, message: c.subject, url: client.webUrl(e.project_id, "commit", c.oid), author: c.author_name, committedAt: c.committed_at })
        }
        missing += wanted.size
      } catch (err) {
        const failure = projectFailure(err, holdsSoFar)
        // A commit that is gone (a force-pushed ref): that ref only.
        if (failure instanceof GitStationError && failure.kind === "not_found") {
          missing += wanted.size
          continue
        }
        refuse(e.project_id, failure)
        noCommits.add(e.project_id)
        skippedPushes.set(e.project_id, (skippedPushes.get(e.project_id) ?? 0) + 1)
        break
      }
    }
  }
  if (truncatedPushes > 0 || missing > 0 || unreadable > 0) log.warn("gitstation pushed commits not all read", { ...context, truncatedPushes, missing, unreadable })
  // Commits are not in the state re-read: a project that failed loses these pushes' commit links (gap).
  if (skippedPushes.size > 0) log.warn("gitstation pushes of failed projects not read", { ...context, pushes: Object.fromEntries(skippedPushes) })

  return { details, checkTargets: checked.targets, checkReads: checked.refreshed, commits: new Map([...commits].map(([id, m]) => [id, [...m.values()]])) }
}

/**
 * N2: the merge requests each check.completed event is about. A check names a commit only, so the merge request is
 * the one whose head that commit is — among the merge requests this read holds and the open links Kanflow stored
 * (`resolveHeads`, both always: two merge requests can share a head). Open links with no stored head yet are read
 * too (bounded), so their head is known from here on. A merge request found only in the database is read once (its
 * current state; its dot is then looked up by the sync like any merge request of this read).
 *
 * A check is advisory: nothing on this path fails or holds the read. A merge request that cannot be read for a check
 * (gone, refused, GitStation busy) and a lookup Kanflow could not make are logged and dropped — the dot then waits
 * for the merge request's next event, and the feed moves on.
 */
async function checkedMergeRequests(
  client: GitStationClient,
  events: readonly GitStationEvent[],
  projects: ReadonlySet<number>,
  details: Map<string, GitStationMergeRequest>,
  rereadFailures: ReadonlyMap<number, unknown>,
  resolveHeads: HeadResolver | undefined,
  context: Record<string, unknown>,
): Promise<{ targets: Map<string, string[]>; refreshed: Map<number, string[]> }> {
  const out = new Map<string, string[]>()
  /** Merge requests read on this path per project, matched or not (a headless one stores its head). */
  const refreshed = new Map<number, string[]>()
  const checks = events.filter((e) => projects.has(e.project_id) && !rereadFailures.has(e.project_id) && checkedHead(e) !== null)
  if (checks.length === 0) return { targets: out, refreshed }
  const headsByProject = new Map<number, Set<string>>()
  for (const e of checks) headsByProject.set(e.project_id, (headsByProject.get(e.project_id) ?? new Set<string>()).add(checkedHead(e)!))

  const stored = new Map<string, number[]>()
  let reads = 0
  let unread = 0
  for (const [projectId, heads] of resolveHeads ? headsByProject : []) {
    let answer: Awaited<ReturnType<HeadResolver>>
    try {
      answer = await resolveHeads!(projectId, [...heads])
    } catch (err) {
      log.error("gitstation check lookup failed: these checks wait for their merge request's next event", { ...context, stationProjectId: projectId, error: err instanceof Error ? err.message : String(err) })
      continue
    }
    for (const [head, iids] of answer.byHead) stored.set(`${projectId}@${head}`, iids)
    const wanted = new Set([...[...heads].flatMap((h) => stored.get(`${projectId}@${h}`) ?? []), ...answer.headless])
    for (const iid of wanted) {
      const key = detailKey(projectId, iid)
      if (details.has(key)) continue
      if (reads >= MAX_CHECK_READS) {
        unread++
        continue
      }
      reads++
      try {
        details.set(key, await client.getMergeRequest(projectId, iid))
        refreshed.set(projectId, [...(refreshed.get(projectId) ?? []), key])
      } catch (err) {
        unread++
        log.warn("gitstation merge request not read for a check", { ...context, stationProjectId: projectId, iid, error: err instanceof Error ? err.message : String(err) })
      }
    }
  }
  if (unread > 0) log.info("gitstation check reads bounded or failed", { ...context, read: reads, unread })

  const byHead = new Map<string, string[]>()
  for (const [key, mr] of details) {
    const head = headShaOf(mr.head_sha)
    if (head) byHead.set(`${mr.project_id}@${head}`, [...(byHead.get(`${mr.project_id}@${head}`) ?? []), key])
  }
  const misses: { id: string; stationProjectId: number; head: string }[] = []
  for (const e of checks) {
    const at = `${e.project_id}@${checkedHead(e)!}`
    const keys = [...new Set([...(byHead.get(at) ?? []), ...(stored.get(at) ?? []).map((iid) => detailKey(e.project_id, iid))])].filter((k) => details.has(k))
    if (keys.length === 0) misses.push({ id: e.id, stationProjectId: e.project_id, head: checkedHead(e)! })
    out.set(e.id, keys)
  }
  // Expected for checks on a branch without a merge request (main); the only trace of a dot that did not move.
  if (misses.length > 0) log.info("gitstation checks on no known merge request head", { ...context, count: misses.length, samples: misses.slice(0, SAMPLES) })
  return { targets: out, refreshed }
}

/**
 * One read of the feed for the given GitStation projects, up to MAX_FEED_PAGES. Never throws for
 * GitStation's answers (they are `failures`); the returned cursor only moves past what was returned.
 *
 * - Empty position (first read, 過去分を再同期) and 410 (any reason): the feed restarts as 02 §11.2
 *   prescribes — the head cursor FIRST, then every project's merge requests (any state), then the
 *   feed from that head. Commits pushed before the head are not re-read (gap, documented).
 * - `reread`: projects whose state must be re-read without restarting the feed (a repository new to
 *   the feed, one marked after it was not bound / its re-read failed).
 * - A project whose re-read fails does not stop the others: it is reported in `rereadFailures`.
 * - When the head cannot be taken, a 410 cannot be recovered, or what the events name cannot be read
 *   for a transient reason, the read keeps the position it STARTED from (re-read idempotently next time).
 */
export async function readFeed(
  client: GitStationClient,
  start: DevCursor,
  projects: readonly number[],
  context: Record<string, unknown> = {},
  reread: readonly number[] = [],
  /** Consecutive held reads of this feed so far (MAX_DEFECT_HOLDS). */
  holdsSoFar = 0,
  /** N2: stored merge request heads (check.completed); without it a check finds only the merge requests of this read. */
  resolveHeads?: HeadResolver,
): Promise<FeedRead> {
  let after = decodeStationCursor(start)
  let restarted: string | null = null
  const failures: DevListingFailure[] = []
  const events: GitStationEvent[] = []
  let snapshots = new Map<number, GitStationMergeRequest[]>()
  let rereadFailures = new Map<number, unknown>()
  const links: StationLinks = (projectId, ...segments) => client.webUrl(projectId, ...segments)
  const held = (): FeedRead => ({ start, events: [], snapshots: new Map(), rereadFailures: new Map(), details: new Map(), checkTargets: new Map(), checkReads: new Map(), commits: new Map(), links, cursor: start, failures, restarted: null })
  const ours = new Set(projects)

  try {
    return await read()
  } catch (err) {
    if (!(err instanceof HoldRead)) throw err
    log.warn("gitstation read held: a follow-up read failed for now", { ...context })
    failures.push({ kind: "feed", error: err.reason })
    return held()
  }

  async function read(): Promise<FeedRead> {

  /** Head first, then the state of every project. False when the head cannot be taken. */
  const restart = async (why: string): Promise<boolean> => {
    let head: string
    try {
      head = await client.headCursor()
    } catch (error) {
      failures.push({ kind: "feed", error })
      return false
    }
    const state = await rereadProjects(client, projects, context, holdsSoFar)
    snapshots = state.snapshots
    rereadFailures = state.failures
    after = head
    restarted = why
    // What the events read so far said about merge requests is older than the state: drop it.
    // Pushed commits are not in the state, so they stay.
    const kept = events.filter((e) => !isMergeRequestEvent(e))
    events.length = 0
    events.push(...kept)
    return true
  }

  if (after === null) {
    if (!(await restart("restart"))) return held()
  } else if (reread.length > 0) {
    const state = await rereadProjects(client, reread, context, holdsSoFar)
    snapshots = state.snapshots
    rereadFailures = state.failures
  }

  const seen = new Set<string>()
  let malformed = 0
  const malformedSamples: { id: string | null; type: string | null }[] = []
  let more = true
  for (let page = 0; page < MAX_FEED_PAGES && more; page++) {
    let result
    try {
      // After a restart (or from a stored position) `after` is always a cursor here.
      result = await client.events(after as string)
    } catch (error) {
      if (error instanceof GitStationError && error.kind === "gone" && restarted === null) {
        log.warn("gitstation feed restarted", { ...context, reason: error.detail.reason })
        if (await restart(String(error.detail.reason ?? "unknown"))) {
          page = -1 // read from the head with a fresh page budget
          continue
        }
        return held()
      }
      failures.push({ kind: "feed", error })
      break
    }
    malformed += result.malformed
    for (const sample of result.malformedSamples ?? []) if (malformedSamples.length < 5) malformedSamples.push(sample)
    if (result.hasMore && result.nextCursor === after) {
      failures.push({ kind: "feed", error: new GitStationError("invalid_response", "GitStation feed has more events but did not move its cursor") })
      break
    }
    for (const e of result.events) {
      // At least once (02 §11.2): the same event may come again; keep it once.
      if (seen.has(e.id)) continue
      seen.add(e.id)
      events.push(e)
    }
    after = result.nextCursor
    more = result.hasMore
    // Enough follow-up reads for one poll: the rest of the feed waits for the next one.
    if (more && followUps(events, ours) >= MAX_FOLLOW_UPS_PER_READ) break
  }
  if (malformed > 0) log.warn("gitstation events of an unexpected shape skipped", { ...context, count: malformed, samples: malformedSamples })
  if (more && failures.length === 0) log.info("git sync backlog", { ...context, kind: "feed" })

  const enriched = await enrich(client, events, ours, rereadFailures, context, holdsSoFar, resolveHeads)
  return { start, events, snapshots, rereadFailures, details: enriched.details, checkTargets: enriched.checkTargets, checkReads: enriched.checkReads, commits: enriched.commits, links, cursor: encodeStationCursor(after), failures, restarted }
  }
}

// ------------------------------------------------------------------ records

/** GitStation's state names in Kanflow's (GitLab's) vocabulary, which git-links and the UI use. */
function kanflowState(state: unknown): string | null {
  switch (state) {
    case "open":
    case "opened":
      return "opened"
    case "merged":
      return "merged"
    case "closed":
      return "closed"
    case "locked":
      return "locked"
    default:
      return null
  }
}

/** Kanflow projects the event's work items name. */
function projectsNamed(e: GitStationEvent): Set<string> {
  return new Set(e.work_items.filter((w) => w.provider === "kanflow").map((w) => w.project_id))
}

/**
 * A merge request as Kanflow records it. `mergedAt`: the merged event's time when this read saw it, or the
 * development status's `merged_at` on a re-read (`updated_at` stands in only when neither is known). Once a merge
 * time is stored it is kept (git-sync writeLinks). The development status names no author: null = unknown (the
 * stored author is kept). `mergedBy`: the merged event's actor when this read saw that event — GitStation names
 * the merger nowhere else, so a re-read passes null (unknown: the stored name is kept).
 */
function toRecord(mr: GitStationMergeRequest, links: StationLinks, mergedAt: string | null, mergedBy: string | null = null): DevMergeRequest | null {
  const state = kanflowState(mr.state)
  if (!state) return null
  return {
    ref: String(mr.iid),
    title: mr.title,
    state,
    url: links(mr.project_id, "pull", String(mr.iid)),
    sourceBranch: mr.source_branch,
    author: mr.author?.display_name ?? mr.author?.username ?? null,
    updatedAt: mr.updated_at,
    mergedAt: state === "merged" ? mergedAt : null,
    openedAt: mr.created_at,
    targetBranch: mr.target_branch ?? null,
    mergedBy: state === "merged" ? mergedBy : null,
    headSha: headShaOf(mr.head_sha),
  }
}

/**
 * The person an event names, for display: display name, else username. Null for the system (auto-merge has no
 * person), for an actor without names, and when the event named no actor. A service account acting for a person
 * (`user_via_service_account`) shows that person; a service account alone shows its own name.
 */
export function actorName(e: Pick<GitStationEvent, "actor">): string | null {
  const user = e.actor?.kind === "system" ? null : e.actor?.user
  const name = user?.display_name?.trim() || user?.username?.trim()
  return name || null
}

/** A Kanflow repository a feed read is routed to (`stationProjectId` null = not located: nothing is routed to it). */
export interface FeedRepository {
  id: string
  repoPath: string
  projectId: string
  stationProjectId: number | null
}

export interface RoutedRead {
  changes: Map<string, DevChanges>
  /** Events routed to each repository (logged when a repository is skipped). */
  eventCounts: Map<string, number>
}

/**
 * Routes one read to its Kanflow repositories by GitStation project id: each gets its re-read merge
 * requests first, then the merge requests its events name (their current state; the merged event's
 * time), the merge requests its check.completed events are about (N2) and its pushed commits. Event types Kanflow
 * does not use are skipped (02 §5.8) and counted per type (debug). Logged once
 * per read, with samples: events Kanflow cannot use, events naming one of these Kanflow projects
 * from a GitStation project that is none of their repositories, re-read items that do not parse.
 */
export function routeFeed(read: FeedRead, repositories: readonly FeedRepository[], context: Record<string, unknown> = {}): RoutedRead {
  const byProject = new Map<number, FeedRepository[]>()
  for (const r of repositories) if (r.stationProjectId !== null) byProject.set(r.stationProjectId, [...(byProject.get(r.stationProjectId) ?? []), r])
  const kanflowProjects = new Set(repositories.map((r) => r.projectId))
  const mrs = new Map<string, Map<string, DevMergeRequest>>()
  const eventCounts = new Map<string, number>()
  let unparsedSnapshot = 0
  for (const r of repositories) {
    const own = new Map<string, DevMergeRequest>()
    for (const mr of (r.stationProjectId === null ? undefined : read.snapshots.get(r.stationProjectId)) ?? []) {
      const parsed = toRecord(mr, read.links, mr.merged_at ?? mr.updated_at)
      if (parsed) own.set(parsed.ref, parsed)
      else unparsedSnapshot++
    }
    mrs.set(r.id, own)
    eventCounts.set(r.id, 0)
  }

  // The merged event's time of each merge request in this read (the API sends none).
  // ... and who merged it (N11: the merged event's actor; the API names no merger either).
  const mergedAt = new Map<string, string>()
  const mergedBy = new Map<string, string | null>()
  for (const e of read.events) {
    if (e.type !== "merge_request.merged" || !isIid(e.data.iid)) continue
    const key = detailKey(e.project_id, e.data.iid)
    mergedAt.set(key, e.occurred_at)
    mergedBy.set(key, actorName(e))
  }

  const unusable: { id: string; type: string }[] = []
  const unrouted: { id: string; stationProjectId: number }[] = []
  /** N2: event types Kanflow does not use, counted per type (debug: they are expected, e.g. work_item.linked). */
  const unused = new Map<string, number>()
  for (const e of read.events) {
    const mergeRequest = isMergeRequestEvent(e)
    const check = e.type === CHECK_COMPLETED
    if (!mergeRequest && !check && e.type !== PUSHED) {
      const type = e.type.slice(0, 64)
      const counted = unused.has(type) || unused.size < MAX_UNUSED_TYPES ? type : OTHER_TYPES
      unused.set(counted, (unused.get(counted) ?? 0) + 1)
      // A type first seen by this process is worth one line at info (a new GitStation event Kanflow may want).
      if (counted === type && !seenUnusedTypes.has(type) && seenUnusedTypes.size < MAX_SEEN_TYPES) {
        seenUnusedTypes.add(type)
        log.info("gitstation event type not used", { ...context, type })
      }
      continue
    }
    const targets = byProject.get(e.project_id) ?? []
    if (targets.length === 0) {
      if ([...projectsNamed(e)].some((p) => kanflowProjects.has(p))) unrouted.push({ id: e.id, stationProjectId: e.project_id })
      continue
    }
    let usable = true
    for (const r of targets) {
      eventCounts.set(r.id, (eventCounts.get(r.id) ?? 0) + 1)
      // Pushed commits are read per project (read.commits); a refused project is re-read later.
      if ((!mergeRequest && !check) || read.rereadFailures.has(e.project_id)) continue
      if (check) {
        // The merge requests whose head was checked (none known = nothing to update, not a defect).
        for (const key of read.checkTargets.get(e.id) ?? []) {
          const detail = read.details.get(key)
          const record = detail ? toRecord(detail, read.links, mergedAt.get(key) ?? null, mergedBy.get(key) ?? null) : null
          if (record) mrs.get(r.id)!.set(record.ref, record)
          else usable = false
        }
        continue
      }
      const key = isIid(e.data.iid) ? detailKey(e.project_id, e.data.iid) : null
      const detail = key === null ? undefined : read.details.get(key)
      const record = detail && key !== null ? toRecord(detail, read.links, mergedAt.get(key) ?? null, mergedBy.get(key) ?? null) : null
      if (record) mrs.get(r.id)!.set(record.ref, record)
      else usable = false
    }
    if (!usable) unusable.push({ id: e.id, type: e.type })
  }
  // N2: merge requests read for checks (matched or not) are written fresh: a link without a stored head gets one.
  for (const r of repositories) {
    if (r.stationProjectId === null || read.rereadFailures.has(r.stationProjectId)) continue
    for (const key of read.checkReads.get(r.stationProjectId) ?? []) {
      const detail = read.details.get(key)
      const record = detail ? toRecord(detail, read.links, mergedAt.get(key) ?? null, mergedBy.get(key) ?? null) : null
      if (record && !mrs.get(r.id)!.has(record.ref)) mrs.get(r.id)!.set(record.ref, record)
    }
  }
  if (unusable.length > 0) log.warn("gitstation events not usable", { ...context, count: unusable.length, samples: unusable.slice(0, SAMPLES) })
  if (unrouted.length > 0) log.warn("gitstation events match no repository", { ...context, count: unrouted.length, samples: unrouted.slice(0, SAMPLES) })
  if (unparsedSnapshot > 0) log.warn("gitstation state items not usable", { ...context, count: unparsedSnapshot })
  if (unused.size > 0) log.debug("gitstation event types not used", { ...context, counts: Object.fromEntries(unused) })

  const changes = new Map<string, DevChanges>()
  for (const r of repositories) {
    const ownMrs = [...mrs.get(r.id)!.values()]
    const rereadFailure = r.stationProjectId === null ? undefined : read.rereadFailures.get(r.stationProjectId)
    changes.set(r.id, {
      mergeRequests: ownMrs,
      freshMergeRequestRefs: new Set(ownMrs.map((m) => m.ref)),
      commits: r.stationProjectId === null ? [] : (read.commits.get(r.stationProjectId) ?? []),
      cursor: read.cursor,
      failures: rereadFailure === undefined ? read.failures : [...read.failures, { kind: "mr", error: rereadFailure }],
    })
  }
  return { changes, eventCounts }
}

/** One repository's slice of a read (the per-repository DevSource). */
export function changesFor(read: FeedRead, repository: FeedRepository): DevChanges {
  return routeFeed(read, [repository], { repositoryId: repository.id }).changes.get(repository.id)!
}

// ------------------------------------------------------------------ checks

/** Conclusions that mean the check did its job and found nothing wrong. */
const PASSED = new Set(["success", "neutral"])
/** Conclusions that mean the commit is broken (CI red: the card turns red and the PBI's people are told). */
const BROKEN = new Set(["failure", "error"])

/**
 * N2: the check runs of a merge request's head as one pipeline status, in the words the card already uses
 * (git-labels / git-format). Worst first:
 * - a run that failed or errored → "failed" (CI red; notified once per change, git-sync)
 * - a run still queued / running → "running" ("pending" when every unfinished run is still queued)
 * - a run that waits for a person (`action_required`, e.g. kanflow/acceptance before the PBI is accepted) or ends with
 *   a conclusion Kanflow does not know → "manual" (shown as waiting — never as red, never notified)
 * - otherwise (success / neutral) → "success". No run → null (nothing to show).
 */
export function checksVerdict(runs: readonly GitStationCheckRun[]): string | null {
  if (runs.length === 0) return null
  const done = runs.filter((r) => r.status === "completed")
  if (done.some((r) => r.conclusion !== null && BROKEN.has(r.conclusion))) return "failed"
  const open = runs.filter((r) => r.status !== "completed")
  if (open.length > 0) return open.every((r) => r.status === "queued") ? "pending" : "running"
  if (done.some((r) => r.conclusion === null || !PASSED.has(r.conclusion))) return "manual"
  return "success"
}

// ------------------------------------------------------------------ errors

export const NOT_BOUND_MESSAGE = STATION_NOT_BOUND_MESSAGE

/**
 * The repository is visible to the integration's service account but GitStation does not bind it, for
 * this integration, to exactly this Kanflow project (another one, or none): its state, branches and
 * tags carry no work items, so reading them here could show another project's work.
 */
export class NotBoundError extends Error {
  constructor() {
    super("GitStation repository is not bound to this Kanflow project")
    this.name = "NotBoundError"
  }
}

export const MISSING_INTEGRATION_MESSAGE = STATION_MISSING_INTEGRATION_MESSAGE

export class MissingIntegrationError extends Error {
  constructor() {
    super("GitStation integration id is not set")
    this.name = "MissingIntegrationError"
  }
}

/**
 * The text stored in lastError (Japanese). Every text comes from lib/git/sync-messages, which is what
 * lets the UI show it in the viewer's language: a text written here in place would reach an English or
 * Indonesian reader as stored.
 */
export function gitStationErrorMessage(err: unknown): string {
  if (err instanceof MissingIntegrationError) return MISSING_INTEGRATION_MESSAGE
  if (err instanceof NotBoundError) return NOT_BOUND_MESSAGE
  if (!(err instanceof GitStationError)) return SYNC_FAILED_MESSAGE
  switch (err.kind) {
    case "auth":
      return STATION_AUTH_MESSAGE
    case "forbidden":
      return STATION_FORBIDDEN_MESSAGE
    case "not_found":
      return STATION_NOT_FOUND_MESSAGE
    case "cursor_invalid":
      return CURSOR_INVALID_MESSAGE
    case "gone":
      return STATION_GONE_MESSAGE
    case "rate_limited":
      return STATION_RATE_LIMITED_MESSAGE
    case "unavailable":
      return STATION_UNAVAILABLE_MESSAGE
    case "network":
      return STATION_NETWORK_MESSAGE
    case "invalid_response":
      return STATION_INVALID_RESPONSE_MESSAGE
    case "truncated":
      return STATION_TRUNCATED_MESSAGE
    case "host_not_allowed":
      return STATION_HOST_NOT_ALLOWED_MESSAGE
    default:
      return stationHttpMessage(err.status)
  }
}

export function describeGitStationError(error: unknown): DevSourceErrorInfo {
  if (error instanceof InvalidStationCursorError) return { kind: "cursor", expected: false, message: CURSOR_INVALID_MESSAGE }
  if (error instanceof MissingIntegrationError) return { kind: "integration", expected: true, message: MISSING_INTEGRATION_MESSAGE }
  if (error instanceof NotBoundError) return { kind: "not_bound", expected: true, message: NOT_BOUND_MESSAGE }
  if (error instanceof GitStationError) {
    if (error.kind === "cursor_invalid") return { kind: "cursor", expected: false, status: error.status, message: CURSOR_INVALID_MESSAGE }
    // A shape Kanflow does not understand is a defect on one side or the other, not an answer.
    const defect = error.kind === "invalid_response" || error.kind === "http" || error.kind === "truncated" || error.kind === "host_not_allowed"
    return { kind: error.kind, expected: !defect, status: error.status, message: gitStationErrorMessage(error) }
  }
  return { kind: "http", expected: false, message: gitStationErrorMessage(error) }
}

// ------------------------------------------------------------------ source

/** Branch names Kanflow reads (the PBI branches; GitStation's ref listing has no search). */
const PBI_BRANCH = /pbi/i

/** The GitStation client of a connection, or MissingIntegrationError. */
export function stationClientFor(connection: Pick<DevConnection, "apiBase" | "token" | "stationIntegrationId">, factory: GitStationClientFactory = defaultGitStationClientFactory): GitStationClient {
  const integrationId = connection.stationIntegrationId?.trim()
  if (!integrationId) throw new MissingIntegrationError()
  return factory({ apiBase: connection.apiBase, token: connection.token, integrationId })
}

export interface GitStationSource extends DevSource {
  /** GitStation's project id of the repository (throws NotBoundError / GitStationError). */
  locate(): Promise<number>
  /** GitStation's project id of the repository: set by `locate`, null before it succeeded. */
  stationProjectId(): number | null
}

export function createGitStationSource(connection: DevConnection, factory: GitStationClientFactory = defaultGitStationClientFactory): GitStationSource {
  const { repositoryId, repoPath, projectId } = connection
  let client: GitStationClient | null = null
  const station = () => (client ??= stationClientFor(connection, factory))
  const context = { repositoryId }
  let located: number | null = null

  /**
   * The repository's project must be visible to the service account AND bound in GitStation, for
   * this integration, to exactly this Kanflow project (the token is shared by every project of the
   * integration). The path is resolved on every check — a stored id could be another source's — and
   * a moved path resolves to the project it moved to.
   */
  async function locate(): Promise<number> {
    const integrationId = connection.stationIntegrationId?.trim() ?? ""
    const project = await station().resolveProject(repoPath)
    const kanflow = (await station().bindings(project.projectId)).filter((b) => b.kind === "kanflow")
    // Exactly this project (02 §2 forbids binding one repository to several Kanflow projects).
    if (kanflow.length !== 1 || kanflow[0].integrationId !== integrationId || kanflow[0].externalProjectId !== projectId) throw new NotBoundError()
    if (project.moved) log.info("gitstation repository path moved", { repositoryId, stationProjectId: project.projectId, canonicalPath: project.canonicalPath })
    located = project.projectId
    return project.projectId
  }
  const stationProject = async () => located ?? (await locate())

  return {
    provider: "gitstation",
    locate,
    stationProjectId: () => located,

    async readChanges(cursor: DevCursor): Promise<DevChanges> {
      const id = await stationProject()
      const read = await readFeed(station(), cursor, [id], context)
      return changesFor(read, { id: repositoryId, repoPath, projectId, stationProjectId: id })
    },

    async listBranches(): Promise<DevBranchListing> {
      const id = await stationProject()
      const r = await station().refs(id, "branch")
      if (r.truncated) log.warn("git sync truncated", { repositoryId, kind: "branch", markedGone: false })
      return {
        items: r.items.filter((b) => PBI_BRANCH.test(b.name)).map((b) => ({ name: b.name, url: station().webUrl(id, "tree", b.name), headTitle: null, headAuthor: null, headCommittedAt: null })),
        complete: !r.truncated,
      }
    },

    /**
     * N2: the card's dot from the check runs on the merge request's head (GitStation has no pipeline events yet; M4's
     * pipelines are expected to report as checks too). The head this read saw, else the merge request is read for it.
     * No head yet (no version recorded) or no check = no status.
     */
    async pipelineStatus(ref: string, headSha?: string | null): Promise<string | null> {
      const id = await stationProject()
      const head = headSha ?? (await station().getMergeRequest(id, Number(ref))).head_sha ?? null
      if (!head || !isObjectId(head)) return null
      return checksVerdict(await station().commitChecks(id, head))
    },

    /**
     * N3 (W4 触る範囲): the merge request's changed files from GitStation's context answer (at most 300 there). Files
     * withheld from the service account (confidential marks) are never named: a listing with any is incomplete.
     */
    async changedPaths(ref: string): Promise<DevChangedPaths> {
      const id = await stationProject()
      const r = await station().mergeRequestChangedPaths(id, Number(ref))
      if (r.withheld > 0 || r.skipped > 0) log.info("gitstation changed files not all named", { repositoryId, mr: ref, withheld: r.withheld, skipped: r.skipped })
      return { paths: r.paths, complete: !r.truncated && r.withheld === 0 && r.skipped === 0 }
    },

    /** Tags without release data (GitStation has none); their date is kept once stored (null = unknown). */
    async listReleaseTags(): Promise<DevReleaseListing> {
      const id = await stationProject()
      const r = await station().refs(id, "tag")
      const drafts = r.items.map((t) => ({ tag: t.name, name: null, description: null, url: station().webUrl(id, "tree", t.name), releasedAt: null }))
      return { drafts, complete: !r.truncated }
    },

    describeError: describeGitStationError,
  }
}

export const gitStationSourceKind: DevSourceKind = {
  provider: "gitstation",
  actorName: "GitStation",
  // AI の参照資料 through the browse API (gitstation-files.ts); confidential documents are refused there.
  readsRepositoryFiles: true,
  cursors: gitStationCursorCodec,
  connect: (connection: DevConnection, clients?: DevClients) => createGitStationSource(connection, clients?.gitstation),
}
