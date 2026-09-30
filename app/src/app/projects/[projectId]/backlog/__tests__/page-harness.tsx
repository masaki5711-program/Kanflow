/**
 * Shared fetch routing / helpers for the backlog page tests (not a test file itself).
 * Each test file still declares its own vi.mock(...) calls (they are hoisted per file):
 *
 *   vi.mock("next/navigation", async () => (await import("./nav-mock")).navigationModule({ projectId: "p1" }))
 *   vi.mock("next-auth/react", () => ({ useSession: () => ({ data: session.value }) }))
 *   vi.mock("@/components/live-announcer", () => ({ announce: vi.fn() }))
 *   vi.mock("@/components/pbi-detail-modal", async () => (await import("./page-harness")).detailModalMock)
 */
import { screen, within } from "@testing-library/react"
import { jsonResponse, stubFetch, tr } from "@/app/__tests__/test-utils"
import type { BacklogResponse } from "../types"
import { backlogResponse } from "./fixtures"

export const BASE = "/api/projects/p1"
export const t = tr("ja")

export const detailModalMock = {
  default: ({ pbiId, initialMode, initialTab, editable, onClose }: { pbiId: string; initialMode?: string; initialTab?: string; editable?: boolean; onClose: () => void }) => (
    <div data-testid="pbi-detail" data-mode={initialMode} data-tab={initialTab} data-editable={String(!!editable)}>
      detail {pbiId}
      <button type="button" onClick={onClose}>
        close-detail
      </button>
    </div>
  ),
}

export interface SetupOptions {
  role?: string | null
  members?: { role: string; user: { id: string; name?: string } }[]
  membersStatus?: number
  backlog?: BacklogResponse
  backlogStatus?: number
  reorderStatus?: number
  statusPatch?: number | ((body: unknown) => Response | Promise<Response>)
  deleteStatus?: number
  saveStatus?: number
  bulk?: (body: unknown) => Response
  restoreStatus?: number
  /** GET /plan body (master plan items for the bulk "link plan" picker). */
  plan?: unknown
}

export function setupBacklog(opts: SetupOptions = {}) {
  const { role = "po" } = opts
  let backlogCalls = 0
  let membersCalls = 0
  const fetchMock = stubFetch([
    {
      match: `${BASE}/backlog`,
      method: "GET",
      respond: () => {
        backlogCalls++
        if (opts.backlogStatus && backlogCalls === 1) return jsonResponse({ error: "db down" }, opts.backlogStatus)
        return jsonResponse(opts.backlog ?? backlogResponse())
      },
    },
    {
      match: `${BASE}/icebox`,
      respond: () => jsonResponse({ unreviewed: [{ id: "ib1", displayId: 11, request: "Icebox request one", background: null, author: "Ann", status: "unreviewed" }], reviewed: [] }),
    },
    { match: `${BASE}/goals`, respond: () => jsonResponse([{ id: "g1", title: "Goal one", description: null }]) },
    {
      match: `${BASE}/members`,
      respond: () => {
        membersCalls++
        if (opts.membersStatus && membersCalls === 1) return jsonResponse({ error: "nope" }, opts.membersStatus)
        return jsonResponse(opts.members ?? (role ? [{ role, user: { id: "u1", name: "Me" } }, { role: "po", user: { id: "u2", name: "Hanako" } }] : []))
      },
    },
    {
      match: `${BASE}/sprints`,
      respond: () =>
        jsonResponse([
          { id: "s1", sprintName: "Sprint 1", status: "active" },
          { id: "s0", sprintName: "Old sprint", status: "completed" },
        ]),
    },
    { match: `${BASE}/plan`, respond: () => jsonResponse(opts.plan ?? { items: [], dependencies: [] }) },
    { match: BASE, respond: () => jsonResponse({ pointUnit: "SP" }) },
    { match: `${BASE}/backlog/reorder`, method: "PUT", respond: () => jsonResponse({ ok: true }, opts.reorderStatus ?? 200) },
    { match: `${BASE}/backlog/bulk`, method: "POST", respond: (_u, init) => (opts.bulk ? opts.bulk(JSON.parse(String(init?.body))) : jsonResponse({})) },
    {
      match: /\/backlog\/[a-z]+$/,
      method: "PATCH",
      respond: (_u, init) =>
        (typeof opts.statusPatch === "function" ? opts.statusPatch(JSON.parse(String(init?.body))) : jsonResponse({ ok: true }, opts.statusPatch ?? 200)),
    },
    { match: /\/backlog\/[a-z]+(\?version=\d+)?$/, method: "DELETE", respond: () => jsonResponse({ error: "locked" }, opts.deleteStatus ?? 200) },
    { match: /\/trash\/backlog_item\/[a-z]+\/restore$/, method: "POST", respond: () => jsonResponse({ success: true }, opts.restoreStatus ?? 200) },
    { match: `${BASE}/backlog`, method: "POST", respond: () => jsonResponse({ id: "new" }, opts.saveStatus ?? 201) },
  ])
  return { fetchMock, calls: () => ({ backlogCalls, membersCalls }) }
}

export function titles(section: HTMLElement): (string | null)[] {
  return within(section)
    .getAllByRole("listitem")
    .map((li) => within(li).getByRole("heading", { level: 3 }).textContent)
}

export function sectionByTitle(title: string): HTMLElement {
  return screen.getByRole("heading", { name: title }).closest("section") as HTMLElement
}

export const readySection = () => sectionByTitle(t.backlogSectionReadyTitle)

type FetchMock = ReturnType<typeof stubFetch>

/** Parsed JSON body of the first `method` call whose URL contains `urlPart`. */
export function bodyOf(fetchMock: FetchMock, method: string, urlPart: string): unknown {
  const call = fetchMock.mock.calls.find(([u, i]) => String(u).includes(urlPart) && (i?.method ?? "GET") === method)
  return call ? JSON.parse(String(call[1]?.body)) : undefined
}

export function callsOf(fetchMock: FetchMock, method: string, urlPart: string | RegExp) {
  return fetchMock.mock.calls.filter(
    ([u, i]) => (i?.method ?? "GET") === method && (typeof urlPart === "string" ? String(u).includes(urlPart) : urlPart.test(String(u))),
  )
}

/** jsdom lacks PointerEvent; React's onPointerDown needs clientY / button on it. */
export function installPointerEvent(): void {
  if (!("PointerEvent" in window)) {
    Object.defineProperty(window, "PointerEvent", { value: class PointerEvent extends MouseEvent {}, configurable: true })
  }
}
