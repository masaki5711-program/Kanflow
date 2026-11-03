import type { GitStationBranch, GitStationEvent, GitStationMergeRequest, GitStationTag } from "@/lib/git/gitstation-client"

/**
 * An in-memory GitStation for the tests: the integration feed (plan 02 §5.7 / §11.2), its head
 * cursor, the dev-status listing and the project / branch / tag reads, behind a `fetch`. It keeps
 * the contract's promises: events in order, opaque cursors (Kanflow must not read them), the same
 * events from the same cursor, Bearer service-account token, and the error answers (410 with a
 * reason, 400 FG-INT-0008, 429 / 503 with Retry-After) on demand.
 *
 * The shapes marked "assumed" in docs/integration/gitstation-contract-proposal.md are pinned here.
 */
export const STATION = "https://gitstation.example"
export const INTEGRATION = "int_7"
export const TOKEN = "gst_service_account_token"
export const PROJECT_ID = "p1"
export const REPO = "app/portal"

interface Scripted {
  /** Path prefix after /api/v1 (e.g. "/integrations/int_7/events"). */
  path: string
  status: number
  body?: unknown
  headers?: Record<string, string>
  times: number
}

/** Opaque cursor: Kanflow stores it and hands it back, never parses it. */
const cursorOf = (seq: number) => `aead.${Buffer.from(`seq:${seq}`).toString("base64url")}`
const seqOf = (cursor: string | null): number => {
  if (!cursor) return 0
  const m = /^aead\.(.+)$/.exec(cursor)
  if (!m) return -1
  const raw = Buffer.from(m[1], "base64url").toString()
  const n = Number(raw.replace(/^seq:/, ""))
  return Number.isInteger(n) ? n : -1
}

export function createFakeGitStation(options: { pageSize?: number } = {}) {
  const pageSize = options.pageSize ?? 500
  const events: GitStationEvent[] = []
  const mergeRequests = new Map<string, GitStationMergeRequest>()
  const branches = new Map<string, GitStationBranch[]>()
  const tags = new Map<string, GitStationTag[]>()
  /** Repository path → Kanflow projects it is bound to in GitStation. */
  const projects = new Map<string, string[]>([[REPO, [PROJECT_ID]]])
  const scripted: Scripted[] = []
  const requests: string[] = []
  let seq = 0

  const workItem = (ref: string, projectId = PROJECT_ID) => [{ provider: "kanflow", project_id: projectId, ref }]

  function push(type: string, data: Record<string, unknown>, workItems = workItem("PBI-1"), id?: string): GitStationEvent {
    seq++
    const e: GitStationEvent = { cursor: cursorOf(seq), id: id ?? `evt_${seq}`, type, occurred_at: new Date(Date.UTC(2026, 9, 1, 0, seq)).toISOString(), work_items: workItems, data }
    events.push(e)
    return e
  }

  /** A merge request event; also moves the merge request's current state (dev-status listing). */
  function mergeRequest(type: string, iid: number, extra: Partial<GitStationMergeRequest> & { project?: string } = {}, workItems = workItem("PBI-1")): GitStationEvent {
    const project = extra.project ?? REPO
    const key = `${project}!${iid}`
    const prev = mergeRequests.get(key)
    const state =
      type === "merge_request.merged" ? "merged" : type === "merge_request.closed" ? "closed" : type === "merge_request.opened" || type === "merge_request.reopened" ? "open" : (prev?.state ?? "open")
    const at = new Date(Date.UTC(2026, 9, 1, 0, seq + 1)).toISOString()
    const mr: GitStationMergeRequest = {
      project,
      iid,
      title: extra.title ?? prev?.title ?? `Login form (PBI-1)`,
      state,
      source_branch: extra.source_branch ?? prev?.source_branch ?? "feature/PBI-1-login-form",
      url: `${STATION}/${project}/-/merge_requests/${iid}`,
      author: { name: "Dev One" },
      updated_at: at,
      merged_at: state === "merged" ? (prev?.merged_at ?? at) : null,
    }
    mergeRequests.set(key, mr)
    return push(type, { ...mr, author: mr.author }, workItems)
  }

  function fail(path: string, status: number, body?: unknown, headers?: Record<string, string>, times = 1) {
    scripted.push({ path, status, body, headers, times })
  }

  function json(status: number, body: unknown, headers: Record<string, string> = {}): Response {
    return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } })
  }

  function list<T>(items: T[], cursor: string | null, limit: number, key: string): Response {
    const start = cursor ? Number(cursor.replace(/^p/, "")) : 0
    const page = items.slice(start, start + limit)
    const next = start + limit
    return json(200, { [key]: page, next_cursor: next < items.length ? `p${next}` : null, has_more: next < items.length })
  }

  const fetchImpl: typeof fetch = async (input, init) => {
    const url = new URL(String(input))
    requests.push(`${url.pathname}${url.search}`)
    const headers = new Headers(init?.headers)
    if (url.origin !== STATION) return json(404, {})
    if (headers.get("authorization") !== `Bearer ${TOKEN}`) return json(401, { error_code: "FG-AUTH-0001", user_message: "token", request_id: "r" })
    const path = url.pathname.replace(/^\/api\/v1/, "")
    const s = scripted.find((x) => path.startsWith(x.path) && x.times > 0)
    if (s) {
      s.times--
      return json(s.status, s.body ?? {}, s.headers)
    }
    const integrationBase = `/integrations/${INTEGRATION}`
    if (path === `${integrationBase}/events`) {
      const after = url.searchParams.get("after")
      const from = seqOf(after)
      if (from < 0) return json(400, { error_code: "FG-INT-0008", user_message: "cursor", request_id: "r" })
      const limit = Math.min(Number(url.searchParams.get("limit") ?? 100), pageSize)
      const rest = events.filter((e) => seqOf(e.cursor) > from)
      const page = rest.slice(0, limit)
      const last = page.length > 0 ? page[page.length - 1].cursor : (after ?? cursorOf(seq))
      return json(200, { events: page, next_cursor: page.length < rest.length ? last : cursorOf(seq), has_more: page.length < rest.length })
    }
    if (path === `${integrationBase}/events/cursor`) return json(200, { cursor: cursorOf(seq) })
    if (path === `${integrationBase}/dev_status`) {
      const project = url.searchParams.get("project") ?? ""
      const items = [...mergeRequests.values()].filter((m) => m.project.toLowerCase() === project.toLowerCase())
      return list(items, url.searchParams.get("cursor"), Number(url.searchParams.get("limit") ?? 100), "merge_requests")
    }
    if (path.startsWith(`/integrations/`)) return json(404, { error_code: "FG-INT-0001" })
    const m = /^\/projects\/([^/]+)(\/branches|\/tags)?$/.exec(path)
    if (m) {
      const project = decodeURIComponent(m[1])
      const bound = projects.get(project)
      if (!bound) return json(404, {})
      if (m[2] === "/branches") {
        const search = (url.searchParams.get("search") ?? "").toLowerCase()
        return list((branches.get(project) ?? []).filter((b) => b.name.toLowerCase().includes(search)), url.searchParams.get("cursor"), 100, "branches")
      }
      if (m[2] === "/tags") return list(tags.get(project) ?? [], url.searchParams.get("cursor"), 100, "tags")
      return json(200, { id: `prj_${project.replace(/\W/g, "_")}`, path: project, web_url: `${STATION}/${project}`, default_branch: "main", kanflow_project_ids: bound })
    }
    return json(404, {})
  }

  return {
    fetchImpl,
    requests,
    events,
    push,
    mergeRequest,
    fail,
    workItem,
    /** A repository bound (in GitStation) to the given Kanflow projects. */
    bind: (path: string, projectIds: string[] = [PROJECT_ID]) => projects.set(path, projectIds),
    setBranches: (project: string, list: GitStationBranch[]) => branches.set(project, list),
    setTags: (project: string, list: GitStationTag[]) => tags.set(project, list),
    head: () => cursorOf(seq),
    /** Simulate GitStation pruning events (retention): the events are gone, the state stays. */
    prune: () => events.splice(0, events.length),
  }
}

export type FakeGitStation = ReturnType<typeof createFakeGitStation>
