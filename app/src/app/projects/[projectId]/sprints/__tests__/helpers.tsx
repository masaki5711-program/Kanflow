import type { ReactElement, ReactNode } from "react"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { vi } from "vitest"
import { ConfirmProvider, ToastProvider } from "@/components/ui"
import { LanguageProvider } from "@/lib/language-context"
import { getTranslations } from "@/lib/i18n"
import type { Sprint, SprintItem, SprintPbItem } from "../components/types"

export const t = getTranslations("ja")

function Providers({ children }: { children: ReactNode }) {
  return (
    <LanguageProvider initialLanguage="ja">
      <ToastProvider>
        <ConfirmProvider>{children}</ConfirmProvider>
      </ToastProvider>
    </LanguageProvider>
  )
}

export function renderWithProviders(ui: ReactElement) {
  return render(ui, { wrapper: Providers })
}

export function json(body: unknown, status = 200): Response {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  })
}

type Handler = (body: unknown, url: string) => Response | Promise<Response>
export type Routes = Record<string, Handler | unknown>

export interface FetchCall {
  method: string
  url: string
  body: unknown
}

/**
 * Stub global fetch with a route table keyed by "METHOD url" (or just "url"
 * for GET). A route value that is a function receives the parsed JSON body;
 * any other value is returned as a 200 JSON response. Unknown routes → 404.
 */
export function stubFetch(routes: Routes) {
  const calls: FetchCall[] = []
  const fn = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    const method = (init?.method ?? "GET").toUpperCase()
    const body = typeof init?.body === "string" ? JSON.parse(init.body) : undefined
    calls.push({ method, url, body })
    const route = routes[`${method} ${url}`] ?? (method === "GET" ? routes[url] : undefined)
    if (route === undefined) return json({ error: `no route ${method} ${url}` }, 404)
    if (typeof route === "function") return (route as Handler)(body, url)
    return json(route)
  })
  vi.stubGlobal("fetch", fn)
  return { fn, calls, routes }
}

export function pb(id: string, over: Partial<SprintPbItem> = {}): SprintPbItem {
  return { id, displayId: Number(id.replace(/\D/g, "")) || 1, initiative: `Initiative ${id}`, epic: null, userStory: null, workloadScore: 5, ...over }
}

export function task(id: string, pbItem: SprintPbItem, over: Partial<SprintItem> = {}): SprintItem {
  return {
    id, taskName: `Task ${id}`, assignee: null, estimatedHours: null, actualHours: null, status: "todo",
    completionComment: null, pbItem, ...over,
  }
}

export function sprint(id: string, over: Partial<Sprint> = {}): Sprint {
  return {
    id, sprintName: `Sprint ${id}`, startDate: "2026-09-01T00:00:00.000Z", endDate: "2026-09-14T00:00:00.000Z",
    sprintGoal: null, capacity: 20, actualScore: 0, status: "active", reviewComment: null, retrospectiveMemo: null,
    retrospectiveKeep: null, retrospectiveProblem: null, retrospectiveTry: null, items: [], ...over,
  }
}

/** Opens the "⋯" menu of a task ("Task t1") or PBI ("#1") and clicks the entry with the given name. */
export async function pickMenuItem(owner: string, itemName: string) {
  await userEvent.click(await screen.findByRole("button", { name: t.sprintUxMoreActions.replace("{name}", owner) }))
  await userEvent.click(await screen.findByRole("menuitem", { name: itemName }))
}

/** Unfolds a PBI group (all-done groups start folded). */
export async function expandPbi(ref = "#1") {
  await userEvent.click(await screen.findByRole("button", { name: `${t.sprintPbiExpand}: ${ref}` }))
}

/** A finished sprint is one line in the 過去 tab: opens it into the full card. */
export async function openPastSprint(name: string) {
  await userEvent.click(await screen.findByRole("button", { name: new RegExp(name) }))
}

export function deferred<T>() {
  let resolve!: (v: T) => void
  let reject!: (e: unknown) => void
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej })
  return { promise, resolve, reject }
}
