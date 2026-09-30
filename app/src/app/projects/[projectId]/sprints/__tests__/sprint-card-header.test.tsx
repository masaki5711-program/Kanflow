import { describe, expect, it, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import { LanguageProvider } from "@/lib/language-context"
import type { Language } from "@/lib/i18n"
import SprintCardHeader from "../components/sprint-card-header"
import { sprint } from "./helpers"

const actions = { onRequestStatusChange: vi.fn(), onAddPbi: vi.fn(), onOpenStatusDialog: vi.fn(), onDeleteSprint: vi.fn() }

function renderHeader(language: Language) {
  render(
    <LanguageProvider initialLanguage={language}>
      <SprintCardHeader sprint={sprint("s1", { startDate: "2026-09-30T00:00:00.000Z", endDate: "2026-10-07T00:00:00.000Z" })}
        isExpanded={false} onToggleExpand={vi.fn()} onEdit={vi.fn()} canManage={false} actions={actions} />
    </LanguageProvider>,
  )
}

describe("SprintCardHeader period (A3-14)", () => {
  it("uses the shared date-range format in Indonesian (day month year, like the task cards)", () => {
    renderHeader("id")
    expect(screen.getByText("30 Sep 2026 – 7 Okt 2026")).toBeInTheDocument()
    expect(screen.queryByText(/30\/9\/2026/)).toBeNull()
  })

  it("uses the same range as the dashboard in Japanese", () => {
    renderHeader("ja")
    expect(screen.getByText("2026/9/30 – 2026/10/7")).toBeInTheDocument()
  })
})
