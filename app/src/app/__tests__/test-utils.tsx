// Shared render helpers for component tests under src/app (not a test file itself).
import type { ReactElement, ReactNode } from "react"
import { render, type RenderOptions } from "@testing-library/react"
import { vi } from "vitest"
import { LanguageProvider } from "@/lib/language-context"
import { ToastProvider } from "@/components/ui/toast"
import { ConfirmProvider } from "@/components/confirm-dialog"
import { getTranslations, type Language } from "@/lib/i18n"

export interface ProviderOptions extends Omit<RenderOptions, "wrapper"> {
  language?: Language
}

/** Render inside Language + Toast + Confirm providers (same stack as the app shell). */
export function renderWithProviders(ui: ReactElement, { language = "ja", ...rest }: ProviderOptions = {}) {
  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <LanguageProvider initialLanguage={language}>
        <ToastProvider>
          <ConfirmProvider>{children}</ConfirmProvider>
        </ToastProvider>
      </LanguageProvider>
    )
  }
  return render(ui, { wrapper: Wrapper, ...rest })
}

export const tr = (language: Language = "ja") => getTranslations(language)

/** JSON Response helper for fetch mocks. */
export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(body === undefined ? "" : JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  })
}

type Route = { match: string | RegExp; method?: string; respond: (url: string, init?: RequestInit) => Response | Promise<Response> }

/**
 * Stub global fetch with a small router. Unmatched requests return 404.
 * Returns the vi.fn so tests can inspect calls.
 */
export function stubFetch(routes: Route[]) {
  const fn = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url
    const method = (init?.method ?? "GET").toUpperCase()
    const route = routes.find((r) => {
      const okMethod = !r.method || r.method.toUpperCase() === method
      const okUrl = typeof r.match === "string" ? url === r.match || url.startsWith(r.match + "?") : r.match.test(url)
      return okMethod && okUrl
    })
    if (!route) return jsonResponse({ error: `unmatched ${method} ${url}` }, 404)
    return route.respond(url, init)
  })
  vi.stubGlobal("fetch", fn)
  return fn
}
