import { logger } from "@/lib/logger"
import { stationAllowedHosts } from "@/lib/git/repo-url"

/**
 * Minimal GitStation REST client (`/api/v1`, plan 02 §5.7 / §11.2; GitStation M3 I1c) for the
 * read-only integration feed. Authenticated with the integration's service-account token
 * (`Authorization: Bearer …`). Every call has a timeout, never follows a redirect (the token
 * must not travel to another host), bounded pagination, and maps GitStation's answers to
 * GitStationError kinds the sync can explain.
 *
 * GitStation addresses projects by numeric id only: a repository path is resolved through
 * `/namespaces/resolve`. Its API returns no web URLs; `webUrl` builds GitStation's permalinks
 * (`/-/projects/{id}/…`, which survive renames and moves). The shapes are those of GitStation
 * main at I1c (its docs/api/integration-feed.md and the OpenAPI document); the fake GitStation
 * in the tests serves the same bodies.
 */

export type GitStationErrorKind =
  | "auth" // 401
  | "forbidden" // 403
  | "not_found" // 404
  | "gone" // 410 FG-INT-0007 (reason: retention / epoch_mismatch / ahead_of_head / visible_set_changed)
  | "cursor_invalid" // 400 FG-INT-0008 (the cursor is not this integration's)
  | "rate_limited" // 429
  | "unavailable" // 503 (e.g. FG-DB-0012 while the audit seal cannot be compared)
  | "network"
  | "invalid_response"
  | "truncated" // a bounded listing had more than Kanflow reads (the state re-read cannot be trusted)
  | "host_not_allowed" // apiBase is not an https host in GITSTATION_ALLOWED_HOSTS
  | "http"

export const GONE_REASONS = ["retention", "epoch_mismatch", "ahead_of_head", "visible_set_changed"] as const
export type GoneReason = (typeof GONE_REASONS)[number]

export class GitStationError extends Error {
  constructor(
    readonly kind: GitStationErrorKind,
    message: string,
    readonly status?: number,
    readonly detail: { errorCode?: string; reason?: GoneReason | string; retryAfterSec?: number } = {},
  ) {
    super(message)
    this.name = "GitStationError"
  }
}

/**
 * One feed event (GitStation docs/api/integration-feed.md, schema_version 1). `project_id` is
 * GitStation's numeric project id; `data` is per type and carries ids, ref names and flags only —
 * never a title (merge requests are read through the API for those). Unknown types are skipped.
 */
export interface GitStationEvent {
  cursor: string
  id: string
  type: string
  occurred_at: string
  project_id: number
  work_items: { provider: string; project_id: string; ref: string }[]
  data: Record<string, unknown>
}

export interface GitStationFeedPage {
  events: GitStationEvent[]
  nextCursor: string
  hasMore: boolean
}

/** A merge request as `/projects/{id}/merge-requests[/{iid}]` returns it (MergeRequestBody). */
export interface GitStationMergeRequest {
  project_id: number
  iid: number
  title: string
  /** open | closed | merged */
  state: string
  draft?: boolean
  source_branch: string
  target_branch?: string
  author?: { username?: string | null; display_name?: string | null } | null
  created_at: string
  updated_at: string
  closed_at?: string | null
  head_sha?: string | null
}

/** One ref of `/projects/{id}/repository/refs` (RefBody). */
export interface GitStationRef {
  name: string
  full_name?: string
  type: string
  commit?: string | null
}

/** One commit of `/projects/{id}/repository/commits` (CommitBody). */
export interface GitStationCommit {
  oid: string
  author_name: string
  committed_at: string
  /** The first paragraph of the message on one line. */
  subject: string
}

/** `/namespaces/resolve?path=` of a project (moved = the path redirects to `canonical_path`). */
export interface GitStationProjectRef {
  projectId: number
  canonicalPath: string
  moved: boolean
}

/** One integration binding of a project (`/projects/{id}/integration-bindings`). */
export interface GitStationBinding {
  integrationId: string
  kind: string
  externalProjectId: string
}

export interface Listing<T> {
  items: T[]
  /** true when GitStation still had more: absence from `items` proves nothing. */
  truncated: boolean
}

type FetchLike = typeof fetch

export interface GitStationClientOptions {
  /** https://host (no path). */
  apiBase: string
  token: string
  /** GitStation's integration id (opaque string). */
  integrationId: string
  fetchImpl?: FetchLike
  timeoutMs?: number
  /** Waits before a retry of 429 / 503 (tests pass a fake). */
  sleep?: (ms: number) => Promise<void>
  /** Hosts the token may be sent to (default: GITSTATION_ALLOWED_HOSTS). */
  allowedHosts?: readonly string[]
}

const TIMEOUT_MS = 15_000
/** Retries of 429 / 503 inside one call; beyond that the next poll tries again. */
const MAX_RETRIES = 2
/** A Retry-After longer than this is not waited for inside a poll (the next poll retries). */
const MAX_RETRY_WAIT_SEC = 10
const DEFAULT_RETRY_WAIT_SEC = 1
/** Events per feed request (plan 02 §11.2: default 100, max 500). */
export const FEED_PAGE_LIMIT = 500
/** Merge requests per listing page (GitStation: limit 1..100). */
const LIST_LIMIT = 100
/** Commits per history page (GitStation max_log_page 100; a push lists at most 20 per ref). */
export const COMMIT_PAGE_LIMIT = 50
/** GitStation answers at most 2 MiB (02 §11.2); anything far larger is refused unread. */
export const MAX_RESPONSE_BYTES = 4 * 1024 * 1024
/** GitStation cursors are opaque; this only bounds what Kanflow stores and sends back. */
export const MAX_CURSOR_LENGTH = 2048

const log = logger.child({ module: "gitstation-client" })

const realSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

function retryAfterSec(res: Response): number | undefined {
  const raw = res.headers.get("retry-after")
  if (!raw) return undefined
  const n = Number(raw)
  if (Number.isFinite(n) && n >= 0) return n
  const at = Date.parse(raw)
  return Number.isNaN(at) ? undefined : Math.max(0, Math.ceil((at - Date.now()) / 1000))
}

/** An error answer's body (bounded like any other; unreadable = no detail). */
async function errorBody(res: Response): Promise<{ error_code?: string; reason?: string }> {
  try {
    const body = JSON.parse(await boundedText(res)) as unknown
    return body && typeof body === "object" ? (body as { error_code?: string; reason?: string }) : {}
  } catch {
    return {}
  }
}

const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v)
const str = (v: unknown): v is string => typeof v === "string"
const validCursor = (v: unknown): v is string => str(v) && v.length > 0 && v.length <= MAX_CURSOR_LENGTH

/** The body as text, refused (without reading the rest) beyond MAX_RESPONSE_BYTES. */
async function boundedText(res: Response): Promise<string> {
  if (Number(res.headers.get("content-length") ?? 0) > MAX_RESPONSE_BYTES) {
    await res.body?.cancel().catch(() => undefined)
    throw new GitStationError("invalid_response", "GitStation response is too large")
  }
  const reader = res.body?.getReader()
  if (!reader) return ""
  const parts: Uint8Array[] = []
  let total = 0
  for (let r = await reader.read(); !r.done; r = await reader.read()) {
    total += r.value.byteLength
    if (total > MAX_RESPONSE_BYTES) {
      await reader.cancel().catch(() => undefined)
      throw new GitStationError("invalid_response", "GitStation response is too large")
    }
    parts.push(r.value)
  }
  return Buffer.concat(parts).toString("utf8")
}

/** apiBase must be https://<host> with the host in the allow list: the token goes nowhere else. */
function assertAllowedBase(apiBase: string, hosts: readonly string[]): void {
  let url: URL
  try {
    url = new URL(apiBase)
  } catch {
    throw new GitStationError("host_not_allowed", "GitStation base URL is not a URL")
  }
  const plain = url.protocol === "https:" && !url.username && !url.password && !url.port && (url.pathname === "/" || url.pathname === "") && !url.search && !url.hash
  if (!plain || !hosts.includes(url.hostname.toLowerCase())) throw new GitStationError("host_not_allowed", "GitStation host is not in GITSTATION_ALLOWED_HOSTS")
}

const isId = (v: unknown): v is number => typeof v === "number" && Number.isSafeInteger(v) && v > 0

/** One feed event of the expected shape (integration-feed.md), else null. */
function parseEvent(v: unknown): GitStationEvent | null {
  if (!isObject(v) || !str(v.id) || !str(v.type) || !str(v.occurred_at) || !isId(v.project_id) || !isObject(v.data)) return null
  const workItems = Array.isArray(v.work_items) ? v.work_items.filter((w): w is GitStationEvent["work_items"][number] => isObject(w) && str(w.provider) && str(w.project_id) && str(w.ref)) : []
  return { cursor: str(v.cursor) ? v.cursor : "", id: v.id, type: v.type, occurred_at: v.occurred_at, project_id: v.project_id, work_items: workItems, data: v.data }
}

/** A merge request of the expected shape, else null (a listing skips it, a detail read refuses it). */
function parseMergeRequest(v: unknown): GitStationMergeRequest | null {
  if (!isObject(v) || !isId(v.project_id) || !isId(v.iid) || !str(v.title) || !str(v.state) || !str(v.source_branch) || !str(v.created_at) || !str(v.updated_at)) return null
  const author = isObject(v.author) ? { username: str(v.author.username) ? v.author.username : null, display_name: str(v.author.display_name) ? v.author.display_name : null } : null
  return {
    project_id: v.project_id,
    iid: v.iid,
    title: v.title,
    state: v.state,
    draft: v.draft === true,
    source_branch: v.source_branch,
    target_branch: str(v.target_branch) ? v.target_branch : undefined,
    author,
    created_at: v.created_at,
    updated_at: v.updated_at,
    closed_at: str(v.closed_at) ? v.closed_at : null,
    head_sha: str(v.head_sha) ? v.head_sha : null,
  }
}

const OID = /^[0-9a-f]{40}([0-9a-f]{24})?$/

/** A commit id GitStation would accept as `?ref=` (40 or 64 lower-case hex). */
export const isObjectId = (v: unknown): v is string => str(v) && OID.test(v)

export function createGitStationClient({ apiBase, token, integrationId, fetchImpl = fetch, timeoutMs = TIMEOUT_MS, sleep = realSleep, allowedHosts = stationAllowedHosts() }: GitStationClientOptions) {
  type Query = Record<string, string | number | undefined>
  assertAllowedBase(apiBase, allowedHosts)
  const integration = encodeURIComponent(integrationId)
  const base = apiBase.replace(/\/+$/, "")

  async function sendOnce(path: string, query: Query): Promise<Response> {
    const url = new URL(`${base}/api/v1${path}`)
    for (const [k, v] of Object.entries(query)) if (v !== undefined) url.searchParams.set(k, String(v))
    let res: Response
    try {
      res = await fetchImpl(url, {
        headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
        signal: AbortSignal.timeout(timeoutMs),
        cache: "no-store",
        redirect: "error",
      })
    } catch (err) {
      throw new GitStationError("network", `GitStation unreachable: ${err instanceof Error ? err.message : String(err)}`)
    }
    if (res.ok) return res
    const body = await errorBody(res)
    const errorCode = str(body.error_code) ? body.error_code.slice(0, 32) : undefined
    switch (res.status) {
      case 401:
        throw new GitStationError("auth", "GitStation rejected the token (401)", 401, { errorCode })
      case 403:
        throw new GitStationError("forbidden", "The service account may not read this (403)", 403, { errorCode })
      case 404:
        throw new GitStationError("not_found", "Not found or not visible to this integration (404)", 404, { errorCode })
      case 410: {
        const reason = str(body.reason) ? body.reason.slice(0, 32) : "unknown"
        throw new GitStationError("gone", `GitStation feed cursor is gone (410, ${reason})`, 410, { errorCode, reason })
      }
      case 400:
        if (errorCode === "FG-INT-0008") throw new GitStationError("cursor_invalid", "GitStation refused the feed cursor (400 FG-INT-0008)", 400, { errorCode })
        throw new GitStationError("http", "GitStation responded 400", 400, { errorCode })
      case 429:
        throw new GitStationError("rate_limited", "GitStation rate limit reached (429)", 429, { errorCode, retryAfterSec: retryAfterSec(res) })
      case 503:
        throw new GitStationError("unavailable", "GitStation is temporarily unavailable (503)", 503, { errorCode, retryAfterSec: retryAfterSec(res) })
      default:
        throw new GitStationError("http", `GitStation responded ${res.status}`, res.status, { errorCode })
    }
  }

  /** 429 / 503 are retried (honouring Retry-After up to MAX_RETRY_WAIT_SEC); anything else throws at once. */
  async function send(path: string, query: Query): Promise<unknown> {
    for (let attempt = 0; ; attempt++) {
      try {
        const res = await sendOnce(path, query)
        const text = await boundedText(res)
        try {
          return JSON.parse(text) as unknown
        } catch {
          throw new GitStationError("invalid_response", "GitStation sent a body that is not JSON")
        }
      } catch (err) {
        const transient = err instanceof GitStationError && (err.kind === "rate_limited" || err.kind === "unavailable")
        const wait = transient ? (err.detail.retryAfterSec ?? DEFAULT_RETRY_WAIT_SEC) : Number.POSITIVE_INFINITY
        if (!transient || attempt >= MAX_RETRIES || wait > MAX_RETRY_WAIT_SEC) throw err
        log.warn("gitstation request retried", { status: err.status, waitSec: wait, attempt: attempt + 1 })
        await sleep(wait * 1000)
      }
    }
  }

  /** A malformed page (or cursor) is invalid_response — never stored, never mistaken for "resync". */
  function feedPage(body: unknown): GitStationFeedPage & { malformed: number; malformedSamples: { id: string | null; type: string | null }[] } {
    if (!isObject(body) || !Array.isArray(body.events) || !validCursor(body.next_cursor) || typeof body.has_more !== "boolean") {
      throw new GitStationError("invalid_response", "GitStation feed page has an unexpected shape")
    }
    const events: GitStationEvent[] = []
    let malformed = 0
    const malformedSamples: { id: string | null; type: string | null }[] = []
    for (const raw of body.events) {
      const e = parseEvent(raw)
      if (e) {
        events.push(e)
        continue
      }
      malformed++
      // Id and type when the event has them (bounded), so the event can be found in GitStation.
      if (malformedSamples.length < 5) {
        const r = isObject(raw) ? raw : {}
        malformedSamples.push({ id: str(r.id) ? r.id.slice(0, 64) : null, type: str(r.type) ? r.type.slice(0, 64) : null })
      }
    }
    return { events, nextCursor: body.next_cursor, hasMore: body.has_more, malformed, malformedSamples }
  }

  const projectBase = (projectId: number) => {
    if (!isId(projectId)) throw new GitStationError("invalid_response", "not a GitStation project id")
    return `/projects/${projectId}`
  }

  return {
    /** Events after `cursor` (GitStation's `next_cursor` / head cursor, sent back unchanged). */
    async events(cursor: string, limit = FEED_PAGE_LIMIT): Promise<GitStationFeedPage & { malformed: number; malformedSamples: { id: string | null; type: string | null }[] }> {
      return feedPage(await send(`/integrations/${integration}/events`, { cursor, limit }))
    },

    /** The position of the last event the integration may see (plan 02 §11.2: the 410 recovery starts here). */
    async headCursor(): Promise<string> {
      const body = await send(`/integrations/${integration}/events/cursor`, {})
      if (!isObject(body) || !validCursor(body.cursor)) throw new GitStationError("invalid_response", "GitStation cursor has an unexpected shape")
      return body.cursor
    },

    /** The project a repository path names (a moved path resolves to the project it moved to); 404 = none visible. */
    async resolveProject(path: string): Promise<GitStationProjectRef> {
      const body = await send(`/namespaces/resolve`, { path })
      if (!isObject(body) || !str(body.kind)) throw new GitStationError("invalid_response", "GitStation path resolution has an unexpected shape")
      // A group path is no repository.
      if (body.kind !== "project") throw new GitStationError("not_found", "The path names a group, not a project (404)", 404)
      if (!isId(body.project_id) || !str(body.canonical_path)) throw new GitStationError("invalid_response", "GitStation path resolution has an unexpected shape")
      return { projectId: body.project_id, canonicalPath: body.canonical_path, moved: body.moved === true }
    },

    /** The integrations a project is bound to (0..1 per integration kind). */
    async bindings(projectId: number): Promise<GitStationBinding[]> {
      const body = await send(`${projectBase(projectId)}/integration-bindings`, {})
      if (!isObject(body) || !Array.isArray(body.items)) throw new GitStationError("invalid_response", "GitStation bindings have an unexpected shape")
      return body.items.flatMap((b) =>
        isObject(b) && (isId(b.integration_id) || str(b.integration_id)) && str(b.kind) && str(b.external_project_id)
          ? [{ integrationId: String(b.integration_id), kind: b.kind, externalProjectId: b.external_project_id }]
          : [],
      )
    },

    /**
     * Every merge request of one project, any state, newest first (`before=<iid>` pages). Items of
     * an unexpected shape are counted in `skipped`, not returned.
     */
    async listMergeRequests(projectId: number, maxPages: number): Promise<Listing<GitStationMergeRequest> & { skipped: number }> {
      const items: GitStationMergeRequest[] = []
      let skipped = 0
      let before: number | undefined
      for (let page = 0; page < maxPages; page++) {
        const body = await send(`${projectBase(projectId)}/merge-requests`, { state: "all", limit: LIST_LIMIT, before })
        if (!isObject(body) || !Array.isArray(body.merge_requests)) throw new GitStationError("invalid_response", "GitStation merge request listing has an unexpected shape")
        for (const raw of body.merge_requests) {
          const mr = parseMergeRequest(raw)
          // Another project's item is never taken (its link would point there).
          if (mr && mr.project_id === projectId) items.push(mr)
          else skipped++
        }
        const next = body.next_before
        if (next === null || next === undefined) return { items, truncated: false, skipped }
        if (!isId(next) || (before !== undefined && next >= before)) throw new GitStationError("invalid_response", "GitStation merge request listing has no usable next page")
        before = next
      }
      return { items, truncated: true, skipped }
    },

    async getMergeRequest(projectId: number, iid: number): Promise<GitStationMergeRequest> {
      if (!isId(iid)) throw new GitStationError("invalid_response", "not a merge request iid")
      const mr = parseMergeRequest(await send(`${projectBase(projectId)}/merge-requests/${iid}`, {}))
      if (!mr || mr.project_id !== projectId || mr.iid !== iid) throw new GitStationError("invalid_response", "GitStation merge request has an unexpected shape")
      return mr
    },

    /** Branches or tags of a project (GitStation lists up to its cap, without paging: `truncated` = cut short). */
    async refs(projectId: number, type: "branch" | "tag"): Promise<Listing<GitStationRef>> {
      const body = await send(`${projectBase(projectId)}/repository/refs`, { type })
      if (!isObject(body) || !Array.isArray(body.refs) || typeof body.truncated !== "boolean") throw new GitStationError("invalid_response", "GitStation refs have an unexpected shape")
      const items = body.refs.flatMap((r) => (isObject(r) && str(r.name) && str(r.type) ? [{ name: r.name, full_name: str(r.full_name) ? r.full_name : undefined, type: r.type, commit: str(r.commit) ? r.commit : null }] : []))
      return { items, truncated: body.truncated }
    },

    /** The newest commits reachable from `oid` (one page). */
    async commits(projectId: number, oid: string, limit = COMMIT_PAGE_LIMIT): Promise<GitStationCommit[]> {
      if (!isObjectId(oid)) throw new GitStationError("invalid_response", "not a commit id")
      const body = await send(`${projectBase(projectId)}/repository/commits`, { ref: oid, limit })
      if (!isObject(body) || !Array.isArray(body.commits)) throw new GitStationError("invalid_response", "GitStation commits have an unexpected shape")
      return body.commits.flatMap((c) => (isObject(c) && str(c.oid) && str(c.subject) && str(c.committed_at) ? [{ oid: c.oid.toLowerCase(), subject: c.subject, committed_at: c.committed_at, author_name: str(c.author_name) ? c.author_name : "" }] : []))
    },

    /** GitStation's permalink of a project page (`/-/projects/{id}/<segments>`: survives renames). */
    webUrl(projectId: number, ...segments: string[]): string {
      // Dot segments are dropped: a name can never walk the link to another page.
      const tail = segments
        .flatMap((s) => s.split("/"))
        .filter((s) => s !== "" && s !== "." && s !== "..")
        .map(encodeURIComponent)
        .join("/")
      return `${base}/-/projects/${projectId}${tail ? `/${tail}` : ""}`
    },
  }
}

export type GitStationClient = ReturnType<typeof createGitStationClient>
