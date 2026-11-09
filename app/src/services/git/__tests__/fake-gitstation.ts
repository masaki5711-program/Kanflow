import type { GitStationCommit, GitStationEvent, GitStationMergeRequest } from "@/lib/git/gitstation-client"

/**
 * An in-memory GitStation for the tests, serving the bodies of GitStation main at M3 I1c (its
 * docs/api/integration-feed.md, the golden example kept in ./fixtures, and the OpenAPI shapes of
 * MergeRequestBody / RefsBody / CommitsBody / IntegrationBindingList / namespace resolve) behind a
 * `fetch`. It keeps the contract's promises: events in order, opaque cursors (Kanflow must not read
 * them), the same events from the same cursor, Bearer service-account token, numeric project ids,
 * unknown query parameters refused (400 FG-WEB-0006), and the error answers (410 with a reason,
 * 400 FG-INT-0008, 429 / 503 with Retry-After) on demand. Events carry ids only — never a title.
 * Synthetic data only.
 */
export const STATION = "https://gitstation.example"
export const STATION_HOST = "gitstation.example"
/** GitStation's integration id (numeric there; Kanflow stores it as text). */
export const INTEGRATION = "7"
export const TOKEN = "fgp_service_account_token"
export const PROJECT_ID = "p1"
export const REPO = "app/portal"
/** GitStation's project id of REPO. */
export const REPO_ID = 12

interface Scripted {
  /** Path prefix after /api/v1 (e.g. "/integrations/7/events"). */
  path: string
  status: number
  body?: unknown
  headers?: Record<string, string>
  times: number
}

interface Project {
  id: number
  path: string
  bindings: { integration_id: number; kind: string; external_project_id: string }[]
}

/** Opaque cursor: Kanflow stores it and hands it back, never parses it. */
const cursorOf = (seq: number) => `aead.${Buffer.from(`seq:${seq}`).toString("base64url")}`
const seqOf = (cursor: string | null): number => {
  if (!cursor) return -1
  const m = /^aead\.(.+)$/.exec(cursor)
  if (!m) return -1
  const raw = Buffer.from(m[1], "base64url").toString()
  const n = Number(raw.replace(/^seq:/, ""))
  return Number.isInteger(n) ? n : -1
}

/** A synthetic 40-hex commit id. */
export const oid = (n: number) => `c${n.toString(16).padStart(39, "0")}`

const ALLOWED_QUERY: Record<string, string[]> = {
  events: ["cursor", "limit"],
  resolve: ["path"],
  mrs: ["state", "limit", "before"],
  refs: ["type"],
  commits: ["ref", "path", "limit", "cursor"],
  devStatus: ["cursor", "limit", "state"],
}

export function createFakeGitStation(options: { pageSize?: number; devStatusPageSize?: number } = {}) {
  const pageSize = options.pageSize ?? 500
  const devStatusPageSize = options.devStatusPageSize ?? 100
  const events: GitStationEvent[] = []
  const projects = new Map<string, Project>()
  const groups = new Set<string>(["app"])
  const moved = new Map<string, string>()
  const mergeRequests = new Map<string, GitStationMergeRequest>()
  /** Per merge request ("<project id>!<iid>"): the work items it is linked to (dev-status), and its merge time. */
  const linkedTo = new Map<string, GitStationEvent["work_items"]>()
  const mergedAt = new Map<string, string>()
  const branches = new Map<number, { name: string; commit: string }[]>()
  const tags = new Map<number, { name: string; commit: string }[]>()
  /** Per project: commits newest first (a linear history). */
  const history = new Map<number, GitStationCommit[]>()
  const scripted: Scripted[] = []
  /** Runs once, right after the head cursor was taken (activity during a state re-read). */
  let afterHead: (() => void) | null = null
  /** Projects whose merge request listing fails (403), every time. */
  const failingState = new Set<number>()
  const requests: string[] = []
  let seq = 0
  let nextProjectId = REPO_ID

  function project(path: string): Project {
    const key = path.toLowerCase()
    let p = projects.get(key)
    if (!p) {
      p = { id: nextProjectId++, path, bindings: [] }
      projects.set(key, p)
    }
    return p
  }
  /** A repository bound (in GitStation) to the given Kanflow projects through `integration`. */
  function bind(path: string, projectIds: string[] = [PROJECT_ID], integration = Number(INTEGRATION)) {
    project(path).bindings = projectIds.map((external) => ({ integration_id: integration, kind: "kanflow", external_project_id: external }))
    return project(path).id
  }
  bind(REPO)

  const workItem = (ref: string, projectId = PROJECT_ID) => [{ provider: "kanflow", project_id: projectId, ref }]

  /** Any event (feed order); `path` names its GitStation project. */
  function push(type: string, data: Record<string, unknown>, workItems = workItem("PBI-1"), id?: string, path = REPO): GitStationEvent {
    seq++
    const e = {
      id: id ?? `evt_${seq}`,
      cursor: cursorOf(seq),
      type,
      schema_version: 1,
      occurred_at: new Date(Date.UTC(2026, 9, 1, 0, seq)).toISOString(),
      project_id: project(path).id,
      actor: { kind: "user", user: { id: 5, username: "dev1", display_name: "Dev One" }, via: null },
      work_items: workItems,
      data,
    } as GitStationEvent
    events.push(e)
    return e
  }

  /** A merge request event; also moves the merge request's current state (what the API answers). */
  function mergeRequest(type: string, iid: number, extra: { title?: string; source_branch?: string; project?: string } = {}, workItems = workItem("PBI-1")): GitStationEvent {
    const path = extra.project ?? REPO
    const p = project(path)
    const key = `${p.id}!${iid}`
    const prev = mergeRequests.get(key)
    const state =
      type === "merge_request.merged" ? "merged" : type === "merge_request.closed" ? "closed" : type === "merge_request.opened" || type === "merge_request.reopened" ? "open" : (prev?.state ?? "open")
    const at = new Date(Date.UTC(2026, 9, 1, 0, seq + 1)).toISOString()
    const mr: GitStationMergeRequest = {
      project_id: p.id,
      iid,
      title: extra.title ?? prev?.title ?? "Login form (PBI-1)",
      state,
      draft: false,
      source_branch: extra.source_branch ?? prev?.source_branch ?? "feature/PBI-1-login-form",
      target_branch: "main",
      author: { username: "dev1", display_name: "Dev One" },
      created_at: prev?.created_at ?? at,
      updated_at: at,
      closed_at: state === "closed" ? at : null,
      head_sha: oid(iid),
    }
    mergeRequests.set(key, mr)
    if (workItems.length > 0) linkedTo.set(key, workItems)
    if (state === "merged" && type === "merge_request.merged") mergedAt.set(key, at)
    const ids = { merge_request_id: 100 + iid, iid }
    const data: Record<string, unknown> =
      type === "merge_request.opened"
        ? { ...ids, author_id: 5, source_branch: mr.source_branch, target_branch: "main", draft: false }
        : type === "merge_request.merged"
          ? { ...ids, merge_id: 1, method: "merge", target_branch: "main", target_sha: oid(900), merged_sha: oid(901), head_sha: oid(iid), merged_by: 5 }
          : ids
    return push(type, data, workItems, undefined, path)
  }

  /** Commits pushed to `ref` of `path` (newest first) and their repository.pushed event (ids only). */
  function pushed(path: string, ref: string, commits: { subject: string; author_name?: string }[], workItems: GitStationEvent["work_items"] = [], extra: Record<string, unknown> = {}): GitStationEvent {
    const p = project(path)
    const own = history.get(p.id) ?? []
    const old = own[0]?.oid ?? "0".repeat(40)
    const added = commits.map((c, i) => ({
      oid: oid(1000 + own.length + commits.length - i),
      subject: c.subject,
      author_name: c.author_name ?? "Dev One",
      committed_at: new Date(Date.UTC(2026, 9, 1, 1, own.length + commits.length - i)).toISOString(),
    }))
    history.set(p.id, [...added, ...own])
    const r = { ref, old, new: added[0]?.oid ?? old, kind: "fast_forward", total_commits: added.length, commits: added.map((c) => c.oid), commits_truncated: false, ...extra }
    return push(
      "repository.pushed",
      { repository_id: p.id, refs: [r], total_refs: 1, refs_truncated: false, created: false, fast_forward: true, forced: false, deleted: false, total_commits: added.length, commits_truncated: false },
      workItems,
      undefined,
      path,
    )
  }

  function fail(path: string, status: number, body?: unknown, headers?: Record<string, string>, times = 1) {
    scripted.push({ path, status, body, headers, times })
  }

  function json(status: number, body: unknown, headers: Record<string, string> = {}): Response {
    return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } })
  }
  const paramInvalid = (name: string) => json(400, { error_code: "FG-WEB-0006", user_message: `parameter ${name}`, request_id: "r" })
  const notFound = () => json(404, { error_code: "FG-WEB-0004", user_message: "not found", request_id: "r" })

  /** Unknown or repeated parameters are refused, as GitStation does. */
  function badQuery(url: URL, allowed: string[]): Response | null {
    const names = [...url.searchParams.keys()]
    for (const n of names) if (!allowed.includes(n) || names.filter((x) => x === n).length > 1) return paramInvalid(n)
    return null
  }

  const byId = (id: number) => [...projects.values()].find((p) => p.id === id)
  /** The service account sees a project only through a binding of its integration (Reporter). */
  const visible = (p: Project | undefined) => !!p && p.bindings.some((b) => b.integration_id === Number(INTEGRATION))

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
      const bad = badQuery(url, ALLOWED_QUERY.events)
      if (bad) return bad
      const cursor = url.searchParams.get("cursor")
      const from = seqOf(cursor)
      if (from < 0) return json(400, { error_code: "FG-INT-0008", user_message: "cursor", request_id: "r" })
      const limit = Math.min(Number(url.searchParams.get("limit") ?? 100), pageSize)
      const rest = events.filter((e) => seqOf(e.cursor) > from)
      const page = rest.slice(0, limit)
      const last = page.length > 0 ? page[page.length - 1].cursor : (cursor ?? cursorOf(seq))
      return json(200, { schema_version: 1, events: page, next_cursor: page.length < rest.length ? last : cursorOf(seq), has_more: page.length < rest.length })
    }
    if (path === `${integrationBase}/events/cursor`) {
      const head = cursorOf(seq)
      const hook = afterHead
      afterHead = null
      hook?.()
      return json(200, { schema_version: 1, cursor: head })
    }
    if (path === `${integrationBase}/dev-status`) {
      const bad = badQuery(url, ALLOWED_QUERY.devStatus)
      if (bad) return bad
      if (url.searchParams.get("state") !== "all") return paramInvalid("state")
      // The listing reads every visible project: one that may not be read fails the whole listing.
      if ([...failingState].some((id) => visible(byId(id)))) return json(403, { error_code: "FG-AUTHZ-0001" })
      const cursor = url.searchParams.get("cursor")
      const m = cursor === null ? ["", "0"] : /^ds\.(\d+)$/.exec(cursor)
      if (!m) return json(400, { error_code: "FG-INT-0008", user_message: "cursor", request_id: "r" })
      const from = Number(m[1])
      const limit = Math.min(Number(url.searchParams.get("limit") ?? 50), devStatusPageSize)
      // Work items (Kanflow project + ref) with their linked merge requests of visible projects, newest first.
      const items = new Map<string, { project_id: string; ref: string; mrs: GitStationMergeRequest[] }>()
      for (const [key, mr] of mergeRequests) {
        if (!visible(byId(mr.project_id))) continue
        for (const w of linkedTo.get(key) ?? []) {
          const k = `${w.project_id}|${w.ref}`
          const item = items.get(k) ?? { project_id: w.project_id, ref: w.ref, mrs: [] }
          item.mrs.push(mr)
          items.set(k, item)
        }
      }
      const all = [...items.values()].sort((a, b) => `${a.project_id}|${a.ref}`.localeCompare(`${b.project_id}|${b.ref}`))
      const page = all.slice(from, from + limit)
      const more = from + limit < all.length
      return json(200, {
        schema_version: 1,
        as_of_seq: seq,
        feed_cursor: cursorOf(seq),
        work_items: page.map((w) => ({
          provider: "kanflow",
          project_id: w.project_id,
          ref: w.ref,
          merge_requests: w.mrs
            .sort((a, b) => b.iid - a.iid)
            .map((mr) => ({
              project: { id: mr.project_id, path: byId(mr.project_id)?.path ?? null },
              iid: mr.iid,
              title: mr.title,
              draft: mr.draft ?? false,
              state: mr.state,
              source_branch: mr.source_branch,
              target_branch: mr.target_branch ?? "main",
              head_sha: mr.head_sha ?? null,
              created_at: mr.created_at,
              updated_at: mr.updated_at,
              merged_at: mergedAt.get(`${mr.project_id}!${mr.iid}`) ?? null,
              closed_at: mr.closed_at ?? null,
              approvals: { given: 0 },
              checks: [],
              checks_state: "none",
              link: { source: "auto", linked_at: mr.created_at },
            })),
          merge_requests_truncated: false,
        })),
        next_cursor: more ? `ds.${from + limit}` : null,
        has_more: more,
      })
    }
    if (path.startsWith(`/integrations/`)) return json(404, { error_code: "FG-INT-0001" })
    if (path === "/namespaces/resolve") {
      const bad = badQuery(url, ALLOWED_QUERY.resolve)
      if (bad) return bad
      const asked = url.searchParams.get("path") ?? ""
      if (groups.has(asked.toLowerCase())) return json(200, { namespace_id: 1, kind: "group", canonical_path: asked, moved: false, project_id: null, group_id: 1 })
      const target = moved.get(asked.toLowerCase()) ?? asked
      const p = projects.get(target.toLowerCase())
      if (!p || !visible(p)) return notFound()
      return json(200, { namespace_id: 100 + p.id, kind: "project", canonical_path: p.path, moved: target !== asked, project_id: p.id, group_id: null })
    }
    const m = /^\/projects\/(\d+)(\/.*)?$/.exec(path)
    if (!m) return notFound()
    const p = byId(Number(m[1]))
    if (!p || !visible(p)) return notFound()
    const rest = m[2] ?? ""
    if (rest === "/integration-bindings") {
      return json(200, { items: p.bindings.map((b) => ({ ...b, project_id: p.id, granted_membership: true, created_by: 1, created_at: "2026-10-01T00:00:00.000Z" })) })
    }
    if (rest === "/merge-requests") {
      const bad = badQuery(url, ALLOWED_QUERY.mrs)
      if (bad) return bad
      if (failingState.has(p.id)) return json(403, { error_code: "FG-AUTHZ-0001" })
      const limit = Number(url.searchParams.get("limit") ?? 20)
      const before = url.searchParams.get("before")
      const all = [...mergeRequests.values()].filter((x) => x.project_id === p.id).sort((a, b) => b.iid - a.iid)
      const from = before === null ? all : all.filter((x) => x.iid < Number(before))
      const page = from.slice(0, limit)
      return json(200, { merge_requests: page, next_before: from.length > limit ? page[page.length - 1].iid : null })
    }
    const mr = /^\/merge-requests\/(\d+)$/.exec(rest)
    if (mr) {
      const found = mergeRequests.get(`${p.id}!${mr[1]}`)
      return found ? json(200, found) : notFound()
    }
    if (rest === "/repository/refs") {
      const bad = badQuery(url, ALLOWED_QUERY.refs)
      if (bad) return bad
      const type = url.searchParams.get("type")
      const list = (type === "tag" ? tags : branches).get(p.id) ?? []
      return json(200, {
        default_branch: "main",
        refs: list.map((r) => ({ name: r.name, full_name: `refs/${type === "tag" ? "tags" : "heads"}/${r.name}`, type: type ?? "branch", commit: r.commit, target: r.commit })),
        truncated: false,
      })
    }
    if (rest === "/repository/commits") {
      const bad = badQuery(url, ALLOWED_QUERY.commits)
      if (bad) return bad
      const ref = url.searchParams.get("ref") ?? ""
      const own = history.get(p.id) ?? []
      const at = own.findIndex((c) => c.oid === ref)
      if (at < 0) return notFound()
      const limit = Number(url.searchParams.get("limit") ?? 30)
      return json(200, { ref: { type: "commit", name: ref, full_name: null, commit: ref }, head: ref, path: "", commits: own.slice(at, at + limit), next_cursor: null, has_more: false })
    }
    return notFound()
  }

  return {
    fetchImpl,
    requests,
    events,
    push,
    mergeRequest,
    pushed,
    fail,
    workItem,
    bind,
    /** GitStation's project id of a path (created on first use, unbound). */
    projectId: (path: string) => project(path).id,
    /** The path now redirects to `to` (a moved project). */
    move: (from: string, to: string) => {
      const p = project(from)
      projects.delete(from.toLowerCase())
      p.path = to
      projects.set(to.toLowerCase(), p)
      moved.set(from.toLowerCase(), to)
    },
    setBranches: (path: string, names: string[]) => branches.set(project(path).id, names.map((name, i) => ({ name, commit: oid(500 + i) }))),
    setTags: (path: string, names: string[]) => tags.set(project(path).id, names.map((name, i) => ({ name, commit: oid(600 + i) }))),
    head: () => cursorOf(seq),
    /** `fn` runs once, right after the next head cursor is handed out. */
    onHeadTaken: (fn: () => void) => {
      afterHead = fn
    },
    /** The merge request listing of `path` answers 403, and so does the integration's dev-status listing while `path` is visible (until `restoreState`). */
    failState: (path: string) => failingState.add(project(path).id),
    restoreState: (path: string) => failingState.delete(project(path).id),
    /** Raw feed page for the next events request (shape tests). */
    rawEvents: (body: unknown) => scripted.push({ path: `/integrations/${INTEGRATION}/events`, status: 200, body, times: 1 }),
    /** Simulate GitStation pruning events (retention): the events are gone, the state stays. */
    prune: () => events.splice(0, events.length),
  }
}

export type FakeGitStation = ReturnType<typeof createFakeGitStation>
