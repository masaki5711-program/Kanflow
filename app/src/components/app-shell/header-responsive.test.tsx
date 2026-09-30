import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import type { ReactNode } from "react"
import { getTranslations } from "@/lib/i18n"
import { stubLayout } from "../__tests__/helpers"

const nav = vi.hoisted(() => ({ pathname: "/projects/p1/backlog" }))
const auth = vi.hoisted(() => ({
  session: null as null | { user: { id?: string; name?: string; role?: string } },
  signOut: vi.fn(),
}))

vi.mock("next/navigation", () => ({ usePathname: () => nav.pathname, useRouter: () => ({ push: vi.fn() }) }))
vi.mock("next/link", () => ({
  default: ({ href, children, onClick, ...rest }: { href: string; children: ReactNode; onClick?: (e: unknown) => void }) => (
    <a
      href={href}
      {...rest}
      onClick={(e) => {
        onClick?.(e)
        e.preventDefault()
      }}
    >
      {children}
    </a>
  ),
}))
vi.mock("next/image", () => ({
  // eslint-disable-next-line @next/next/no-img-element
  default: (props: { alt: string; src: string }) => <img alt={props.alt} src={props.src} />,
}))
vi.mock("next-auth/react", () => ({
  useSession: () => ({ data: auth.session, status: auth.session ? "authenticated" : "unauthenticated" }),
  signOut: (...args: unknown[]) => auth.signOut(...args),
}))

const { Header } = await import("@/components/header")
const { SidebarDrawerProvider } = await import("./sidebar-drawer")
const { LanguageProvider } = await import("@/lib/language-context")
const bp = await import("./header-breakpoints")
const { placePopover, POPOVER_VIEWPORT_MARGIN } = await import("./anchored-popover")
const { SEARCH_BUTTON_CLASS } = await import("./header-tools")

stubLayout()

const t = getTranslations("en")
const classesOf = (el: Element) => el.className.split(/\s+/)

beforeEach(() => {
  nav.pathname = "/projects/p1/backlog"
  auth.session = { user: { id: "u1", name: "Hanako Admin", role: "admin" } }
  auth.signOut.mockClear()
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ unreadCount: 0 }), { status: 200 })))
})
afterEach(() => vi.unstubAllGlobals())

function renderHeader() {
  return render(
    <LanguageProvider initialLanguage="en">
      <SidebarDrawerProvider>
        <Header projectId="p1" projectName="IoT platform with a very long project name" />
      </SidebarDrawerProvider>
    </LanguageProvider>,
  )
}

function userMenuButton() {
  return screen.getByRole("button", { name: `${t.navUserMenu}: Hanako Admin` })
}

describe("Header responsive layout", () => {
  it("keeps ☰, logo and breadcrumb in a shrinkable start group that never overlaps the end group", () => {
    const { container } = renderHeader()
    const start = container.querySelector("[data-header-start]")!
    const end = container.querySelector("[data-header-end]")!
    expect(classesOf(start)).toEqual(expect.arrayContaining(["min-w-0", "flex-1"]))
    expect(classesOf(end)).toContain("shrink-0")
    // ☰ belongs to the start group and stays a 40px tap target.
    const burger = within(start as HTMLElement).getByRole("button", { name: t.navOpenMenu })
    expect(classesOf(burger)).toEqual(expect.arrayContaining(["h-10", "w-10", "shrink-0"]))
    // Only the breadcrumb truncates.
    const crumb = screen.getByRole("navigation", { name: t.navBreadcrumb })
    expect(classesOf(crumb)).toEqual(expect.arrayContaining(["min-w-0", "flex-1"]))
  })

  it("collapses search to an icon button below xl", () => {
    renderHeader()
    const search = screen.getByRole("button", { name: t.searchButton })
    expect(search.className).toBe(SEARCH_BUTTON_CLASS)
    expect(classesOf(search)).toEqual(expect.arrayContaining(["h-9", "min-w-9", "shrink-0"]))
    const label = within(search).getByText(t.searchButton)
    expect(classesOf(label)).toEqual(expect.arrayContaining(["hidden", "xl:inline"]))
  })

  it("shows primary links inline from md and secondary items inline from lg", () => {
    renderHeader()
    const primary = screen.getByRole("navigation", { name: t.navPrimary })
    const [home, me, portfolio] = within(primary).getAllByRole("link")
    expect(home).toHaveAttribute("href", "/")
    expect(classesOf(home)).toEqual(expect.arrayContaining(bp.HEADER_PRIMARY_INLINE.split(" ")))
    expect(me).toHaveAttribute("href", "/me")
    expect(classesOf(me)).toEqual(expect.arrayContaining(bp.HEADER_PRIMARY_INLINE.split(" ")))
    expect(portfolio).toHaveAttribute("href", "/portfolio")
    expect(classesOf(portfolio)).toEqual(expect.arrayContaining(bp.HEADER_SECONDARY_INLINE.split(" ")))
    const admin = screen.getByRole("button", { name: (n) => n === t.navAdminMenu || n === `${t.navAdminMenu} ${t.navAdminMenu}` })
    expect(classesOf(admin.parentElement!)).toEqual(expect.arrayContaining(bp.HEADER_SECONDARY_INLINE.split(" ")))
    const language = within(primary).getByRole("combobox")
    expect(classesOf(language.closest("label")!)).toEqual(expect.arrayContaining(["hidden", "lg:inline-flex"]))
    expect(classesOf(language.closest("label")!)).not.toContain("inline-flex")
  })

  it("lists the collapsed items in the user menu, hidden again where they are inline", async () => {
    const user = userEvent.setup()
    renderHeader()
    const button = userMenuButton()
    expect(button).toHaveAttribute("aria-expanded", "false")
    await user.click(button)
    expect(button).toHaveAttribute("aria-expanded", "true")
    const panel = screen.getByTestId("user-menu-panel")
    expect(button).toHaveAttribute("aria-controls", panel.id)
    expect(within(panel).getByText("Hanako Admin")).toBeInTheDocument()

    const itemOf = (name: string) => within(panel).getByRole("link", { name }).closest("li, div")!
    expect(classesOf(itemOf(t.projectListTitle))).toContain(bp.HEADER_PRIMARY_IN_MENU)
    expect(classesOf(itemOf(t.myProfileMenu))).toContain(bp.HEADER_PRIMARY_IN_MENU)
    expect(classesOf(itemOf(t.portfolioNav))).toContain(bp.HEADER_SECONDARY_IN_MENU)
    const adminGroup = within(panel).getByRole("list", { name: t.navAdminMenu }).parentElement!
    expect(classesOf(adminGroup)).toContain(bp.HEADER_SECONDARY_IN_MENU)
    expect(within(adminGroup).getByRole("link", { name: t.userManagementTitle })).toHaveAttribute("href", "/admin/users")
    const langSelect = within(panel).getByRole("combobox")
    expect(classesOf(langSelect.closest("label")!.parentElement!)).toContain(bp.HEADER_SECONDARY_IN_MENU)
    // Logout is always in the menu.
    await user.click(within(panel).getByRole("button", { name: t.logout }))
    expect(auth.signOut).toHaveBeenCalled()
  })

  it("hides portfolio and admin entries for plain members", async () => {
    auth.session = { user: { id: "u2", name: "Dev User", role: "member" } }
    const user = userEvent.setup()
    renderHeader()
    await user.click(screen.getByRole("button", { name: `${t.navUserMenu}: Dev User` }))
    const panel = screen.getByTestId("user-menu-panel")
    expect(within(panel).queryByRole("link", { name: t.portfolioNav })).not.toBeInTheDocument()
    expect(within(panel).queryByRole("list", { name: t.navAdminMenu })).not.toBeInTheDocument()
    expect(within(panel).getByRole("link", { name: t.myProfileMenu })).toBeInTheDocument()
  })

  it("closes the user menu on Escape (focus back), outside click and navigation", async () => {
    const user = userEvent.setup()
    renderHeader()
    const button = userMenuButton()
    await user.click(button)
    await user.keyboard("{Escape}")
    expect(screen.queryByTestId("user-menu-panel")).not.toBeInTheDocument()
    expect(button).toHaveFocus()

    await user.click(button)
    fireEvent.pointerDown(document.body)
    expect(screen.queryByTestId("user-menu-panel")).not.toBeInTheDocument()

    await user.click(button)
    await user.click(within(screen.getByTestId("user-menu-panel")).getByRole("link", { name: t.myProfileMenu }))
    expect(screen.queryByTestId("user-menu-panel")).not.toBeInTheDocument()
  })

  it("anchors the user menu with a fixed, viewport-clamped position", async () => {
    const user = userEvent.setup()
    renderHeader()
    await user.click(userMenuButton())
    const panel = screen.getByTestId("user-menu-panel")
    expect(panel.style.position).toBe("fixed")
    expect(Number.parseFloat(panel.style.left)).toBeGreaterThanOrEqual(POPOVER_VIEWPORT_MARGIN)
  })
})

describe("placePopover", () => {
  const anchor = (left: number, right: number) => ({ top: 10, bottom: 46, left, right })

  it("right-aligns under the anchor when it fits", () => {
    expect(placePopover(anchor(1200, 1236), 384, 1280)).toEqual({ top: 54, left: 852, width: 384 })
  })

  it("shifts right instead of spilling past the left edge (bell far left at 1280px)", () => {
    const p = placePopover(anchor(260, 296), 384, 1280)
    expect(p.left).toBe(POPOVER_VIEWPORT_MARGIN)
    expect(p.left + p.width).toBeLessThanOrEqual(1280 - POPOVER_VIEWPORT_MARGIN)
  })

  it("shrinks to the viewport on a phone", () => {
    const p = placePopover(anchor(300, 336), 384, 375)
    expect(p).toEqual({ top: 54, left: 8, width: 359 })
  })

  it("never passes the right edge", () => {
    const p = placePopover(anchor(1270, 1400), 240, 1280)
    expect(p.left + p.width).toBeLessThanOrEqual(1280 - POPOVER_VIEWPORT_MARGIN)
  })
})
