import { oid } from "./fake-gitstation"

/**
 * An in-memory GitStation for the act-as tests (plan 11 K4), serving the bodies of GitStation main at M3 S2
 * (ADR-0025 §5, crates/forge-web/src/routes/act_as.rs, docs/api/merge-status.md, docs/api/dev-status.md) behind a
 * `fetch`:
 *
 *   GET  /namespaces/resolve, /projects/{id}/integration-bindings   (the repository check Kanflow does first)
 *   GET  /projects/{id}/merge-requests/{iid}/status   with Forge-Act-As: employee:<n> → viewer.act_as
 *   POST /integrations/{id}/act-as/claim              {state} → the assertion, once (403 FG-AUTH-0020 before the press)
 *   POST /projects/{id}/merge-requests/{iid}/approve|unapprove   Forge-Act-As: user:<id> + Forge-Assertion
 *   GET  /integrations/{id}/work-items/{ref}/dev-status
 *
 * It keeps GitStation's own checks, so a Kanflow bug shows as a refusal: an approval without an assertion is
 * FG-AUTH-0020, an assertion is single use and bound to its person, MR, intent and head, the author cannot
 * approve (FG-REVIEW-0013). `press()` is the person pressing on GitStation's confirmation page. Synthetic data only.
 */
export const ACT_STATION = "https://gitstation.example"
export const ACT_HOST = "gitstation.example"
export const ACT_INTEGRATION = "7"
export const ACT_TOKEN = "fgp_service_account_token"
export const ACT_REPO = "app/portal"
export const ACT_PROJECT = 12

interface Person {
  userId: number
  /** Developer or more may approve. */
  developer: boolean
}

interface Mr {
  iid: number
  head: string
  authorEmployee: string
  open: boolean
  approvers: Set<number>
}

interface Confirmation {
  intent: "approve" | "unapprove"
  iid: number
  head: string
  userId: number | null
  claimed: boolean
}

interface Assertion {
  userId: number
  intent: "approve" | "unapprove"
  iid: number
  head: string
  used: boolean
}

export function createFakeActAsStation(options: { kanflowProjectId: string; employeeNumberScope?: boolean; claimExtra?: Record<string, unknown> }) {
  const people = new Map<string, Person>()
  const mrs = new Map<number, Mr>()
  const confirmations = new Map<string, Confirmation>()
  const assertions = new Map<string, Assertion>()
  const requests: { method: string; path: string; actAs: string | null; assertion: string | null; body: unknown }[] = []
  let nextAssertion = 1
  const employeeNumberScope = options.employeeNumberScope ?? true

  const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } })
  const fg = (status: number, code: string) => json(status, { error_code: code, user_message: "synthetic", request_id: "r" })
  const employeeOf = (userId: number) => [...people.entries()].find(([, p]) => p.userId === userId)?.[0] ?? null

  function trial(mr: Mr, employee: string, intent: "approve" | "unapprove") {
    const p = people.get(employee)
    if (!p) return { allowed: false, reason: "unknown" }
    if (mr.authorEmployee === employee) return { allowed: false, reason: "self_approval" }
    if (!p.developer) return { allowed: false, reason: "required_role" }
    void intent
    return { allowed: true, reason: null }
  }

  const fetchImpl: typeof fetch = async (input, init) => {
    const url = new URL(String(input))
    const headers = new Headers(init?.headers)
    const method = init?.method ?? "GET"
    const body = typeof init?.body === "string" ? (JSON.parse(init.body) as Record<string, unknown>) : null
    const path = url.pathname.replace(/^\/api\/v1/, "")
    requests.push({ method, path, actAs: headers.get("forge-act-as"), assertion: headers.get("forge-assertion"), body })
    if (url.origin !== ACT_STATION) return json(404, {})
    if (headers.get("authorization") !== `Bearer ${ACT_TOKEN}`) return fg(401, "FG-AUTH-0001")

    if (method === "GET" && path === "/namespaces/resolve") {
      if (url.searchParams.get("path") !== ACT_REPO) return fg(404, "FG-WEB-0004")
      return json(200, { kind: "project", project_id: ACT_PROJECT, canonical_path: ACT_REPO, moved: false })
    }
    if (method === "GET" && path === `/projects/${ACT_PROJECT}/integration-bindings`) {
      return json(200, { items: [{ integration_id: Number(ACT_INTEGRATION), kind: "kanflow", external_project_id: options.kanflowProjectId }] })
    }
    const status = new RegExp(`^/projects/${ACT_PROJECT}/merge-requests/(\\d+)/status$`).exec(path)
    if (method === "GET" && status) {
      const mr = mrs.get(Number(status[1]))
      if (!mr) return fg(404, "FG-WEB-0004")
      const actAs = headers.get("forge-act-as")
      const employee = actAs?.startsWith("employee:") ? actAs.slice("employee:".length) : null
      const person = employee ? people.get(employee) : undefined
      if (actAs && !person) return fg(403, "FG-INT-0006")
      return json(200, {
        schema_version: 1,
        iid: mr.iid,
        head_sha: mr.head,
        target_branch: "main",
        method: "merge_commit",
        mergeable: false,
        reasons: mr.open ? [{ reason: "approvals_missing", detail: "rule=@protected_branch required=1 counted=0" }] : [{ reason: "not_open", detail: null }],
        approvals: { rules: [], approvals: [], codeowners: [] },
        checks: [],
        discussions: null,
        work_item_link: null,
        codeowners: { enforced: true, suspended_until: null },
        viewer: {
          can_approve: false,
          can_unapprove: false,
          can_merge: false,
          can_mark_ready: false,
          approved_by_me: person ? mr.approvers.has(person.userId) : false,
          ...(employee && person ? { act_as: { can_approve: trial(mr, employee, "approve"), can_unapprove: trial(mr, employee, "unapprove"), requires_assertion: true } } : {}),
        },
      })
    }
    if (method === "POST" && path === `/integrations/${ACT_INTEGRATION}/act-as/claim`) {
      if (headers.get("forge-act-as")) return fg(403, "FG-AUTH-0003")
      const c = body && typeof body.state === "string" ? confirmations.get(body.state) : undefined
      // claim_unknown (not pressed) / claim_repeated: the same answer, no reason in the body.
      if (!c || c.userId === null || c.claimed) return fg(403, "FG-AUTH-0020")
      c.claimed = true
      const id = `fga_${String(nextAssertion++).padStart(16, "0")}_${"s".repeat(64)}`
      assertions.set(id, { userId: c.userId, intent: c.intent, iid: c.iid, head: c.head, used: false })
      const employee = employeeOf(c.userId)
      return json(200, {
        assertion: id,
        sub: { user_id: c.userId, ...(employeeNumberScope && employee ? { employee_number: employee } : {}) },
        intent: c.intent,
        project_id: ACT_PROJECT,
        iid: c.iid,
        head_sha: c.head,
        target_ref: "refs/heads/main",
        kanflow_project_id: null,
        resolves_work_items: null,
        expires_at: "2026-11-09T00:05:00Z",
        ...options.claimExtra,
      })
    }
    const write = new RegExp(`^/projects/${ACT_PROJECT}/merge-requests/(\\d+)/(approve|unapprove)$`).exec(path)
    if (method === "POST" && write) {
      const mr = mrs.get(Number(write[1]))
      if (!mr) return fg(404, "FG-WEB-0004")
      const intent = write[2] as "approve" | "unapprove"
      const actAs = headers.get("forge-act-as")
      const a = assertions.get(headers.get("forge-assertion") ?? "")
      // ADR-0025: an approval through act-as needs the person's one-time assertion, for exactly this request.
      if (!actAs || !a || a.used) return fg(403, "FG-AUTH-0020")
      a.used = true
      if (actAs !== `user:${a.userId}` || a.intent !== intent || a.iid !== mr.iid) return fg(403, "FG-AUTH-0020")
      if (a.head !== mr.head || body?.sha !== mr.head) return fg(403, "FG-AUTH-0020")
      if (mr.authorEmployee === employeeOf(a.userId)) return fg(403, "FG-REVIEW-0013")
      const had = mr.approvers.has(a.userId)
      if (intent === "approve") mr.approvers.add(a.userId)
      else mr.approvers.delete(a.userId)
      const outcome = intent === "approve" ? (had ? "unchanged" : "approved") : had ? "withdrawn" : "unchanged"
      return json(200, { iid: mr.iid, outcome, counted: intent === "approve", uncounted_reason: null, approval: null })
    }
    const dev = new RegExp(`^/integrations/${ACT_INTEGRATION}/work-items/(PBI-\\d+)/dev-status$`).exec(path)
    if (method === "GET" && dev) {
      if (headers.get("forge-act-as")) return fg(403, "FG-AUTH-0003")
      return json(200, {
        schema_version: 1,
        as_of_seq: 1,
        feed_cursor: "c",
        work_items: [
          {
            provider: "kanflow",
            project_id: options.kanflowProjectId,
            ref: dev[1],
            merge_requests: [...mrs.values()].map((m) => ({ project: { id: ACT_PROJECT, path: ACT_REPO }, iid: m.iid, head_sha: m.head, approvals: { given: m.approvers.size } })),
            merge_requests_truncated: false,
          },
        ],
      })
    }
    return fg(404, "FG-WEB-0004")
  }

  return {
    fetchImpl,
    requests,
    /** A GitStation user, named by the employee number Kanflow stores. */
    person(employeeNumber: string, userId: number, developer = true) {
      people.set(employeeNumber, { userId, developer })
    },
    mergeRequest(iid: number, authorEmployee: string, head = oid(iid)) {
      mrs.set(iid, { iid, head, authorEmployee, open: true, approvers: new Set() })
    },
    pushTo(iid: number, head: string) {
      const mr = mrs.get(iid)
      if (mr) mr.head = head
    },
    approvers: (iid: number) => [...(mrs.get(iid)?.approvers ?? [])],
    /** The person `employeeNumber` presses the button on the confirmation page of `confirmUrl`. */
    press(confirmUrl: string, employeeNumber: string) {
      const url = new URL(confirmUrl)
      const m = /^\/-\/confirm\/projects\/(\d+)\/merge-requests\/(\d+)$/.exec(url.pathname)
      const state = url.searchParams.get("state")
      const intent = url.searchParams.get("intent")
      const sha = url.searchParams.get("sha")
      if (!m || Number(m[1]) !== ACT_PROJECT || !state || (intent !== "approve" && intent !== "unapprove") || url.searchParams.get("integration") !== ACT_INTEGRATION) throw new Error(`not a confirmation URL: ${confirmUrl}`)
      const mr = mrs.get(Number(m[2]))
      if (!mr || sha !== mr.head) throw new Error("the confirmation page would say 古い (stale sha)")
      if (!/^[A-Za-z0-9_-]{22,128}$/.test(state)) throw new Error("state outside GitStation's grammar")
      const person = people.get(employeeNumber)
      if (!person) throw new Error("unknown GitStation user")
      confirmations.set(state, { intent, iid: mr.iid, head: mr.head, userId: person.userId, claimed: false })
    },
  }
}

export type FakeActAsStation = ReturnType<typeof createFakeActAsStation>
