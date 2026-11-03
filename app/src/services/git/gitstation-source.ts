import { createGitStationClient, GitStationError, MAX_CURSOR_LENGTH, type GitStationClient, type GitStationClientOptions, type GitStationEvent, type GitStationMergeRequest } from "@/lib/git/gitstation-client"
import { CURSOR_INVALID_MESSAGE } from "@/lib/git/sync-messages"
import { logger } from "@/lib/logger"
import type {
  DevBranchListing,
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
 * GitStationSource: the DevSource of GitStation (plan 02 §5.7 / §11.2, plan 11 K3). Instead of
 * polling each repository's current state it reads the integration's EVENT FEED with an opaque
 * cursor, so a merge request closed (or opened and closed) between two polls is never missed
 * (02 §8.2). The feed spans every repository bound to the integration: gitstation-feed-sync reads
 * it ONCE per poll and hands each Kanflow repository its slice (`changesFor`); this module's
 * per-repository `readChanges` does the same for one repository (contract tests, a one-off read).
 *
 * Cursor: "gitstation:v1:<GitStation cursor>", stored on git_station_feed.cursor. The empty
 * position ("gitstation:v1:", first read or 過去分を再同期) and a 410 (retention / epoch_mismatch /
 * ahead_of_head / visible_set_changed) restart the feed as 02 §11.2 prescribes, logged — never a
 * silent jump: take `/events/cursor` first, re-read every repository's merge requests through the
 * dev-status listing (`state=all`, so merge requests older than the retention come back too), then
 * read the feed from the position taken first. Commits linked before that position are not in the
 * state and are not re-read (gap; GitStation has no commit listing in the contract yet).
 * A 400 FG-INT-0008 keeps the position and asks for 過去分を再同期.
 *
 * Only events that name a work item of the repository's OWN Kanflow project are taken
 * (`work_items[].project_id`), whatever repository path they carry. Re-read state, branches and tags
 * carry no work items, so a repository is read only while GitStation binds it to exactly this one
 * Kanflow project (`locate`, checked on every poll): another project registering the same path
 * never sees anything of it.
 */
const log = logger.child({ module: "git-sync" })

export type GitStationClientFactory = (options: Pick<GitStationClientOptions, "apiBase" | "token" | "integrationId">) => GitStationClient
export const defaultGitStationClientFactory: GitStationClientFactory = (o) => createGitStationClient(o)

/** Feed pages per read (500 events each): a backlog continues on the next poll. */
export const MAX_FEED_PAGES = 10
/** Dev-status pages (100 merge requests each) per repository when the state is re-read. */
export const MAX_STATE_PAGES = 20
const MAX_BRANCH_PAGES = 3
const MAX_TAG_PAGES = 3

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

export interface FeedRead {
  /** The position the read started from (held when a read cannot be trusted). */
  start: DevCursor
  /** Events in feed order, each id once. */
  events: GitStationEvent[]
  /** Re-read merge requests per repository path (lower case): applied before the events. */
  snapshots: Map<string, GitStationMergeRequest[]>
  /** Paths whose state re-read failed (that repository only; the others go on). */
  rereadFailures: Map<string, unknown>
  /** Where the next read continues; never past anything not returned. */
  cursor: DevCursor
  /** Failures of the feed itself (every repository of the read shows them). */
  failures: DevListingFailure[]
  /** Why the whole feed was restarted in this read ("restart" for an empty position, or the 410 reason), else null. */
  restarted: string | null
}

const lower = (path: string) => path.toLowerCase()
const isMergeRequestEvent = (e: GitStationEvent) => e.type.startsWith("merge_request.")

/**
 * Re-reads the merge requests of the given paths through the dev-status listing. A path that fails
 * (or has more than MAX_STATE_PAGES pages: a cut-short state cannot be trusted) is a failure of
 * that path only.
 */
async function rereadPaths(client: GitStationClient, paths: Iterable<string>, context: Record<string, unknown>) {
  const snapshots = new Map<string, GitStationMergeRequest[]>()
  const failures = new Map<string, unknown>()
  for (const path of new Set([...paths].map(lower))) {
    try {
      const listing = await client.listMergeRequests(path, MAX_STATE_PAGES)
      if (listing.truncated) {
        log.warn("gitstation state re-read truncated", { ...context, repositoryPath: path, pages: MAX_STATE_PAGES })
        failures.set(path, new GitStationError("truncated", `more than ${MAX_STATE_PAGES} pages of merge requests`))
        continue
      }
      snapshots.set(path, listing.items)
    } catch (error) {
      failures.set(path, error)
    }
  }
  return { snapshots, failures }
}

/**
 * One read of the feed for the given repository paths, up to MAX_FEED_PAGES. Never throws for
 * GitStation's answers (they are `failures`); the returned cursor only moves past what was returned.
 *
 * - Empty position (first read, 過去分を再同期) and 410 (any reason): the feed restarts as 02 §11.2
 *   prescribes — the head cursor FIRST, then every path's state through the dev-status listing
 *   (merge requests older than the retention included), then the feed from that head. Commits
 *   linked before the head are not in the state (gap, documented).
 * - `reread`: paths whose state must be re-read without restarting the feed (a repository new to
 *   the feed, one marked after it was not bound / its re-read failed).
 * - A path whose re-read fails does not stop the others: it is reported in `rereadFailures`.
 * - When the head cannot be taken, or a 410 cannot be recovered, the read keeps the position it
 *   STARTED from (with what it read, re-applied idempotently next time).
 */
export async function readFeed(
  client: GitStationClient,
  start: DevCursor,
  paths: readonly string[],
  context: Record<string, unknown> = {},
  reread: readonly string[] = [],
): Promise<FeedRead> {
  let after = decodeStationCursor(start)
  let restarted: string | null = null
  const failures: DevListingFailure[] = []
  const events: GitStationEvent[] = []
  let snapshots = new Map<string, GitStationMergeRequest[]>()
  let rereadFailures = new Map<string, unknown>()
  const held = (): FeedRead => ({ start, events, snapshots: new Map(), rereadFailures: new Map(), cursor: start, failures, restarted })

  /** Head first, then the state of every path. False when the head cannot be taken. */
  const restart = async (why: string): Promise<boolean> => {
    let head: string
    try {
      head = await client.headCursor()
    } catch (error) {
      failures.push({ kind: "feed", error })
      return false
    }
    const state = await rereadPaths(client, paths, context)
    snapshots = state.snapshots
    rereadFailures = state.failures
    after = head
    restarted = why
    // What the events read so far said about merge requests is older than the state: drop it.
    // Linked commits are not in the state, so they stay.
    const kept = events.filter((e) => !isMergeRequestEvent(e))
    events.length = 0
    events.push(...kept)
    return true
  }

  if (after === null) {
    if (!(await restart("restart"))) return held()
  } else if (reread.length > 0) {
    const state = await rereadPaths(client, reread, context)
    snapshots = state.snapshots
    rereadFailures = state.failures
  }

  const seen = new Set<string>()
  let malformed = 0
  let more = true
  for (let page = 0; page < MAX_FEED_PAGES && more; page++) {
    let result
    try {
      result = await client.events(after)
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
  }
  if (malformed > 0) log.warn("gitstation events of an unexpected shape skipped", { ...context, count: malformed })
  if (more && failures.length === 0) log.info("git sync backlog", { ...context, kind: "feed" })
  return { start, events, snapshots, rereadFailures, cursor: encodeStationCursor(after), failures, restarted }
}

// ------------------------------------------------------------------ records

const LIFECYCLE_STATE: Readonly<Record<string, string>> = {
  "merge_request.opened": "opened",
  "merge_request.reopened": "opened",
  "merge_request.merged": "merged",
  "merge_request.closed": "closed",
}

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

const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v)
const text = (v: unknown): string | null => (typeof v === "string" ? v : null)

/** Kanflow projects the event's work items name (02 §5.7 work_items). */
function projectsNamed(e: GitStationEvent): Set<string> {
  return new Set(e.work_items.filter((w) => w.provider === "kanflow").map((w) => w.project_id))
}

/** True when the event names a work item of this Kanflow project. */
export function namesProject(e: GitStationEvent, projectId: string): boolean {
  return projectsNamed(e).has(projectId)
}

type MergeRequestState = DevMergeRequest

function fromSnapshot(mr: GitStationMergeRequest, now: Date): MergeRequestState | null {
  if (!isObject(mr)) return null
  const state = kanflowState(mr.state)
  if (!state || !Number.isInteger(mr.iid) || typeof mr.title !== "string" || typeof mr.url !== "string") return null
  return {
    ref: String(mr.iid),
    title: mr.title,
    state,
    url: mr.url,
    sourceBranch: text(mr.source_branch) ?? "",
    author: text(mr.author?.name) ?? null,
    updatedAt: text(mr.updated_at) ?? now.toISOString(),
    mergedAt: state === "merged" ? text(mr.merged_at) : null,
  }
}

/**
 * Folds one merge_request.* event onto what is known of the merge request; null = cannot tell its
 * state. The state comes from the lifecycle events (opened / reopened / merged / closed) only; any
 * other event keeps the known state, and its `data.state` is used only when nothing is known yet.
 */
function applyMergeRequestEvent(prev: MergeRequestState | undefined, e: GitStationEvent): MergeRequestState | null {
  const d = e.data
  const iid = d.iid
  if (typeof iid !== "number" || !Number.isInteger(iid)) return null
  const state = LIFECYCLE_STATE[e.type] ?? prev?.state ?? kanflowState(d.state)
  if (!state) return null
  const title = text(d.title) ?? prev?.title
  const url = text(d.url) ?? prev?.url
  if (title === undefined || url === undefined) return null
  const mergedAt = state === "merged" ? (text(d.merged_at) ?? (e.type === "merge_request.merged" ? e.occurred_at : (prev?.mergedAt ?? null))) : null
  return {
    ref: String(iid),
    title,
    state,
    url,
    sourceBranch: text(d.source_branch) ?? prev?.sourceBranch ?? "",
    author: (isObject(d.author) ? text(d.author.name) : null) ?? prev?.author ?? null,
    updatedAt: e.occurred_at,
    mergedAt,
  }
}

function commitFromEvent(e: GitStationEvent): DevCommit | null {
  const d = e.data
  const sha = text(d.sha)
  const url = text(d.url)
  const message = text(d.message) ?? text(d.title)
  if (!sha || !url || message === null) return null
  return {
    sha,
    title: text(d.title) ?? message.split("\n")[0],
    message,
    url,
    author: text(d.author_name) ?? "",
    committedAt: text(d.committed_at) ?? e.occurred_at,
  }
}

/** A Kanflow repository a feed read is routed to. */
export interface FeedRepository {
  id: string
  repoPath: string
  projectId: string
}

export interface RoutedRead {
  changes: Map<string, DevChanges>
  /** Events routed to each repository (logged when a repository is skipped). */
  eventCounts: Map<string, number>
}

const SAMPLES = 5

/**
 * Routes one read to its Kanflow repositories: each gets its re-read merge requests first, then the
 * events in feed order whose `data.project` is its path AND whose work items name its own Kanflow
 * project (a later event wins: opened → closed in one poll ends closed). Event types Kanflow does
 * not use are skipped (02 §5.8). Logged once per read, with samples: events Kanflow cannot use,
 * events naming one of these projects that match none of their repositories, re-read items that do
 * not parse.
 */
export function routeFeed(read: FeedRead, repositories: readonly FeedRepository[], now: Date, context: Record<string, unknown> = {}): RoutedRead {
  const byPath = new Map<string, FeedRepository[]>()
  for (const r of repositories) byPath.set(lower(r.repoPath), [...(byPath.get(lower(r.repoPath)) ?? []), r])
  const projects = new Set(repositories.map((r) => r.projectId))
  const mrs = new Map<string, Map<string, MergeRequestState>>()
  const commits = new Map<string, Map<string, DevCommit>>()
  const eventCounts = new Map<string, number>()
  let unparsedSnapshot = 0
  for (const r of repositories) {
    const own = new Map<string, MergeRequestState>()
    for (const mr of read.snapshots.get(lower(r.repoPath)) ?? []) {
      const parsed = fromSnapshot(mr, now)
      if (parsed) own.set(parsed.ref, parsed)
      else unparsedSnapshot++
    }
    mrs.set(r.id, own)
    commits.set(r.id, new Map())
    eventCounts.set(r.id, 0)
  }

  const unusable: { id: string; type: string }[] = []
  const unrouted: { id: string; path: string | null }[] = []
  for (const e of read.events) {
    const mergeRequest = isMergeRequestEvent(e)
    if (!mergeRequest && e.type !== "commit.linked") continue
    const path = text(e.data.project)
    const named = projectsNamed(e)
    const targets = path === null ? [] : (byPath.get(lower(path)) ?? []).filter((r) => named.has(r.projectId))
    if (targets.length === 0) {
      if ([...named].some((p) => projects.has(p))) unrouted.push({ id: e.id, path })
      continue
    }
    let usable = true
    for (const r of targets) {
      eventCounts.set(r.id, (eventCounts.get(r.id) ?? 0) + 1)
      if (mergeRequest) {
        const own = mrs.get(r.id)!
        const next = applyMergeRequestEvent(own.get(String(e.data.iid)), e)
        if (next) own.set(next.ref, next)
        else usable = false
      } else {
        const c = commitFromEvent(e)
        if (c) commits.get(r.id)!.set(c.sha, c)
        else usable = false
      }
    }
    if (!usable) unusable.push({ id: e.id, type: e.type })
  }
  if (unusable.length > 0) log.warn("gitstation events not usable", { ...context, count: unusable.length, samples: unusable.slice(0, SAMPLES) })
  if (unrouted.length > 0) log.warn("gitstation events match no repository", { ...context, count: unrouted.length, samples: unrouted.slice(0, SAMPLES) })
  if (unparsedSnapshot > 0) log.warn("gitstation state items not usable", { ...context, count: unparsedSnapshot })

  const changes = new Map<string, DevChanges>()
  for (const r of repositories) {
    const ownMrs = [...mrs.get(r.id)!.values()]
    const rereadFailure = read.rereadFailures.get(lower(r.repoPath))
    changes.set(r.id, {
      mergeRequests: ownMrs,
      freshMergeRequestRefs: new Set(ownMrs.map((m) => m.ref)),
      commits: [...commits.get(r.id)!.values()],
      cursor: read.cursor,
      failures: rereadFailure === undefined ? read.failures : [...read.failures, { kind: "mr", error: rereadFailure }],
    })
  }
  return { changes, eventCounts }
}

/** One repository's slice of a read (the per-repository DevSource). */
export function changesFor(read: FeedRead, repository: FeedRepository, now: Date): DevChanges {
  return routeFeed(read, [repository], now, { repositoryId: repository.id }).changes.get(repository.id)!
}

// ------------------------------------------------------------------ errors

export const NOT_BOUND_MESSAGE =
  "このリポジトリは GitStation でこのプロジェクトだけに結び付けられていません。GitStation の管理者に、このプロジェクトへの結び付けを依頼してください（結び付けが戻ると状態を取り直します）。"

/**
 * The repository is visible to the integration's service account but GitStation does not bind it to
 * exactly this Kanflow project (another one, several, or none): its state, branches and tags carry no
 * work items, so reading them here could show another project's work.
 */
export class NotBoundError extends Error {
  constructor() {
    super("GitStation repository is not bound to this Kanflow project")
    this.name = "NotBoundError"
  }
}

export const MISSING_INTEGRATION_MESSAGE = "GitStation の連携 ID が設定されていません。チーム設定の Git 連携で入れてください。"

export class MissingIntegrationError extends Error {
  constructor() {
    super("GitStation integration id is not set")
    this.name = "MissingIntegrationError"
  }
}

export function gitStationErrorMessage(err: unknown): string {
  if (err instanceof MissingIntegrationError) return MISSING_INTEGRATION_MESSAGE
  if (err instanceof NotBoundError) return NOT_BOUND_MESSAGE
  if (!(err instanceof GitStationError)) return "同期中にエラーが発生しました"
  switch (err.kind) {
    case "auth":
      return "GitStation がトークンを拒否しました（無効または期限切れ）。連携のサービスアカウントの新しいトークンを設定してください。"
    case "forbidden":
      return "連携のサービスアカウントに、このリポジトリを読む権限がありません。GitStation で連携にリポジトリを結び付けてください。"
    case "not_found":
      return "リポジトリか連携が GitStation に見つからないか、この連携からは見えません。URL と連携 ID を確認してください。"
    case "cursor_invalid":
      return CURSOR_INVALID_MESSAGE
    case "gone":
      return "GitStation のイベントの履歴の位置が無効になりました。状態を取り直します（次回の同期）。"
    case "rate_limited":
      return "GitStation の利用制限に達しました。次回の同期で再試行します。"
    case "unavailable":
      return "GitStation が一時的に利用できません。次回の同期で再試行します。"
    case "network":
      return "GitStation に接続できませんでした。次回の同期で再試行します。"
    case "invalid_response":
      return "GitStation から想定外の応答がありました。次回の同期で再試行します（続く場合は管理者に連絡してください）。"
    case "truncated":
      return "GitStation の状態の取り直しが上限（マージリクエスト 2000 件）を超えました。管理者に連絡してください。"
    case "host_not_allowed":
      return "GitStation のホストが許可されていません（GITSTATION_ALLOWED_HOSTS）。管理者に連絡してください。"
    default:
      return `GitStation がエラーを返しました（${err.status ?? "?"}）。次回の同期で再試行します。`
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

const validDate = (iso: string | null | undefined): Date | null => {
  if (!iso) return null
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? null : d
}

/** The GitStation client of a connection, or MissingIntegrationError. */
export function stationClientFor(connection: Pick<DevConnection, "apiBase" | "token" | "stationIntegrationId">, factory: GitStationClientFactory = defaultGitStationClientFactory): GitStationClient {
  const integrationId = connection.stationIntegrationId?.trim()
  if (!integrationId) throw new MissingIntegrationError()
  return factory({ apiBase: connection.apiBase, token: connection.token, integrationId })
}

export function createGitStationSource(connection: DevConnection, factory: GitStationClientFactory = defaultGitStationClientFactory): DevSource {
  const { repositoryId, repoPath, projectId } = connection
  let client: GitStationClient | null = null
  const station = () => (client ??= stationClientFor(connection, factory))
  const context = { repositoryId }

  return {
    provider: "gitstation",
    /**
     * The repository must be visible to the service account AND bound in GitStation to this Kanflow
     * project (the token is shared by every project of the integration). GitStation ids are opaque
     * strings: repositories are addressed by path (null).
     */
    async locate() {
      const project = await station().getProject(repoPath)
      // Exactly this project (02 §2 forbids binding one repository to several Kanflow projects).
      if (project.kanflow_project_ids.length !== 1 || project.kanflow_project_ids[0] !== projectId) throw new NotBoundError()
      return null
    },

    async readChanges(cursor: DevCursor, now: Date): Promise<DevChanges> {
      const read = await readFeed(station(), cursor, [repoPath], context)
      return changesFor(read, { id: repositoryId, repoPath, projectId }, now)
    },

    async listBranches(): Promise<DevBranchListing> {
      const r = await station().listBranches(repoPath, "pbi", MAX_BRANCH_PAGES)
      if (r.truncated) log.warn("git sync truncated", { repositoryId, kind: "branch", pages: MAX_BRANCH_PAGES, markedGone: false })
      return {
        items: r.items
          .filter((b) => typeof b?.name === "string" && typeof b.url === "string")
          .map((b) => ({ name: b.name, url: b.url, headTitle: text(b.commit?.title), headAuthor: text(b.commit?.author_name), headCommittedAt: text(b.commit?.committed_at) })),
        complete: !r.truncated,
      }
    },

    /** Pipelines reach the feed in M4 (02 §5.8 段階); until then there is no status to show. */
    pipelineStatus: async () => null,

    async listReleaseTags(_webUrl: string, now: Date): Promise<DevReleaseListing> {
      const r = await station().listTags(repoPath, MAX_TAG_PAGES)
      const drafts = r.items
        .filter((t) => typeof t?.name === "string" && typeof t.url === "string")
        .map((t) => ({
          tag: t.name,
          name: text(t.release?.name),
          description: text(t.release?.description),
          url: t.url,
          releasedAt: validDate(t.release?.released_at) ?? validDate(t.commit?.committed_at) ?? now,
        }))
      return { drafts, complete: !r.truncated }
    },

    describeError: describeGitStationError,
  }
}

export const gitStationSourceKind: DevSourceKind = {
  provider: "gitstation",
  actorName: "GitStation",
  readsRepositoryFiles: false,
  cursors: gitStationCursorCodec,
  connect: (connection: DevConnection, clients?: DevClients) => createGitStationSource(connection, clients?.gitstation),
}
