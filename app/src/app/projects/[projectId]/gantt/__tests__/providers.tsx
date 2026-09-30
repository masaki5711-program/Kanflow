import type { ReactElement, ReactNode } from "react"
import { render } from "@testing-library/react"
import { vi } from "vitest"
import { ConfirmProvider, ToastProvider } from "@/components/ui"
import { LanguageProvider } from "@/lib/language-context"
import type { Language } from "@/lib/i18n"

export function Providers({ children, language = "ja" }: { children: ReactNode; language?: Language }) {
  return (
    <LanguageProvider initialLanguage={language}>
      <ToastProvider>
        <ConfirmProvider>{children}</ConfirmProvider>
      </ToastProvider>
    </LanguageProvider>
  )
}

export function renderWithProviders(ui: ReactElement, language: Language = "ja") {
  return render(<Providers language={language}>{ui}</Providers>)
}

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } })
}

type Handler = (url: string, init?: RequestInit) => Response | Promise<Response>

/** Stub global fetch with a url/method router. Returns the vi.fn for assertions. */
export function stubFetch(handler: Handler) {
  const fn = vi.fn((input: RequestInfo | URL, init?: RequestInit) => Promise.resolve(handler(String(input), init)))
  vi.stubGlobal("fetch", fn)
  return fn
}
