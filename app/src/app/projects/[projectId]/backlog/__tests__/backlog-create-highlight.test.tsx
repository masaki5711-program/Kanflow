import { beforeEach, describe, expect, it, vi } from "vitest"
import { screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { renderWithProviders } from "@/app/__tests__/test-utils"
import { getProjectTypeLabels } from "@/lib/project-type-labels"
import { HIGHLIGHT_ATTR } from "@/hooks/use-deep-link-highlight"
import { backlogResponse, pbi } from "./fixtures"
import { resetUrl } from "./nav-mock"
import { setupBacklog as setup, t } from "./page-harness"
import { backlogItemElementId } from "../use-created-highlight"

const pt = getProjectTypeLabels("software", "ja")

vi.mock("next/navigation", async () => (await import("./nav-mock")).navigationModule({ projectId: "p1" }))
vi.mock("next-auth/react", () => ({ useSession: () => ({ data: { user: { id: "u1", role: "user" } } }) }))
vi.mock("@/components/live-announcer", () => ({ announce: vi.fn() }))
vi.mock("@/components/pbi-detail-modal", async () => (await import("./page-harness")).detailModalMock)
vi.mock("@/components/ai-result-modal", () => ({ AIResultModal: () => null }))

const { default: BacklogPage } = await import("../page")

beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn()
  resetUrl("/projects/p1/backlog")
})

async function createPbi(title: string) {
  const user = userEvent.setup()
  await user.click(screen.getAllByRole("button", { name: t.backlogAddItem })[0])
  const dialog = screen.getByRole("dialog", { name: t.backlogAddItem })
  await user.type(within(dialog).getByRole("textbox", { name: new RegExp(pt.backlogInitiative) }), title)
  await user.click(within(dialog).getByRole("button", { name: t.add }))
}

describe("A3-11 BacklogPage — a new PBI is scrolled to and highlighted", () => {
  it("scrolls the new card into view, focuses and highlights it once the list is refetched", async () => {
    const response = backlogResponse()
    setup({ backlog: response })
    renderWithProviders(<BacklogPage />, { language: "ja" })
    await screen.findByRole("heading", { name: t.backlogSectionReadyTitle })
    // The server list after the POST contains the new PBI (appended to Not ready).
    response.notReadyItems = [...response.notReadyItems, pbi("new", 9, { status: "not_ready", initiative: "Brand new" })]

    await createPbi("Brand new")

    const card = await waitFor(() => {
      const el = document.getElementById(backlogItemElementId("new"))
      expect(el).not.toBeNull()
      return el as HTMLElement
    })
    await waitFor(() => expect(card).toHaveAttribute(HIGHLIGHT_ATTR))
    expect(card.scrollIntoView).toHaveBeenCalled()
    expect(document.activeElement).toBe(card)
  })

  it("clears a filter that would hide the new PBI", async () => {
    const response = backlogResponse()
    setup({ backlog: response })
    resetUrl("/projects/p1/backlog?q=Alpha")
    renderWithProviders(<BacklogPage />, { language: "ja" })
    await screen.findByRole("heading", { name: t.backlogSectionReadyTitle })
    response.notReadyItems = [...response.notReadyItems, pbi("new", 9, { status: "not_ready", initiative: "Zeta" })]

    await createPbi("Zeta")

    await waitFor(() => expect(document.getElementById(backlogItemElementId("new"))).toHaveAttribute(HIGHLIGHT_ATTR))
    expect(new URLSearchParams(window.location.search).get("q")).toBeNull()
  })
})
