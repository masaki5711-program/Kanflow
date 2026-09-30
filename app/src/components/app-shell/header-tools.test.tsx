import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { fireEvent, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { jsonResponse, renderWithProviders, stubFetch, tr } from "@/app/__tests__/test-utils"
import { stubLayout } from "@/components/__tests__/helpers"
import { HeaderTools } from "./header-tools"

const nav = vi.hoisted(() => ({ pathname: "/projects/p1/backlog", push: vi.fn() }))
vi.mock("next/navigation", () => ({ usePathname: () => nav.pathname, useRouter: () => ({ push: nav.push }) }))

stubLayout()

const t = tr("en")

beforeEach(() => {
  nav.pathname = "/projects/p1/backlog"
  nav.push.mockClear()
  stubFetch([{ match: "/api/notifications/unread-count", respond: () => jsonResponse({ unreadCount: 0 }) }])
})
afterEach(() => vi.unstubAllGlobals())

describe("HeaderTools", () => {
  it("opens the search palette from the header button", async () => {
    const user = userEvent.setup()
    renderWithProviders(<HeaderTools />, { language: "en" })
    const button = screen.getByRole("button", { name: t.searchButton })
    expect(button).toHaveAttribute("aria-keyshortcuts")
    await user.click(button)
    expect(screen.getByRole("dialog", { name: t.searchDialogTitle })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: t.notifBell })).toBeInTheDocument()
  })

  it("Ctrl+K opens search, ? opens the shortcuts help listing every shortcut", async () => {
    const user = userEvent.setup()
    renderWithProviders(<HeaderTools />, { language: "en" })
    fireEvent.keyDown(document.body, { key: "k", ctrlKey: true })
    expect(screen.getByRole("dialog", { name: t.searchDialogTitle })).toBeInTheDocument()
    await user.keyboard("{Escape}")
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument())

    fireEvent.keyDown(document.body, { key: "?" })
    const help = screen.getByRole("dialog", { name: t.shortcutsTitle })
    expect(within(help).getByRole("rowheader", { name: /g\s*then\s*b/ })).toBeInTheDocument()
    expect(within(help).getByRole("cell", { name: "Go to Product Backlog" })).toBeInTheDocument()
    expect(within(help).getByRole("cell", { name: t.shortcutsOpenSearch })).toBeInTheDocument()
    // shortcuts are off while the help dialog is open
    fireEvent.keyDown(document.body, { key: "/" })
    expect(screen.queryByRole("dialog", { name: t.searchDialogTitle })).not.toBeInTheDocument()
  })

  it("g then s navigates within the current project", () => {
    renderWithProviders(<HeaderTools />, { language: "en" })
    fireEvent.keyDown(document.body, { key: "g" })
    fireEvent.keyDown(document.body, { key: "s" })
    expect(nav.push).toHaveBeenCalledWith("/projects/p1/sprints")
  })

  it("outside a project the g sequences do nothing", () => {
    nav.pathname = "/me"
    renderWithProviders(<HeaderTools />, { language: "en" })
    fireEvent.keyDown(document.body, { key: "g" })
    fireEvent.keyDown(document.body, { key: "b" })
    expect(nav.push).not.toHaveBeenCalled()
  })
})
