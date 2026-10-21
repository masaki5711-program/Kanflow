import { describe, expect, it, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { LanguageProvider } from "@/lib/language-context"
import { getTranslations } from "@/lib/i18n"
import { GOAL_CLAMP_CHARS, SprintGoal } from "../components/sprint-goal"
import SprintsHeader, { PHONE_ICON_ONLY_LABEL } from "../components/sprints-header"

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a>,
}))

const t = getTranslations("id")
const wrap = (ui: React.ReactElement) => render(<LanguageProvider initialLanguage="id">{ui}</LanguageProvider>)

describe("SprintGoal on phones (A3-17)", () => {
  it("clamps a long goal below sm and toggles it open with an accessible button", async () => {
    const user = userEvent.setup()
    const goal = "x".repeat(GOAL_CLAMP_CHARS + 1)
    wrap(<SprintGoal sprint={{ id: "s1", sprintGoal: goal, i18n: {} }} />)
    const text = screen.getByText(goal)
    expect(text.className).toContain("line-clamp-3")
    expect(text.className).toContain("sm:line-clamp-none")
    const toggle = screen.getByRole("button", { name: t.sprintGoalShowAll })
    expect(toggle).toHaveAttribute("aria-expanded", "false")
    expect(toggle.className).toContain("sm:hidden")

    await user.click(toggle)
    expect(screen.getByText(goal).className).not.toContain("line-clamp-3")
    expect(screen.getByRole("button", { name: t.sprintGoalShowLess })).toHaveAttribute("aria-expanded", "true")
  })

  it("shows a short goal in full without a toggle, and nothing without a goal", () => {
    const { container } = wrap(<><SprintGoal sprint={{ id: "s1", sprintGoal: "Short goal", i18n: {} }} /><SprintGoal sprint={{ id: "s2", sprintGoal: "", i18n: {} }} /></>)
    expect(screen.getByText("Short goal").className).not.toContain("line-clamp-3")
    expect(screen.queryByRole("button")).toBeNull()
    expect(container.querySelectorAll("p")).toHaveLength(1)
  })
})

describe("SprintsHeader actions on phones (A3-17)", () => {
  it("keeps calendar, burndown and archive as icon buttons with accessible names below sm", () => {
    wrap(<SprintsHeader projectId="p1" avgActual={null} doneSprintCount={0} archivedCount={8} showArchived={false}
      onToggleArchived={vi.fn()} canCreate={false} onCreate={vi.fn()} />)
    for (const name of [t.calendarTitle, t.burndownOpenPage]) {
      const link = screen.getByRole("link", { name })
      expect(link).toHaveAttribute("title", name)
      expect(link.querySelector("span")?.className).toBe(PHONE_ICON_ONLY_LABEL)
    }
    const archived = screen.getByRole("button", { name: `${t.sprintArchivedSprints} 8` })
    expect(archived.querySelector("span")?.className).toContain("sr-only")
    const excel = screen.getByRole("link", { name: t.excelExport })
    expect(excel.querySelector("span")?.className).toBe("sr-only sm:not-sr-only")
  })

  it("lets the average-points badge wrap instead of running off a phone screen", () => {
    wrap(<SprintsHeader projectId="p1" avgActual={11} doneSprintCount={8} archivedCount={0} showArchived={false}
      onToggleArchived={vi.fn()} canCreate={false} onCreate={vi.fn()} />)
    const badge = screen.getByText(/: 11$/)
    expect(badge.className).toContain("whitespace-normal")
    expect(badge.className).not.toContain("whitespace-nowrap")
  })
})
