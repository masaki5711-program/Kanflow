import { createGitStationClient, GitStationError, type GitStationClient, type GitStationClientOptions, type GitStationEvent, type GitStationMergeRequest } from "@/lib/git/gitstation-client"
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
 * position ("gitstation:v1:", first read or 過去分を再同期) reads the feed from its beginning —
 * everything GitStation still keeps (retention: 90 days by default), commits included.
 * A 410 (retention / epoch_mismatch / ahead_of_head / visible_set_changed) is recovered as
 * 02 §11.2 prescribes, logged — never a silent jump: take `/events/cursor` first, re-read every
 * repository's merge requests through the dev-status listing (`state=all`), then read the feed
 * from the position taken first. A 400 FG-INT-0008 keeps the position and asks for 過去分を再同期.
 *
 * Only events that name a work item of the repository's OWN Kanflow project are taken
 * (`work_items[].project_id`), whatever repository path they carry: another project registering
 * the same path never sees them.
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
const MAX_STATION_CURSOR = 2048

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
  /** Events in feed order, each id once. */
  events: GitStationEvent[]
  /** Re-read merge requests per repository path (lower case) after a 410 recovery. */
  snapshots: Map<string, GitStationMergeRequest[]>
  /** Where the next read continues; never past anything not returned. */
  cursor: DevCursor
  failures: DevListingFailure[]
  /** Why the state was re-read in this read (the 410 reason), else null. */
  restarted: string | null
}

const lower = (path: string) => path.toLowerCase()

async function rereadState(client: GitStationClient, paths: readonly string[], context: Record<string, unknown>) {
  const failures: DevListingFailure[] = []
  const snapshots = new Map<string, GitStationMergeRequest[]>()
  let head: string
  try {
    // 02 §11.2: the position first, so nothing that happens during the re-read is skipped.
    head = await client.headCursor()
  } catch (error) {
    return { head: null, snapshots, failures: [{ kind: "feed" as const, error }] }
  }
  for (const path of new Set(paths.map(lower))) {
    try {
      const listing = await client.listMergeRequests(path, MAX_STATE_PAGES)
      if (listing.truncated) log.warn("gitstation state re-read truncated", { ...context, pages: MAX_STATE_PAGES })
      snapshots.set(path, listing.items)
    } catch (error) {
      failures.push({ kind: "mr", error })
    }
  }
  return { head, snapshots, failures }
}

/**
 * One read of the feed for the given repository paths, up to MAX_FEED_PAGES (from the beginning
 * when the position is empty); a 410 is recovered by re-reading the state. Never throws for GitStation's answers
 * (they are `failures`); the returned cursor only moves past what was returned.
 */
export async function readFeed(client: GitStationClient, cursor: DevCursor, paths: readonly string[], context: Record<string, unknown> = {}): Promise<FeedRead> {
  let after = decodeStationCursor(cursor)
  let restarted: string | null = null
  let snapshots = new Map<string, GitStationMergeRequest[]>()
  const failures: DevListingFailure[] = []

  const restart = async (why: string): Promise<boolean> => {
    const state = await rereadState(client, paths, context)
    snapshots = state.snapshots
    if (state.failures.length > 0 || state.head === null) {
      failures.push(...state.failures)
      return false
    }
    after = state.head
    restarted = why
    return true
  }

  const events: GitStationEvent[] = []
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
          // The re-read state replaces what the events read so far said about merge requests
          // (they are older than it); linked commits are not in the state, so they stay.
          const kept = events.filter((e) => !String(e.type).startsWith("merge_request."))
          events.length = 0
          events.push(...kept)
          page = -1 // read from the new position with a fresh page budget
          continue
        }
        // The old position is gone: the next read recovers again (it is kept, so it answers 410 again).
        return { events: events.filter((e) => !String(e.type).startsWith("merge_request.")), snapshots, cursor: encodeStationCursor(after), failures, restarted }
      }
      failures.push({ kind: "feed", error })
      break
    }
    for (const e of result.events) {
      // At least once (02 §11.2): the same event may come again; keep it once.
      if (!e || typeof e !== "object" || typeof e.id !== "string") {
        malformed++
        continue
      }
      if (seen.has(e.id)) continue
      seen.add(e.id)
      events.push(e)
    }
    after = result.nextCursor
    more = result.hasMore
  }
  if (malformed > 0) log.warn("gitstation events without an id skipped", { ...context, count: malformed })
  if (more && failures.length === 0) log.info("git sync backlog", { ...context, kind: "feed" })
  return { events, snapshots, cursor: encodeStationCursor(after), failures, restarted }
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

/** True when the event names a work item of this Kanflow project (02 §5.7 work_items). */
export function namesProject(e: GitStationEvent, projectId: string): boolean {
  return Array.isArray(e.work_items) && e.work_items.some((w) => isObject(w) && w.provider === "kanflow" && w.project_id === projectId)
}

function eventProject(e: GitStationEvent): string | null {
  return isObject(e.data) ? text(e.data.project) : null
}

type MergeRequestState = DevMergeRequest

function fromSnapshot(mr: GitStationMergeRequest, now: Date): MergeRequestState | null {
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

/** Folds one merge_request.* event onto what is known of the merge request; null = cannot tell its state. */
function applyMergeRequestEvent(prev: MergeRequestState | undefined, e: GitStationEvent): MergeRequestState | null {
  const d = e.data
  const iid = d.iid
  if (typeof iid !== "number" || !Number.isInteger(iid)) return null
  const state = LIFECYCLE_STATE[e.type] ?? kanflowState(d.state) ?? prev?.state ?? null
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

/**
 * The slice of one read for one Kanflow repository: re-read merge requests first, then the events
 * in feed order (a later event wins: opened → closed in one poll ends closed, closed → reopened →
 * merged ends merged). Event types Kanflow does not use are skipped (02 §5.8: unknown types too).
 */
export function changesFor(read: FeedRead, repository: { repoPath: string; projectId: string }, now: Date): DevChanges {
  const path = lower(repository.repoPath)
  const mrs = new Map<string, MergeRequestState>()
  for (const mr of read.snapshots.get(path) ?? []) {
    const r = fromSnapshot(mr, now)
    if (r) mrs.set(r.ref, r)
  }
  const commits = new Map<string, DevCommit>()
  let unusable = 0
  for (const e of read.events) {
    if (!e || typeof e.type !== "string" || typeof e.occurred_at !== "string" || !isObject(e.data)) {
      unusable++
      continue
    }
    const project = eventProject(e)
    if (project === null || lower(project) !== path || !namesProject(e, repository.projectId)) continue
    if (e.type.startsWith("merge_request.")) {
      const ref = typeof e.data.iid === "number" ? String(e.data.iid) : ""
      const next = applyMergeRequestEvent(mrs.get(ref), e)
      if (next) mrs.set(next.ref, next)
      else unusable++
    } else if (e.type === "commit.linked") {
      const c = commitFromEvent(e)
      if (c) commits.set(c.sha, c)
      else unusable++
    }
  }
  if (unusable > 0) log.warn("gitstation events not usable", { repositoryPath: path, count: unusable })
  const mergeRequests = [...mrs.values()]
  return {
    mergeRequests,
    freshMergeRequestRefs: new Set(mergeRequests.map((m) => m.ref)),
    commits: [...commits.values()],
    cursor: read.cursor,
    failures: read.failures,
  }
}

// ------------------------------------------------------------------ errors

export const NOT_BOUND_MESSAGE = "このリポジトリは GitStation でこのプロジェクトに結び付けられていません。GitStation の管理者に結び付けを依頼してください。"

/**
 * The repository is visible to the integration's service account but GitStation binds it to another
 * Kanflow project (or none): reading its branches / tags here would show another project's work.
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
      return "GitStation から想定外の応答がありました。管理者に連絡してください。"
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
    return { kind: error.kind, expected: error.kind !== "invalid_response" && error.kind !== "http", status: error.status, message: gitStationErrorMessage(error) }
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
      if (!project.kanflow_project_ids.includes(projectId)) throw new NotBoundError()
      return null
    },

    async readChanges(cursor: DevCursor, now: Date): Promise<DevChanges> {
      const read = await readFeed(station(), cursor, [repoPath], context)
      return changesFor(read, { repoPath, projectId }, now)
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
