import type { ReactNode } from "react"
import { render } from "@testing-library/react"
import { LanguageProvider } from "@/lib/language-context"
import { ConfirmProvider, ToastProvider } from "@/components/ui"
import type { Language } from "@/lib/i18n"
import type { ProjectType } from "@/lib/project-type-labels"

export interface RenderOpts {
  language?: Language
  projectType?: ProjectType
}

export function renderWithProviders(ui: ReactNode, { language = "ja", projectType = "software" }: RenderOpts = {}) {
  return render(
    <LanguageProvider initialLanguage={language} initialProjectType={projectType}>
      <ToastProvider>
        <ConfirmProvider>{ui}</ConfirmProvider>
      </ToastProvider>
    </LanguageProvider>,
  )
}

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } })
}
