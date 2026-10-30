import { createGitLabClient, GitLabError, type GitLabBranch, type GitLabClient, type GitLabCommit, type GitLabMergeRequest } from "@/lib/git/gitlab-client"
import { logger } from "@/lib/logger"
import type {
  DevBranch,
  DevBranchListing,
  DevChanges,
  DevClients,
  DevCommit,
  DevConnection,
  DevCursor,
  DevCursorCodec,
  DevListingFailure,
  DevMergeRequest,
  DevSource,
  DevSourceErrorInfo,
  DevSourceKind,
} from "./dev-source"
import { readGitLabReleaseTags } from "./gitlab-release-tags"
import { cursorsFromRow, cursorsToRow, DAY_MS, INITIAL_WINDOW_SEC, resetForResync, type CommitScan, type CursorColumns, type SyncCursors } from "./git-sync-cursors"
import { COMMIT_LAG_MS, MAX_COMMIT_LISTINGS, MAX_LOOKBACK_LISTINGS, readMergeRequests, scanCommits } from "./git-sync-listings"

/**
 * GitLabSource: the DevSource of GitLab (REST v4, read_api, polling — GitLab
 * cannot reach the LAN, so no webhooks). Merge requests by GitLab's updated_at
 * + tie-breaker, commits by resumable time windows plus a daily look-back for
 * late pushes (git-sync-cursors / git-sync-listings).
 *
 * Its opaque cursor is `SyncCursors` serialised as "gitlab:v1:<json>"; it is
 * stored in the per-listing git_repository columns (cursorsToRow), so rows
 * written before the DevSource layer, the resync and a rollback keep working.
 */
const log = logger.child({ module: "git-sync" })

export type ClientFactory = (apiBase: string, token: string) => GitLabClient
export const defaultClientFactory: ClientFactory = (apiBase, token) => createGitLabClient({ apiBase, token })

/** Daily look-back: re-read this many days of commits (late-pushed commits; docs/operations/git-integration.md). */
export const LOOKBACK_DAYS = 14
const LOOKBACK_EVERY_MS = DAY_MS

// ------------------------------------------------------------------ cursor

const CURSOR_PREFIX = "gitlab:v1:"

interface StoredScan {
  at: string
  widthSec: number
}

interface StoredCursors {
  mr: { at: string; seen: number }
  commit: StoredScan & { skips: number }
  lookback: { scan: StoredScan | null; startedAt: string | null }
}

const scanOut = (s: CommitScan): StoredScan => ({ at: s.at.toISOString(), widthSec: s.widthSec })

export function encodeGitLabCursor(c: SyncCursors): DevCursor {
  const stored: StoredCursors = {
    mr: { at: c.mr.at.toISOString(), seen: c.mr.seen },
    commit: { ...scanOut(c.commit), skips: c.commit.skips },
    lookback: { scan: c.lookback.scan ? scanOut(c.lookback.scan) : null, startedAt: c.lookback.startedAt?.toISOString() ?? null },
  }
  return `${CURSOR_PREFIX}${JSON.stringify(stored)}` as DevCursor
}

/** A cursor this source did not make (another provider's, or corrupted) is an error, never "start over". */
export class InvalidCursorError extends Error {
  constructor(reason: string) {
    super(`not a GitLab sync cursor: ${reason}`)
    this.name = "InvalidCursorError"
  }
}

function dateIn(v: unknown, field: string): Date {
  const d = typeof v === "string" ? new Date(v) : null
  if (!d || Number.isNaN(d.getTime())) throw new InvalidCursorError(`${field} is not a date`)
  return d
}

function intIn(v: unknown, field: string): number {
  if (typeof v !== "number" || !Number.isInteger(v) || v < 0) throw new InvalidCursorError(`${field} is not a count`)
  return v
}

function scanIn(v: unknown, field: string): CommitScan {
  const s = (v ?? {}) as Partial<StoredScan>
  return { at: dateIn(s.at, `${field}.at`), widthSec: intIn(s.widthSec, `${field}.widthSec`) }
}

export function decodeGitLabCursor(cursor: string): SyncCursors {
  if (!cursor.startsWith(CURSOR_PREFIX)) throw new InvalidCursorError("unknown prefix")
  let raw: Partial<StoredCursors>
  try {
    raw = JSON.parse(cursor.slice(CURSOR_PREFIX.length)) as Partial<StoredCursors>
  } catch {
    throw new InvalidCursorError("malformed JSON")
  }
  const lookback = raw.lookback ?? { scan: null, startedAt: null }
  return {
    mr: { at: dateIn(raw.mr?.at, "mr.at"), seen: intIn(raw.mr?.seen, "mr.seen") },
    commit: { ...scanIn(raw.commit, "commit"), skips: intIn(raw.commit?.skips, "commit.skips") },
    lookback: {
      scan: lookback.scan ? scanIn(lookback.scan, "lookback.scan") : null,
      startedAt: lookback.startedAt ? dateIn(lookback.startedAt, "lookback.startedAt") : null,
    },
  }
}

export const gitLabCursorCodec: DevCursorCodec = {
  fromRow: (row, now) => encodeGitLabCursor(cursorsFromRow(row as Partial<CursorColumns>, now)),
  toRow: (cursor) => cursorsToRow(decodeGitLabCursor(cursor)),
  restart: (cursor, now) => encodeGitLabCursor(resetForResync(decodeGitLabCursor(cursor), now)),
}

// ------------------------------------------------------------------ records

export const toDevMergeRequest = (mr: GitLabMergeRequest): DevMergeRequest => ({
  ref: String(mr.iid),
  title: mr.title,
  state: mr.state,
  url: mr.web_url,
  sourceBranch: mr.source_branch,
  author: mr.author?.name ?? mr.author?.username ?? null,
  updatedAt: mr.updated_at,
  mergedAt: mr.merged_at,
})

export const toDevCommit = (c: GitLabCommit): DevCommit => ({
  sha: c.id,
  title: c.title,
  message: c.message,
  url: c.web_url,
  author: c.author_name,
  committedAt: c.committed_date,
})

export const toDevBranch = (b: GitLabBranch): DevBranch => ({
  name: b.name,
  url: b.web_url,
  headTitle: b.commit?.title ?? null,
  headAuthor: b.commit?.author_name ?? null,
  headCommittedAt: b.commit?.committed_date ?? null,
})

// ------------------------------------------------------------------ errors

/** 403 on code / merge requests: the token is valid but its owner's role (e.g. Guest) cannot read them. */
export const FORBIDDEN_MESSAGE =
  "トークンの持ち主に、このリポジトリのコードやマージリクエストを読む権限がありません（GitLab のロールが「ゲスト」など）。" +
  "GitLab でレポーター以上のロールを付けてもらうか、レポーター以上の人のトークン（read_api）を設定してください。"

/** Japanese message stored on the repository (shown in settings and on the Git page). */
export function syncErrorMessage(err: unknown): string {
  if (!(err instanceof GitLabError)) return "同期中にエラーが発生しました"
  switch (err.kind) {
    case "auth":
      return "GitLab がトークンを拒否しました（無効または期限切れ）。read_api 権限の新しいトークンを設定してください。"
    case "forbidden":
      return FORBIDDEN_MESSAGE
    case "not_found":
      return "リポジトリが見つからないか、このトークンでは見えません。URL とトークンの権限を確認してください。"
    case "rate_limited":
      return "GitLab の利用制限に達しました。次回の同期で再試行します。"
    case "network":
      return "GitLab に接続できませんでした。次回の同期で再試行します。"
    default:
      return `GitLab がエラーを返しました（${err.status ?? "?"}）。次回の同期で再試行します。`
  }
}

export function describeGitLabError(error: unknown): DevSourceErrorInfo {
  if (error instanceof GitLabError) return { kind: error.kind, expected: true, status: error.status, message: syncErrorMessage(error) }
  return { kind: "http", expected: false, message: syncErrorMessage(error) }
}

// ------------------------------------------------------------------ source

/** When the branch-list-truncated warning was last logged per repository (once a day). */
const branchTruncationWarned = new Map<string, number>()

export function createGitLabSource(connection: DevConnection, factory: ClientFactory = defaultClientFactory): DevSource {
  const client = factory(connection.apiBase, connection.token)
  const { repositoryId } = connection
  let externalId = connection.externalId
  const located = async (): Promise<number> => {
    if (externalId === null) externalId = (await client.getProject(connection.repoPath)).id
    return externalId
  }

  return {
    provider: "gitlab",
    locate: located,

    /**
     * The listings of one sync, one after another but independent of each other:
     * a failing one (e.g. merge requests disabled in the project → 403) keeps its
     * cursor at its last completed page / window and the others still run.
     */
    async readChanges(cursor: DevCursor, now: Date): Promise<DevChanges> {
      const start = decodeGitLabCursor(cursor)
      const id = await located()
      const failures: DevListingFailure[] = []

      const mr = await readMergeRequests(client, id, repositoryId, start.mr)
      if (mr.error !== undefined) failures.push({ kind: "mr", error: mr.error })

      // GitLab's clock bounds the commit windows (Kanflow's may be off); Kanflow's only when GitLab sent none.
      if (!mr.serverTime) log.warn("git sync uses Kanflow's clock", { repositoryId, reason: "no usable Date header from GitLab" })
      const gitlabNow = mr.serverTime ?? now
      const forward = await scanCommits(client, id, {
        repositoryId,
        pass: "commit",
        scan: start.commit,
        skips: start.commit.skips,
        until: new Date(gitlabNow.getTime() - COMMIT_LAG_MS),
        readTo: gitlabNow,
        budget: MAX_COMMIT_LISTINGS,
      })
      if (forward.error !== undefined) failures.push({ kind: "commit", error: forward.error })
      else if (!forward.done) log.info("git sync backlog", { repositoryId, kind: "commit", cursorAt: forward.scan.at.toISOString(), windowSec: forward.scan.widthSec })
      const commit = { ...forward.scan, skips: forward.skips }

      const lookback = await readLookback(client, id, repositoryId, start.lookback, commit.at, gitlabNow)
      if (lookback.error !== undefined) failures.push({ kind: "commit-lookback", error: lookback.error })

      const startMs = start.mr.at.getTime()
      const fresh = mr.items.filter((m) => {
        const t = new Date(m.updated_at).getTime()
        return Number.isNaN(t) || t > startMs || (t === startMs && start.mr.seen === 0)
      })
      return {
        mergeRequests: mr.items.map(toDevMergeRequest),
        freshMergeRequestRefs: new Set(fresh.map((m) => String(m.iid))),
        commits: [...forward.items, ...lookback.items].map(toDevCommit),
        cursor: encodeGitLabCursor({ mr: mr.cursor, commit, lookback: lookback.state }),
        failures,
      }
    },

    async listBranches(now: Date): Promise<DevBranchListing> {
      const branches = await client.listBranches(await located(), "pbi")
      if (branches.truncated && now.getTime() - (branchTruncationWarned.get(repositoryId) ?? Number.NEGATIVE_INFINITY) >= DAY_MS) {
        branchTruncationWarned.set(repositoryId, now.getTime())
        log.warn("git sync truncated", { repositoryId, kind: "branch", pages: branches.pages, markedGone: false })
      }
      return { items: branches.items.map(toDevBranch), complete: !branches.truncated }
    },

    pipelineStatus: async (ref: string) => client.getMergeRequestPipeline(await located(), Number(ref)),

    listReleaseTags: async (webUrl: string, now: Date) => readGitLabReleaseTags(client, await located(), webUrl, now),

    describeError: describeGitLabError,
  }
}

/**
 * Look-back pass: once a day the last LOOKBACK_DAYS of commits are read again,
 * up to the forward cursor (a commit pushed days after it was made carries its
 * old date, so its window had already been read without it). 過去分を再同期
 * starts the same pass 90 days back. Bounded per sync; resumes where it stopped.
 */
async function readLookback(
  client: GitLabClient,
  externalId: number,
  repositoryId: string,
  start: SyncCursors["lookback"],
  forwardAt: Date,
  gitlabNow: Date,
): Promise<{ items: GitLabCommit[]; state: SyncCursors["lookback"]; error?: unknown }> {
  let state = start
  const due = !state.startedAt || gitlabNow.getTime() - state.startedAt.getTime() >= LOOKBACK_EVERY_MS
  if (!state.scan && due) state = { scan: { at: new Date(gitlabNow.getTime() - LOOKBACK_DAYS * DAY_MS), widthSec: INITIAL_WINDOW_SEC }, startedAt: gitlabNow }
  if (!state.scan) return { items: [], state }
  const r = await scanCommits(client, externalId, {
    repositoryId,
    pass: "commit-lookback",
    scan: state.scan,
    skips: 0,
    until: forwardAt,
    readTo: forwardAt,
    budget: MAX_LOOKBACK_LISTINGS,
  })
  if (r.done) log.info("git sync look-back done", { repositoryId, listings: r.listings, skipped: r.skipped })
  const next = { scan: r.done ? null : r.scan, startedAt: state.startedAt }
  return r.error !== undefined ? { items: r.items, state: next, error: r.error } : { items: r.items, state: next }
}

export const gitLabSourceKind: DevSourceKind = {
  provider: "gitlab",
  cursors: gitLabCursorCodec,
  connect: (connection: DevConnection, clients?: DevClients) => createGitLabSource(connection, clients?.gitlab),
}
