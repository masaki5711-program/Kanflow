import { describe, expect, it, vi } from "vitest"
import { screen } from "@testing-library/react"
import { getTranslations } from "@/lib/i18n"
import DeadlineDialog from "./deadline-dialog"
import { renderWithProviders } from "./__tests__/render"

const t = getTranslations("ja")

describe("DeadlineDialog", () => {
  it("renders nothing when closed", () => {
    renderWithProviders(<DeadlineDialog info={null} onClose={vi.fn()} />)
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
  })

  it("shows an empty state when the sprint has no tasks", () => {
    renderWithProviders(<DeadlineDialog info={{ dateStr: "2026-10-09", tasks: [], sprintName: "Sprint B" }} onClose={vi.fn()} />)
    expect(screen.getByRole("dialog", { name: "Sprint B の期限（2026-10-09）" })).toBeInTheDocument()
    expect(screen.getByText(t.calendarNoTasks)).toBeInTheDocument()
  })
})
