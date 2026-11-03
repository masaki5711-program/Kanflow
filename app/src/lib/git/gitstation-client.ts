import { logger } from "@/lib/logger"
import { stationAllowedHosts } from "@/lib/git/repo-url"

/**
 * Minimal GitStation REST client (`/api/v1`, plan 02 §5.1 / §5.2 / §5.7 / §11.2) for the
 * read-only integration feed. Authenticated with the integration's service-account token
 * (`Authorization: Bearer …`). Every call has a timeout, never follows a redirect (the token
 * must not travel to another host), bounded pagination, and maps GitStation's answers to
 * GitStationError kinds the sync can explain.
 *
 * Shapes marked "assumed" in docs/integration/gitstation-contract-proposal.md are not yet in
 * plan 02; the fake GitStation in the tests pins them.
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

/** One feed event (plan 02 §5.7). `data` is per type; unknown types are skipped by the source. */
export interface GitStationEvent {
  cursor: string
  id: string
  type: string
  occurred_at: string
  work_items: { provider: string; project_id: string; ref: string }[]
  data: Record<string, unknown>
}

export interface GitStationFeedPage {
  events: GitStationEvent[]
  nextCursor: string
  hasMore: boolean
}

/** A merge request as the dev-status listing returns it (assumed integration-scoped listing). */
export interface GitStationMergeRequest {
  project: string
  iid: number
  title: string
  state: string
  source_branch: string
  url: string
  author?: { name?: string | null } | null
  updated_at?: string | null
  merged_at?: string | null
}

export interface GitStationBranch {
  name: string
  url: string
  commit?: { title?: string | null; author_name?: string | null; committed_at?: string | null } | null
}

export interface GitStationTag {
  name: string
  url: string
  commit?: { committed_at?: string | null } | null
  release?: { name?: string | null; description?: string | null; released_at?: string | null } | null
}

export interface GitStationProject {
  id: string
  path: string
  web_url: string
  default_branch: string | null
  /** Kanflow projects the repository is bound to in GitStation (assumed field; 02 §2 binding). */
  kanflow_project_ids: string[]
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
const LIST_LIMIT = 100
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

async function errorBody(res: Response): Promise<{ error_code?: string; reason?: string }> {
  try {
    const body = (await res.json()) as unknown
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

/** One feed event of the expected shape (02 §5.7), else null. */
function parseEvent(v: unknown): GitStationEvent | null {
  if (!isObject(v) || !str(v.id) || !str(v.type) || !str(v.occurred_at) || !isObject(v.data)) return null
  const workItems = Array.isArray(v.work_items) ? v.work_items.filter((w): w is GitStationEvent["work_items"][number] => isObject(w) && str(w.provider) && str(w.project_id)) : []
  return { cursor: str(v.cursor) ? v.cursor : "", id: v.id, type: v.type, occurred_at: v.occurred_at, work_items: workItems, data: v.data }
}

export function createGitStationClient({ apiBase, token, integrationId, fetchImpl = fetch, timeoutMs = TIMEOUT_MS, sleep = realSleep, allowedHosts = stationAllowedHosts() }: GitStationClientOptions) {
  type Query = Record<string, string | number | undefined>
  assertAllowedBase(apiBase, allowedHosts)
  const integration = encodeURIComponent(integrationId)

  async function sendOnce(path: string, query: Query): Promise<Response> {
    const url = new URL(`${apiBase}/api/v1${path}`)
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

  async function list<T>(path: string, key: string, query: Query, maxPages: number): Promise<Listing<T>> {
    const items: T[] = []
    let cursor: string | undefined
    for (let page = 0; page < maxPages; page++) {
      const body = await send(path, { ...query, cursor, limit: LIST_LIMIT })
      if (!isObject(body) || !Array.isArray(body[key])) throw new GitStationError("invalid_response", `GitStation ${key} listing has an unexpected shape`)
      items.push(...(body[key] as T[]))
      const next = body.next_cursor
      if (body.has_more !== true) return { items, truncated: false }
      if (!validCursor(next) || next === cursor) throw new GitStationError("invalid_response", `GitStation ${key} listing has no usable next cursor`)
      cursor = next
    }
    return { items, truncated: true }
  }

  const projectPath = (path: string) => `/projects/${encodeURIComponent(path)}`

  return {
    /** Events after `after` (null = from the beginning the integration may see). */
    async events(after: string | null, limit = FEED_PAGE_LIMIT): Promise<GitStationFeedPage & { malformed: number; malformedSamples: { id: string | null; type: string | null }[] }> {
      return feedPage(await send(`/integrations/${integration}/events`, { after: after ?? undefined, limit }))
    },

    /** The position of the last event the integration may see (plan 02 §11.2: the 410 recovery starts here). */
    async headCursor(): Promise<string> {
      const body = await send(`/integrations/${integration}/events/cursor`, {})
      if (!isObject(body) || !validCursor(body.cursor)) throw new GitStationError("invalid_response", "GitStation cursor has an unexpected shape")
      return body.cursor
    },

    /** Every merge request of one repository, any state (assumed integration-scoped dev-status listing). */
    listMergeRequests(project: string, maxPages: number): Promise<Listing<GitStationMergeRequest>> {
      return list(`/integrations/${integration}/dev_status`, "merge_requests", { project, state: "all" }, maxPages)
    },

    async getProject(path: string): Promise<GitStationProject> {
      const body = await send(projectPath(path), {})
      if (!isObject(body) || !str(body.id) || !str(body.path) || !str(body.web_url)) throw new GitStationError("invalid_response", "GitStation project has an unexpected shape")
      const bound = Array.isArray(body.kanflow_project_ids) ? body.kanflow_project_ids.filter(str) : []
      return { id: body.id, path: body.path, web_url: body.web_url, default_branch: str(body.default_branch) ? body.default_branch : null, kanflow_project_ids: bound }
    },

    listBranches(path: string, search: string, maxPages: number): Promise<Listing<GitStationBranch>> {
      return list(`${projectPath(path)}/branches`, "branches", { search }, maxPages)
    },

    listTags(path: string, maxPages: number): Promise<Listing<GitStationTag>> {
      return list(`${projectPath(path)}/tags`, "tags", {}, maxPages)
    },
  }
}

export type GitStationClient = ReturnType<typeof createGitStationClient>
