import { describe, expect, it, vi } from "vitest"
import type { ReactNode } from "react"
import { renderWithProviders, tr } from "@/app/__tests__/test-utils"

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}))

const { ProjectUpdatesBadges } = await import("../project-updates-badges")

const t = tr("en")

function project(updates?: { newActivity: number; unread: number; mentions: number }) {
  return { id: "p1", updates }
}

describe("ProjectUpdatesBadges", () => {
  it("renders nothing without updates data", () => {
    renderWithProviders(<ProjectUpdatesBadges project={project(undefined)} />, { language: "en" })
    expect(document.querySelector("[data-project-updates]")).toBeNull()
  })

  it("renders nothing when every count is zero", () => {
    renderWithProviders(<ProjectUpdatesBadges project={project({ newActivity: 0, unread: 0, mentions: 0 })} />, { language: "en" })
    expect(document.querySelector("[data-project-updates]")).toBeNull()
  })

  it("shows the mentions pill", () => {
    const { getByLabelText } = renderWithProviders(
      <ProjectUpdatesBadges project={project({ newActivity: 0, unread: 3, mentions: 3 })} />,
      { language: "en" },
    )
    expect(getByLabelText(t.updatesCardMentions.replace("{n}", "3"))).toBeInTheDocument()
  })

  it("'new' count combines new activity and unread notifications beyond mentions", () => {
    const { getByText } = renderWithProviders(
      <ProjectUpdatesBadges project={project({ newActivity: 2, unread: 5, mentions: 2 })} />,
      { language: "en" },
    )
    // otherUnread = max(0, 5-2) = 3; fresh = 2 + 3 = 5
    expect(getByText(t.updatesCardNew.replace("{n}", "5"))).toBeInTheDocument()
  })

  it("never lets unread-below-mentions produce a negative count", () => {
    const { getByLabelText, queryByText } = renderWithProviders(
      <ProjectUpdatesBadges project={project({ newActivity: 0, unread: 1, mentions: 3 })} />,
      { language: "en" },
    )
    expect(getByLabelText(t.updatesCardMentions.replace("{n}", "3"))).toBeInTheDocument()
    expect(queryByText(t.updatesCardNew.replace("{n}", "0"))).not.toBeInTheDocument()
    expect(document.querySelectorAll("a")).toHaveLength(1)
  })

  it("caps the displayed new count at 99+", () => {
    const { getByText } = renderWithProviders(
      <ProjectUpdatesBadges project={project({ newActivity: 150, unread: 0, mentions: 0 })} />,
      { language: "en" },
    )
    expect(getByText(t.updatesCardNew.replace("{n}", "99+"))).toBeInTheDocument()
  })
})
