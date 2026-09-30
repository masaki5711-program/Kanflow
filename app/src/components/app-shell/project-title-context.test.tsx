import { afterEach, describe, expect, it } from "vitest"
import { render } from "@testing-library/react"
import { LanguageProvider } from "@/lib/language-context"
import type { Language } from "@/lib/i18n"
import { ProjectTitleProvider, useProjectDocumentTitle } from "./project-title-context"

function Page({ title }: { title: string }) {
  useProjectDocumentTitle(title)
  return null
}

const i18n = { name: { source: "ja" as const, ja: "アルファ", id: "Alfa", status: "done" as const } }

function renderIn(language: Language, withProject = true) {
  const page = <Page title="Backlog" />
  return render(
    <LanguageProvider initialLanguage={language}>
      {withProject ? (
        <ProjectTitleProvider projectName="アルファ" projectI18n={i18n}>
          {page}
        </ProjectTitleProvider>
      ) : (
        page
      )}
    </LanguageProvider>,
  )
}

describe("useProjectDocumentTitle", () => {
  afterEach(() => {
    document.title = ""
  })

  it("includes the project name in the viewer's language", () => {
    renderIn("ja")
    expect(document.title).toBe("Backlog · アルファ · Kanflow")
  })

  it("uses the translated project name for Indonesian viewers", () => {
    renderIn("id")
    expect(document.title).toBe("Backlog · Alfa · Kanflow")
  })

  it("degrades to '<Page> · Kanflow' outside a project", () => {
    renderIn("ja", false)
    expect(document.title).toBe("Backlog · Kanflow")
  })
})
