import { afterAll, beforeAll, vi } from "vitest"
import { render, type RenderOptions } from "@testing-library/react"
import type { ReactElement, ReactNode } from "react"
import { LanguageProvider } from "@/lib/language-context"
import { ConfirmProvider } from "@/components/confirm-dialog"
import { ToastProvider } from "@/components/ui/toast"
import type { Language } from "@/lib/i18n"

/**
 * jsdom has no layout, so `getClientRects()` is always empty and the focus
 * trap would consider nothing tabbable. Pretend every element is visible.
 */
export function stubLayout(): void {
  let spy: ReturnType<typeof vi.spyOn> | null = null
  beforeAll(() => {
    spy = vi
      .spyOn(HTMLElement.prototype, "getClientRects")
      .mockImplementation(() => [{ width: 1, height: 1 }] as unknown as DOMRectList)
  })
  afterAll(() => {
    spy?.mockRestore()
  })
}

export function AppProviders({ children, language = "en" }: { children: ReactNode; language?: Language }) {
  return (
    <LanguageProvider initialLanguage={language}>
      <ToastProvider>
        <ConfirmProvider>{children}</ConfirmProvider>
      </ToastProvider>
    </LanguageProvider>
  )
}

export function renderWithProviders(ui: ReactElement, language: Language = "en", options?: RenderOptions) {
  return render(ui, {
    wrapper: ({ children }) => <AppProviders language={language}>{children}</AppProviders>,
    ...options,
  })
}

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } })
}
