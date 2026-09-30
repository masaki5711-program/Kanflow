import { describe, expect, it } from "vitest"
import { screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { renderWithProviders, tr } from "@/app/__tests__/test-utils"
import { ApiUsageHelp, apiExampleCommand } from "../api-usage-help"

describe("ApiUsageHelp (/me, P-09)", () => {
  it.each(["ja", "en", "id"] as const)("shows the base URL and an example request instead of a repository path (%s)", async (language) => {
    const t = tr(language)
    renderWithProviders(<ApiUsageHelp />, { language })
    await userEvent.click(screen.getByText(t.apiTokenDocsLink))
    const base = `${window.location.origin}/api/v1`
    expect(screen.getByText(t.apiTokenUsageBaseUrl)).toBeInTheDocument()
    expect(screen.getByText(base)).toBeInTheDocument()
    expect(screen.getByText(apiExampleCommand(base))).toBeInTheDocument()
    expect(document.body).not.toHaveTextContent("docs/api-v1.md")
  })

  it("uses a placeholder token in the example", () => {
    expect(apiExampleCommand("http://kanflow/api/v1")).toBe('curl -H "Authorization: Bearer kfl_…" http://kanflow/api/v1/projects')
  })
})
