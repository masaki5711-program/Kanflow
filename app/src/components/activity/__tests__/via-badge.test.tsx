import { describe, expect, it } from "vitest"
import { screen } from "@testing-library/react"
import { getTranslations } from "@/lib/i18n"
import { renderWithProviders } from "@/components/__tests__/helpers"
import { ViaBadge } from "../via-badge"

describe("ViaBadge", () => {
  it.each(["ja", "en", "id"] as const)("labels MCP and REST API changes in the viewer's language (%s)", (language) => {
    const t = getTranslations(language)
    const { unmount } = renderWithProviders(<ViaBadge via="mcp" />, language)
    expect(screen.getByText(t.historyViaMcp)).toHaveAttribute("title", t.historyViaMcpHint)
    unmount()
    renderWithProviders(<ViaBadge via="api" />, language)
    expect(screen.getByText(t.historyViaApi)).toHaveAttribute("title", t.historyViaApiHint)
  })

  it("renders nothing for a change made in the UI", () => {
    const { container } = renderWithProviders(<ViaBadge via={null} />)
    expect(container.querySelector("[data-via]")).toBeNull()
    expect(container).not.toHaveTextContent(/API|MCP/)
  })

  it("has distinct, non-empty texts per language", () => {
    for (const language of ["ja", "en", "id"] as const) {
      const t = getTranslations(language)
      expect(t.historyViaMcp).not.toBe(t.historyViaApi)
      expect(t.historyViaMcp).toContain("MCP")
      expect(t.historyViaApi).toContain("API")
    }
  })
})
