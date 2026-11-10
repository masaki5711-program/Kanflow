/**
 * An in-memory GitStation for the X3 binding tests (plan 11 §5.7 X3; GitStation ADR-0025 Amendment X3, ADR-0016
 * Amendment X3, crates/forge-web/src/routes/integration_bindings.rs, web/src/api/actAs.ts parseBindingLink) behind a
 * `fetch`:
 *
 *   GET    /repositories?q=&limit=                   Forge-Act-As: employee:<n> → the person's Maintainer+ repositories
 *   GET    /integrations/{id}/bindings?kanflow_project_id=   the service account itself
 *   POST   /integrations/{id}/act-as/claim           {state} → the binding assertion, once (403 FG-AUTH-0020 before)
 *   POST   /integrations/{id}/bindings               Forge-Act-As: user:<id> + Forge-Assertion (binding_set)
 *   PATCH  /integrations/{id}/bindings/{binding_id}  same (binding_set, the new setting)
 *   DELETE /integrations/{id}/bindings/{binding_id}  same (binding_remove) → 204
 *
 * It keeps GitStation's own checks, so a Kanflow bug shows as a refusal: a write without an assertion is
 * FG-AUTH-0020, an assertion is single use and bound to its person, intent, repository, Kanflow project and setting;
 * a code repository belongs to one Kanflow project only and shared / code bindings never mix (FG-INT-0016).
 * `press()` is the person pressing on GitStation's binding confirmation page. Synthetic data only.
 */
export const BIND_STATION = "https://gitstation.example"
export const BIND_HOST = "gitstation.example"
export const BIND_INTEGRATION = "7"
export const BIND_TOKEN = "fgp_service_account_token"

interface Repo {
  id: number
  path: string
  displayName: string
  /** GitStation user ids that are Maintainer or above. */
  maintainers: Set<number>
}

interface Binding {
  bindingId: number
  repositoryId: number
  kanflowProjectId: string
  resolvesWorkItems: boolean
}

interface Confirmation {
  intent: "binding_set" | "binding_remove"
  repositoryId: number
  kanflowProjectId: string
  resolvesWorkItems: boolean | null
  userId: number
  claimed: boolean
}

interface Assertion extends Omit<Confirmation, "claimed"> {
  used: boolean
}

export function createFakeBindingStation(options: { employeeNumberScope?: boolean; claimExtra?: Record<string, unknown>; searchLimitPerRun?: number } = {}) {
  const people = new Map<string, number>()
  const repos = new Map<number, Repo>()
  const bindings = new Map<number, Binding>()
  const confirmations = new Map<string, Confirmation>()
  const assertions = new Map<string, Assertion>()
  const requests: { method: string; path: string; query: Record<string, string>; actAs: string | null; assertion: string | null; body: unknown }[] = []
  let nextAssertion = 1
  let nextBinding = 100
  let searches = 0
  const employeeNumberScope = options.employeeNumberScope ?? true

  const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } })
  const fg = (status: number, code: string) => json(status, { error_code: code, user_message: "synthetic", request_id: "r" })
  const employeeOf = (userId: number) => [...people.entries()].find(([, id]) => id === userId)?.[0] ?? null
  const bindingBody = (b: Binding) => ({
    binding_id: b.bindingId,
    integration_id: Number(BIND_INTEGRATION),
    kanflow_project_id: b.kanflowProjectId,
    repository_id: b.repositoryId,
    repository_path: repos.get(b.repositoryId)?.path ?? null,
    settings: { resolves_work_items: b.resolvesWorkItems },
    granted_membership: true,
    created_by: null,
    created_at: "2026-11-10T00:00:00Z",
  })

  /** ADR-0016 Amendment X3 1: what the binding rules say about binding `repositoryId` to `kanflow` with `resolves`. */
  function ruleRefusal(repositoryId: number, kanflow: string, resolves: boolean, except: number | null): boolean {
    const others = [...bindings.values()].filter((b) => b.repositoryId === repositoryId && b.bindingId !== except)
    if (resolves) return others.length > 0
    return others.some((b) => b.resolvesWorkItems)
  }

  /** The person's one-time assertion for exactly this write, else the refusal. */
  function spendAssertion(headers: Headers, want: Omit<Assertion, "used" | "userId">): Response | null {
    const actAs = headers.get("forge-act-as")
    const a = assertions.get(headers.get("forge-assertion") ?? "")
    if (!actAs || !a || a.used) return fg(403, "FG-AUTH-0020")
    a.used = true
    if (actAs !== `user:${a.userId}`) return fg(403, "FG-AUTH-0020")
    if (a.intent !== want.intent || a.repositoryId !== want.repositoryId || a.kanflowProjectId !== want.kanflowProjectId || a.resolvesWorkItems !== want.resolvesWorkItems) return fg(403, "FG-AUTH-0020")
    const repo = repos.get(want.repositoryId)
    if (!repo || !repo.maintainers.has(a.userId)) return fg(403, "FG-AUTH-0003")
    return null
  }

  const fetchImpl: typeof fetch = async (input, init) => {
    const url = new URL(String(input))
    const headers = new Headers(init?.headers)
    const method = init?.method ?? "GET"
    const body = typeof init?.body === "string" ? (JSON.parse(init.body) as Record<string, unknown>) : null
    const path = url.pathname.replace(/^\/api\/v1/, "")
    requests.push({ method, path, query: Object.fromEntries(url.searchParams), actAs: headers.get("forge-act-as"), assertion: headers.get("forge-assertion"), body })
    if (url.origin !== BIND_STATION) return json(404, {})
    if (headers.get("authorization") !== `Bearer ${BIND_TOKEN}`) return fg(401, "FG-AUTH-0001")

    if (method === "GET" && path === "/repositories") {
      const actAs = headers.get("forge-act-as")
      // The route itself is people-only: the service account on its own is refused.
      if (!actAs?.startsWith("employee:")) return fg(403, "FG-AUTH-0003")
      if (options.searchLimitPerRun !== undefined && ++searches > options.searchLimitPerRun) return new Response(JSON.stringify({ error_code: "FG-WEB-0010", user_message: "synthetic", request_id: "r" }), { status: 429, headers: { "retry-after": "60" } })
      const userId = people.get(actAs.slice("employee:".length))
      if (userId === undefined) return fg(403, "FG-INT-0006")
      const q = (url.searchParams.get("q") ?? "").toLowerCase()
      const limit = Number(url.searchParams.get("limit") ?? 20)
      const items = [...repos.values()]
        .filter((r) => r.maintainers.has(userId) && (r.path.toLowerCase().includes(q) || r.displayName.toLowerCase().includes(q)))
        .sort((a, b) => a.path.localeCompare(b.path))
        .slice(0, limit)
        .map((r) => ({ id: r.id, path: r.path, display_name: r.displayName }))
      return json(200, { items })
    }
    if (method === "GET" && path === `/integrations/${BIND_INTEGRATION}/bindings`) {
      if (headers.get("forge-act-as")) return fg(403, "FG-AUTH-0003")
      const kanflow = url.searchParams.get("kanflow_project_id")
      return json(200, { items: [...bindings.values()].filter((b) => kanflow === null || b.kanflowProjectId === kanflow).map(bindingBody) })
    }
    if (method === "POST" && path === `/integrations/${BIND_INTEGRATION}/act-as/claim`) {
      if (headers.get("forge-act-as")) return fg(403, "FG-AUTH-0003")
      const c = body && typeof body.state === "string" ? confirmations.get(body.state) : undefined
      if (!c || c.claimed) return fg(403, "FG-AUTH-0020")
      c.claimed = true
      const id = `fga_${String(nextAssertion++).padStart(16, "0")}_${"s".repeat(64)}`
      assertions.set(id, { intent: c.intent, repositoryId: c.repositoryId, kanflowProjectId: c.kanflowProjectId, resolvesWorkItems: c.resolvesWorkItems, userId: c.userId, used: false })
      const employee = employeeOf(c.userId)
      return json(200, {
        assertion: id,
        sub: { user_id: c.userId, ...(employeeNumberScope && employee ? { employee_number: employee } : {}) },
        intent: c.intent,
        project_id: c.repositoryId,
        iid: null,
        head_sha: null,
        target_ref: null,
        kanflow_project_id: c.kanflowProjectId,
        resolves_work_items: c.resolvesWorkItems,
        expires_at: "2026-11-10T00:05:00Z",
        ...options.claimExtra,
      })
    }
    if (method === "POST" && path === `/integrations/${BIND_INTEGRATION}/bindings`) {
      const kanflow = String(body?.kanflow_project_id ?? "")
      const repositoryId = Number(body?.repository_id)
      const settings = body?.settings as { resolves_work_items?: boolean } | null | undefined
      const resolves = settings?.resolves_work_items ?? true
      const refused = spendAssertion(headers, { intent: "binding_set", repositoryId, kanflowProjectId: kanflow, resolvesWorkItems: resolves })
      if (refused) return refused
      const same = [...bindings.values()].find((b) => b.repositoryId === repositoryId && b.kanflowProjectId === kanflow)
      if (same) return same.resolvesWorkItems === resolves ? json(200, { outcome: "unchanged", binding: bindingBody(same) }) : fg(409, "FG-INT-0016")
      if (ruleRefusal(repositoryId, kanflow, resolves, null)) return fg(409, "FG-INT-0016")
      const created = { bindingId: nextBinding++, repositoryId, kanflowProjectId: kanflow, resolvesWorkItems: resolves }
      bindings.set(created.bindingId, created)
      return json(200, { outcome: "bound", binding: bindingBody(created) })
    }
    const one = new RegExp(`^/integrations/${BIND_INTEGRATION}/bindings/(\\d+)$`).exec(path)
    if (one && (method === "PATCH" || method === "DELETE")) {
      const b = bindings.get(Number(one[1]))
      if (!b) return fg(404, "FG-REPO-0005")
      if (method === "PATCH") {
        const resolves = (body?.settings as { resolves_work_items?: boolean } | undefined)?.resolves_work_items
        if (typeof resolves !== "boolean") return fg(400, "FG-WEB-0002")
        const refused = spendAssertion(headers, { intent: "binding_set", repositoryId: b.repositoryId, kanflowProjectId: b.kanflowProjectId, resolvesWorkItems: resolves })
        if (refused) return refused
        if (b.resolvesWorkItems === resolves) return json(200, { outcome: "unchanged", binding: bindingBody(b) })
        // false → true only, and only as the repository's only binding.
        if (!resolves || ruleRefusal(b.repositoryId, b.kanflowProjectId, true, b.bindingId)) return fg(409, "FG-INT-0016")
        b.resolvesWorkItems = true
        return json(200, { outcome: "updated", binding: bindingBody(b) })
      }
      const refused = spendAssertion(headers, { intent: "binding_remove", repositoryId: b.repositoryId, kanflowProjectId: b.kanflowProjectId, resolvesWorkItems: null })
      if (refused) return refused
      bindings.delete(b.bindingId)
      return new Response(null, { status: 204 })
    }
    return fg(404, "FG-WEB-0004")
  }

  return {
    fetchImpl,
    requests,
    /** A GitStation user, named by the employee number Kanflow stores. */
    person(employeeNumber: string, userId: number) {
      people.set(employeeNumber, userId)
    },
    repository(id: number, path: string, maintainers: number[], displayName = path.split("/").pop() ?? path) {
      repos.set(id, { id, path, displayName, maintainers: new Set(maintainers) })
    },
    /** A binding made elsewhere (another Kanflow project, an administrator). */
    bind(repositoryId: number, kanflowProjectId: string, resolvesWorkItems: boolean): number {
      const b = { bindingId: nextBinding++, repositoryId, kanflowProjectId, resolvesWorkItems }
      bindings.set(b.bindingId, b)
      return b.bindingId
    },
    bindings: () => [...bindings.values()],
    writes: () => requests.filter((r) => r.method !== "GET" && !r.path.endsWith("/act-as/claim")),
    /**
     * The person `employeeNumber` presses the button on the binding confirmation page of `confirmUrl` — parsed as
     * GitStation's parseBindingLink does (a malformed link is refused before anything is asked).
     */
    press(confirmUrl: string, employeeNumber: string) {
      const url = new URL(confirmUrl)
      const m = /^\/-\/confirm\/projects\/(\d+)\/integration-bindings$/.exec(url.pathname)
      if (url.origin !== BIND_STATION || !m) throw new Error(`not a binding confirmation URL: ${confirmUrl}`)
      const q = url.searchParams
      const known = new Set(["intent", "integration", "kanflow_project_id", "resolves_work_items", "state"])
      if ([...q.keys()].some((k) => !known.has(k)) || [...known].some((k) => q.getAll(k).length > 1)) throw new Error("unknown or repeated parameter")
      const intent = q.get("intent")
      if (intent !== "binding_set" && intent !== "binding_remove") throw new Error("bad intent")
      if (q.get("integration") !== BIND_INTEGRATION) throw new Error("bad integration")
      const kanflow = q.get("kanflow_project_id")
      if (kanflow === null || !/^[A-Za-z0-9._:-]{1,100}$/.test(kanflow)) throw new Error("bad kanflow_project_id")
      const resolves = q.get("resolves_work_items")
      let resolvesWorkItems: boolean | null = null
      if (intent === "binding_set") {
        if (resolves !== "true" && resolves !== "false") throw new Error("binding_set needs resolves_work_items")
        resolvesWorkItems = resolves === "true"
      } else if (resolves !== null) throw new Error("binding_remove carries no setting")
      const state = q.get("state")
      if (state === null || !/^[A-Za-z0-9_-]{22,128}$/.test(state)) throw new Error("state outside GitStation's grammar")
      const userId = people.get(employeeNumber)
      if (userId === undefined) throw new Error("unknown GitStation user")
      const repositoryId = Number(m[1])
      const repo = repos.get(repositoryId)
      if (!repo || !repo.maintainers.has(userId)) throw new Error("the confirmation page would refuse (not Maintainer)")
      if (intent === "binding_remove" && ![...bindings.values()].some((b) => b.repositoryId === repositoryId && b.kanflowProjectId === kanflow)) throw new Error("nothing to unbind")
      confirmations.set(state, { intent, repositoryId, kanflowProjectId: kanflow, resolvesWorkItems, userId, claimed: false })
    },
  }
}

export type FakeBindingStation = ReturnType<typeof createFakeBindingStation>
