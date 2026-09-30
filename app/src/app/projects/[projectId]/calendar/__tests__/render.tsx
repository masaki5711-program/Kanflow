import type { ReactElement, ReactNode } from "react"
import { render } from "@testing-library/react"
import { vi } from "vitest"
import { ConfirmProvider, ToastProvider } from "@/components/ui"
import { LanguageProvider } from "@/lib/language-context"

export function Providers({ children }: { children: ReactNode }) {
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

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } })
}

export type Route = (url: string, init?: RequestInit) => Response | Promise<Response> | undefined

/** Stub global fetch with a router; unmatched requests return 404. */
export function stubFetch(route: Route) {
  const fn = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString()
    const res = await route(url, init)
    return res ?? jsonResponse({ error: "not found" }, 404)
  })
  vi.stubGlobal("fetch", fn)
  return fn
}
