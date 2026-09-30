import { describe, expect, it, vi } from "vitest"
import { screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { UserRow } from "./user-row"
import { renderWithProviders, stubLayout } from "../__tests__/helpers"
import type { ManagedUser } from "./types"

stubLayout()

const SECTION_NAMES = ["FA", "WW", "EP", "BP", "MP", "QA", "PE", "PP", "SP", "IS", "HRGA", "MT"]

const USER: ManagedUser = {
  id: "u1",
  name: "Alice",
  email: "alice@x",
  role: "section_manager",
  isActive: true,
  createdAt: "2026-01-01",
  employeeNumber: null,
  department: null,
  _count: { memberships: 1 },
  sections: SECTION_NAMES.map((name, i) => ({ id: `s${i}`, name })),
}

describe("UserRow (P-15)", () => {
  it("renders one wrappable badge per section instead of one long nowrap badge", () => {
    renderWithProviders(
      <ul>
        <UserRow user={USER} onEdit={vi.fn()} onResetPassword={vi.fn()} onToggleActive={vi.fn()} toggling={false} />
      </ul>,
    )
    const badges = screen.getAllByTestId("user-section-badge")
    expect(badges.map((b) => b.textContent)).toEqual(SECTION_NAMES)
    expect(screen.queryByText(SECTION_NAMES.join(" / "))).toBeNull()
    // The badge row wraps, so the badges flow onto new lines on a phone.
    expect(badges[0].parentElement?.className).toContain("flex-wrap")
  })

  it("renders no section badge for a user without sections", () => {
    renderWithProviders(
      <ul>
        <UserRow user={{ ...USER, sections: [] }} onEdit={vi.fn()} onResetPassword={vi.fn()} onToggleActive={vi.fn()} toggling={false} />
      </ul>,
    )
    expect(screen.queryAllByTestId("user-section-badge")).toHaveLength(0)
  })
})

describe("UserRow responsive layout (A3-12)", () => {
  const long = { ...USER, name: "E2E Administrator", email: "e2e-admin@example.test", department: "IT" }
  function renderRow(handlers = { onEdit: vi.fn(), onResetPassword: vi.fn(), onToggleActive: vi.fn() }) {
    renderWithProviders(
      <ul>
        <UserRow user={long} {...handlers} toggling={false} />
      </ul>,
    )
    return handlers
  }

  it("never truncates the name and lets the email wrap anywhere on a full-width line", () => {
    renderRow()
    const name = screen.getByTestId("user-name")
    expect(name).toHaveTextContent("E2E Administrator")
    expect(name.className).not.toContain("truncate")
    expect(name.className).toContain("break-words")
    expect(screen.getByTestId("user-email").className).toContain("[overflow-wrap:anywhere]")
  })

  it("below sm: one actions menu (edit / reset / toggle); inline buttons only from sm up", async () => {
    const handlers = renderRow()
    expect(screen.getByTestId("user-actions-menu").className).toContain("sm:hidden")
    expect(screen.getByTestId("user-actions-inline").className).toMatch(/\bhidden\b.*sm:flex/)
    await userEvent.click(within(screen.getByTestId("user-actions-menu")).getByRole("button", { name: /E2E Administrator/ }))
    const menu = await screen.findByRole("menu")
    expect(within(menu).getAllByRole("menuitem")).toHaveLength(3)
    await userEvent.click(within(menu).getAllByRole("menuitem")[2])
    expect(handlers.onToggleActive).toHaveBeenCalledTimes(1)
  })

  it("the inline toggle action is quiet (ghost), not a solid red button on every row", () => {
    renderRow()
    const inline = within(screen.getByTestId("user-actions-inline")).getAllByRole("button")
    const toggle = inline[inline.length - 1]
    expect(toggle.className).not.toMatch(/(^| )bg-danger( |$)/)
    expect(toggle.className).toContain("hover:text-danger-strong")
  })
})
