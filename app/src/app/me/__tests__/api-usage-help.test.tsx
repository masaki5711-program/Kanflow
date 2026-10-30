import { describe, expect, it } from "vitest"
import { screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { renderWithProviders, tr } from "@/app/__tests__/test-utils"
import { getTranslations } from "@/lib/i18n"
import { ApiUsageHelp, apiExampleCommand, mcpSetupCommand } from "../api-usage-help"

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

  it.each(["ja", "en", "id"] as const)("explains the MCP connection: URL, setup script, scopes, never paste the token (%s)", async (language) => {
    const t = tr(language)
    renderWithProviders(<ApiUsageHelp />, { language })
    await userEvent.click(screen.getByText(t.apiTokenDocsLink))
    const origin = window.location.origin
    expect(screen.getByText(t.apiTokenUsageMcpUrl)).toBeInTheDocument()
    expect(screen.getByText(`${origin}/api/mcp`)).toBeInTheDocument()
    expect(screen.getByText(t.apiTokenUsageMcpSetup)).toBeInTheDocument()
    expect(screen.getByText(mcpSetupCommand(origin))).toBeInTheDocument()
    expect(screen.getByText(t.apiTokenUsageMcpAfter)).toBeInTheDocument()
    expect(screen.getByText(t.apiTokenUsageNeverPaste)).toBeInTheDocument()
    expect(screen.getByText(t.apiTokenUsageScopes)).toBeInTheDocument()
  })

  it("no longer calls the API read-only (writes and MCP exist)", () => {
    for (const language of ["ja", "en", "id"] as const) {
      const t = getTranslations(language)
      expect(t.apiTokenUsageAuth).not.toMatch(/読み取り専用|read-only|hanya baca/i)
    }
    // The setup hint names the slash command and the presets the form offers.
    expect(getTranslations("en").apiTokenUsageMcpAfter).toContain("/kanflow status")
    expect(getTranslations("ja").apiTokenUsageScopes).toContain(getTranslations("ja").apiTokenPresetDeveloper)
    expect(getTranslations("en").apiTokenUsageScopes).toContain(getTranslations("en").apiTokenPresetDeveloper)
    expect(getTranslations("id").apiTokenUsageScopes).toContain(getTranslations("id").apiTokenPresetDeveloper)
  })

  it("uses a placeholder token in the example", () => {
    expect(apiExampleCommand("http://kanflow/api/v1")).toBe('curl -H "Authorization: Bearer kfl_…" http://kanflow/api/v1/projects')
  })

  it("builds the setup command from this server's origin (no token in it)", () => {
    expect(mcpSetupCommand("https://kanflow.example.internal")).toBe("node scripts/kanflow-setup.js --url https://kanflow.example.internal")
    expect(mcpSetupCommand("")).toBe("node scripts/kanflow-setup.js --url https://<kanflow-host>")
  })
})
