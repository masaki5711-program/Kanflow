import { describe, expect, it, vi } from "vitest"
import { screen } from "@testing-library/react"
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
