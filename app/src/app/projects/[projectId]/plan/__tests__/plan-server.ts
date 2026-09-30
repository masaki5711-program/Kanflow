// In-memory plan API for component tests (not a test file itself).
import { vi } from "vitest"
import { jsonResponse, stubFetch } from "@/app/__tests__/test-utils"
import type { LinkablePbi, LinkedPbi, PlanDependency, PlanItem } from "../lib/plan-types"
import { mkItem } from "./fixtures"

export const BASE = "/api/projects/p1/plan"
export const TODAY = "2026-10-01"

export function seedItems(): PlanItem[] {
  return [
    mkItem({ id: "A", name: "Alpha", sortOrder: 1, status: "in_progress", scheduleState: "at_risk", progressPct: 40, plannedStart: "2026-10-01", plannedEnd: "2026-10-20", hasChildren: true }),
    mkItem({ id: "A1", name: "Alpha-1", parentId: "A", sortOrder: 1, plannedStart: "2026-10-01", plannedEnd: "2026-10-05", actualStart: "2026-10-02", owner: { id: "u1", name: "Sato" } }),
    mkItem({ id: "A2", name: "Alpha-2", parentId: "A", sortOrder: 2, plannedStart: "2026-10-06", plannedEnd: "2026-10-20", progressMode: "linked", status: "in_progress", scheduleState: "on_track", progressPct: 60, linked: { pbiCount: 5, pbiDone: 3, pointsTotal: 13, pointsDone: 8, sprints: [{ id: "s1", name: "Sprint 1", startDate: "2026-10-06", endDate: "2026-10-19", status: "active" }] } }),
    mkItem({ id: "B", name: "Beta", sortOrder: 2, status: "done", scheduleState: "done", plannedStart: "2026-10-03", plannedEnd: "2026-10-12", baselineStart: "2026-10-01", baselineEnd: "2026-10-09", baselineVarianceDays: 3 }),
    mkItem({ id: "M", name: "Launch", sortOrder: 3, isMilestone: true, plannedStart: "2026-10-25", plannedEnd: "2026-10-25" }),
  ]
}

export interface ServerState {
  items: PlanItem[]
  dependencies: PlanDependency[]
  links: Record<string, LinkedPbi[]>
  linkable: LinkablePbi[]
  fail: Partial<Record<"list" | "create" | "patch" | "conflict" | "del" | "reorder", boolean>>
}

export function freshState(): ServerState {
  return {
    items: seedItems(),
    dependencies: [
      { id: "d1", predecessorId: "A1", successorId: "A2" },
      { id: "d2", predecessorId: "B", successorId: "A2" },
    ],
    links: { A2: [{ id: "pb1", displayId: 11, title: "Login form", status: "ready", points: 3, sprint: null }] },
    linkable: [
      { id: "pb1", displayId: 11, title: "Login form", status: "ready", points: 3, planItem: { id: "A2", name: "Alpha-2" } },
      { id: "pb2", displayId: 12, title: "Signup", status: "ready", points: 5, planItem: { id: "B", name: "Beta" } },
      { id: "pb3", displayId: 13, title: "Reset password", status: "not_ready", points: 2, planItem: null },
    ],
    fail: {},
  }
}

const idOf = (url: string) => url.split("?")[0].split("/").pop()!

export function planServer(state: ServerState) {
  return stubFetch([
    { match: "/api/projects/p1/members", method: "GET", respond: () => jsonResponse([{ id: "m1", userId: "u1", role: "po", user: { id: "u1", name: "Sato", email: "s@x", employeeNumber: null, department: null } }]) },
    {
      match: BASE,
      method: "GET",
      respond: () => (state.fail.list ? jsonResponse({ error: "list broke" }, 500) : jsonResponse({ items: state.items, dependencies: state.dependencies, today: TODAY })),
    },
    {
      match: BASE,
      method: "POST",
      respond: (_u, init) => {
        if (state.fail.create) return jsonResponse({ error: "create broke" }, 500)
        const body = JSON.parse(String(init?.body))
        const created = mkItem({ id: "NEW", ...body, sortOrder: 99 })
        state.items = [...state.items, created]
        return jsonResponse(created, 201)
      },
    },
    {
      match: `${BASE}/reorder`,
      method: "POST",
      respond: (_u, init) => {
        if (state.fail.reorder) return jsonResponse({ error: "reorder broke" }, 500)
        const { updates } = JSON.parse(String(init?.body)) as { updates: { id: string; parentId: string | null; sortOrder: number }[] }
        state.items = state.items.map((i) => {
          const u = updates.find((x) => x.id === i.id)
          return u ? { ...i, parentId: u.parentId, sortOrder: u.sortOrder } : i
        })
        return jsonResponse({ ok: true })
      },
    },
    { match: `${BASE}/baseline`, respond: () => jsonResponse({ ok: true }) },
    { match: `${BASE}/dependencies`, method: "POST", respond: () => jsonResponse({ id: "dNew" }, 201) },
    { match: new RegExp(`^${BASE}/dependencies/[^/]+$`), method: "DELETE", respond: () => jsonResponse({ success: true }) },
    { match: new RegExp(`^${BASE}/linkable-pbis`), method: "GET", respond: (url) => {
      const q = new URL(url, "http://x").searchParams.get("q") ?? ""
      return jsonResponse({ pbis: state.linkable.filter((p) => p.title.toLowerCase().includes(q.toLowerCase())) })
    } },
    { match: new RegExp(`^${BASE}/[^/]+/links$`), method: "GET", respond: (url) => jsonResponse({ pbis: state.links[url.split("/").slice(-2)[0]] ?? [] }) },
    { match: new RegExp(`^${BASE}/[^/]+/links$`), method: "PUT", respond: () => jsonResponse({ ok: true }) },
    {
      match: new RegExp(`^${BASE}/[^/]+$`),
      method: "PATCH",
      respond: (url, init) => {
        const id = idOf(url)
        if (state.fail.conflict) return jsonResponse({ error: "conflict", code: "VERSION_CONFLICT", current: state.items.find((i) => i.id === id) }, 409)
        if (state.fail.patch) return jsonResponse({ error: "patch broke" }, 500)
        const patch = JSON.parse(String(init?.body))
        state.items = state.items.map((i) => (i.id === id ? { ...i, ...patch } : i))
        return jsonResponse(state.items.find((i) => i.id === id))
      },
    },
    {
      match: new RegExp(`^${BASE}/[^/]+(\\?.*)?$`),
      method: "DELETE",
      respond: (url) => {
        if (state.fail.del) return jsonResponse({ error: "delete broke" }, 500)
        const id = idOf(url)
        const before = state.items.length
        state.items = state.items.filter((i) => i.id !== id && i.parentId !== id)
        return jsonResponse({ success: true, deletedCount: before - state.items.length })
      },
    },
    { match: new RegExp("^/api/projects/p1/trash/plan_item/[^/]+/restore$"), method: "POST", respond: () => jsonResponse({ ok: true }) },
  ])
}

export type FetchMock = ReturnType<typeof planServer>

export function callsTo(fetchMock: FetchMock, method: string, url: string | RegExp) {
  return fetchMock.mock.calls.filter(([u, init]) => {
    const m = (init?.method ?? "GET").toUpperCase()
    const s = String(u)
    return m === method && (typeof url === "string" ? s === url : url.test(s))
  })
}

export function bodyOf(call: unknown[] | undefined): unknown {
  const init = call?.[1] as RequestInit | undefined
  return JSON.parse(String(init?.body))
}

/** jsdom lacks matchMedia (used by useMediaQuery); report a wide screen. */
export function stubMatchMedia(matches = false) {
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }))
}
