import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import type { ReactNode } from "react"
import { getTranslations } from "@/lib/i18n"
import { stubLayout } from "../__tests__/helpers"

const nav = vi.hoisted(() => ({ pathname: "/projects/p1/backlog" }))
const auth = vi.hoisted(() => ({
  session: null as null | { user: { name?: string; role?: string } },
  signOut: vi.fn(),
}))

vi.mock("next/navigation", () => ({ usePathname: () => nav.pathname, useRouter: () => ({ push: vi.fn() }) }))
vi.mock("next/link", () => ({
  // Client-side navigation stub: run the caller's onClick but never let jsdom navigate.
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

const { Sidebar } = await import("@/components/sidebar")
const { Header } = await import("@/components/header")
const { AdminMenu } = await import("./admin-menu")
const { SidebarDrawerProvider, useSidebarDrawer, SIDEBAR_DRAWER_ID } = await import("./sidebar-drawer")
const { buildSidebarGroups, buildSidebarHome, isNavItemActive } = await import("./sidebar-nav")
const { resetSidebarCollapseStore, SIDEBAR_COLLAPSE_KEY, parseCollapsed } = await import("./sidebar-collapse")
const { resetSidebarRailStore, SIDEBAR_RAIL_KEY } = await import("./sidebar-rail")
const { LanguageProvider } = await import("@/lib/language-context")

stubLayout()

const t = getTranslations("en")
// Labels are rendered twice (visible on md+, sr-only below); jsdom has no CSS so both count.
const rx = (s: string) => (name: string) => name === s || name === `${s} ${s}`
let desktop = false

function memoryStorage(): Storage {
  const data = new Map<string, string>()
  return {
    get length() {
      return data.size
    },
    clear: () => data.clear(),
    getItem: (k: string) => data.get(k) ?? null,
    key: (i: number) => [...data.keys()][i] ?? null,
    removeItem: (k: string) => void data.delete(k),
    setItem: (k: string, v: string) => void data.set(k, String(v)),
  }
}

beforeEach(() => {
  nav.pathname = "/projects/p1/backlog"
  auth.session = null
  auth.signOut.mockClear()
  desktop = false
  Object.defineProperty(window, "localStorage", { value: memoryStorage(), configurable: true, writable: true })
  resetSidebarCollapseStore()
  resetSidebarRailStore()
  // The signed-in header polls the bell's unread count.
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ unreadCount: 0 }), { status: 200 })))
  vi.stubGlobal(
    "matchMedia",
    vi.fn((q: string) => ({
      media: q,
      get matches() {
        return desktop
      },
      addEventListener: () => {},
      removeEventListener: () => {},
    })),
  )
})
afterEach(() => {
  vi.unstubAllGlobals()
})

function Shell({ children }: { children: ReactNode }) {
  return (
    <LanguageProvider initialLanguage="en">
      <SidebarDrawerProvider>{children}</SidebarDrawerProvider>
    </LanguageProvider>
  )
}

describe("sidebar-nav", () => {
  it("builds four labelled sections (execute / plan / review / manage) keeping every route", () => {
    const groups = buildSidebarGroups("p9", t, { navIcebox: "I", navBacklog: "B", navSprints: "S", navReleases: "R" } as never, { showTrash: true })
    expect(groups.map((g) => g.id)).toEqual(["execute", "plan", "review", "manage"])
    expect(groups.map((g) => g.label)).toEqual([t.navGroupExecute, t.navGroupPlan, t.navGroupReview, t.navGroupManage])
    const paths = groups.map((g) => g.items.map((i) => i.href.replace("/projects/p9", "") || "/"))
    expect(paths).toEqual([
      ["/icebox", "/backlog", "/sprints", "/burndown"],
      ["/plan", "/gantt", "/calendar", "/releases"],
      ["/report", "/chat"],
      ["/settings", "/trash", "/guide"],
    ])
  })

  it("matches active items", () => {
    const groups = buildSidebarGroups("p9", t, { navIcebox: "I", navBacklog: "B", navSprints: "S", navReleases: "R" } as never)
    // The dashboard is pinned above the sections, not inside 計画.
    expect(groups.flatMap((g) => g.items).some((i) => i.href === "/projects/p9")).toBe(false)
    const dash = buildSidebarHome("p9", t)
    expect(dash).toMatchObject({ href: "/projects/p9", label: t.navDashboard, exact: true })
    expect(isNavItemActive("/projects/p9", dash)).toBe(true)
    expect(isNavItemActive("/projects/p9/backlog", dash)).toBe(false)
    const backlog = groups.flatMap((g) => g.items).find((i) => i.href === "/projects/p9/backlog")!
    expect(isNavItemActive("/projects/p9/backlog/123", backlog)).toBe(true)
    expect(isNavItemActive("/projects/p9/backlogx", backlog)).toBe(false)
  })

  it("adds the trash entry to the last group only when allowed", () => {
    const pt = { navIcebox: "I", navBacklog: "B", navSprints: "S", navReleases: "R" } as never
    const hrefs = (groups: ReturnType<typeof buildSidebarGroups>) => groups.flatMap((g) => g.items.map((i) => i.href))
    expect(hrefs(buildSidebarGroups("p9", t, pt))).not.toContain("/projects/p9/trash")
    const withTrash = buildSidebarGroups("p9", t, pt, { showTrash: true })
    const manage = withTrash[withTrash.length - 1]
    expect(manage.items.find((i) => i.href === "/projects/p9/trash")).toMatchObject({ label: t.trashTitle })
  })

  it("hides team settings and AI chat when not allowed (section manager, A3-13)", () => {
    const pt = { navIcebox: "I", navBacklog: "B", navSprints: "S", navReleases: "R" } as never
    const hrefs = (groups: ReturnType<typeof buildSidebarGroups>) => groups.flatMap((g) => g.items.map((i) => i.href))
    const full = hrefs(buildSidebarGroups("p9", t, pt))
    expect(full).toContain("/projects/p9/settings")
    expect(full).toContain("/projects/p9/chat")
    const reader = hrefs(buildSidebarGroups("p9", t, pt, { showSettings: false, showChat: false }))
    expect(reader).not.toContain("/projects/p9/settings")
    expect(reader).not.toContain("/projects/p9/chat")
    expect(reader).toContain("/projects/p9/guide")
  })
})

describe("Sidebar", () => {
  it("collapses to an icon rail with tooltips, keeps the current page and badges, and remembers the choice", async () => {
    desktop = true
    const { unmount } = render(
      <Shell>
        <Sidebar projectId="p1" projectName="Apollo" />
      </Shell>,
    )
    await userEvent.click(screen.getByRole("button", { name: t.navSidebarCollapse }))
    expect(window.localStorage.getItem(SIDEBAR_RAIL_KEY)).toBe("1")
    const navEl = screen.getByRole("navigation", { name: t.navProjectMenu })
    // every page is still one click away, named by its label; no section toggles, no footer
    const plan = within(navEl).getByRole("link", { name: t.planTitle })
    expect(plan.textContent).toBe("")
    expect(within(navEl).queryByRole("button", { name: t.navGroupPlan })).toBeNull()
    expect(within(navEl).getByRole("list", { name: t.navGroupPlan })).toBeInTheDocument()
    expect(screen.queryByText("Apollo")).toBeNull()
    const current = within(navEl).getAllByRole("link").filter((a) => a.getAttribute("aria-current") === "page")
    expect(current.map((a) => a.getAttribute("href"))).toEqual(["/projects/p1/backlog"])
    // hover / focus shows the name and description next to the rail
    fireEvent.mouseEnter(plan)
    expect(screen.getByRole("tooltip")).toHaveTextContent(t.planTitle)
    expect(screen.getByRole("tooltip")).toHaveTextContent(t.navDescPlan)
    fireEvent.mouseLeave(plan)
    expect(screen.queryByRole("tooltip")).toBeNull()
    unmount()

    // remembered on the next page view; the expand button brings the labels back
    render(
      <Shell>
        <Sidebar projectId="p1" projectName="Apollo" />
      </Shell>,
    )
    const expand = screen.getByRole("button", { name: t.navSidebarExpand })
    expect(expand).toHaveAttribute("aria-expanded", "false")
    await userEvent.click(expand)
    expect(screen.getByText("Apollo")).toBeInTheDocument()
    expect(window.localStorage.getItem(SIDEBAR_RAIL_KEY)).toBe("0")
  })

  it("marks only the current page link with aria-current=page", () => {
    desktop = true
    render(
      <Shell>
        <Sidebar projectId="p1" projectName="Apollo" />
      </Shell>,
    )
    const navEl = screen.getByRole("navigation", { name: t.navProjectMenu })
    const current = within(navEl).getAllByRole("link").filter((a) => a.getAttribute("aria-current") === "page")
    expect(current).toHaveLength(1)
    expect(current[0]).toHaveAttribute("href", "/projects/p1/backlog")
    expect(screen.getByText("Apollo")).toBeInTheDocument()
    // project-type badge (software)
    expect(screen.getByTitle(t.navProjectType)).toBeInTheDocument()
  })

  it("renders single-line links named by their label, descriptions read once, no headings", () => {
    desktop = true
    render(
      <Shell>
        <Sidebar projectId="p1" projectName="Apollo" />
      </Shell>,
    )
    const navEl = screen.getByRole("navigation", { name: t.navProjectMenu })
    // group labels are not headings (the page h1 must come first)
    expect(within(navEl).queryAllByRole("heading")).toHaveLength(0)
    expect(within(navEl).getByRole("list", { name: t.navGroupPlan })).toBeInTheDocument()
    // inactive: name = label, description only as tooltip
    const plan = within(navEl).getByRole("link", { name: t.planTitle })
    expect(plan).toHaveAttribute("title", t.navDescPlan)
    expect(plan).not.toHaveAttribute("aria-describedby")
    // active: description shown and referenced, no duplicate title
    const active = navEl.querySelector('[aria-current="page"]') as HTMLElement
    expect(active).not.toHaveAttribute("title")
    expect(active).toHaveAccessibleDescription(t.navDescBacklog)
    expect(active.textContent).not.toContain(t.navDescBacklog)
  })

  it("collapses a section, remembers it in localStorage and keeps the current page visible", async () => {
    desktop = true
    render(
      <Shell>
        <Sidebar projectId="p1" />
      </Shell>,
    )
    const navEl = screen.getByRole("navigation", { name: t.navProjectMenu })
    const planToggle = within(navEl).getByRole("button", { name: t.navGroupPlan })
    expect(planToggle).toHaveAttribute("aria-expanded", "true")
    expect(planToggle).toHaveAttribute("aria-controls", within(navEl).getByRole("list", { name: t.navGroupPlan }).id)
    await userEvent.click(planToggle)
    expect(planToggle).toHaveAttribute("aria-expanded", "false")
    expect(within(navEl).queryByRole("link", { name: t.ganttTitle })).not.toBeInTheDocument()
    expect(JSON.parse(window.localStorage.getItem(SIDEBAR_COLLAPSE_KEY)!)).toEqual(["plan"])

    // The section holding the current page (backlog) only shows that link when collapsed.
    const execToggle = within(navEl).getByRole("button", { name: t.navGroupExecute })
    await userEvent.click(execToggle)
    const execList = within(navEl).getByRole("list", { name: t.navGroupExecute })
    expect(within(execList).getAllByRole("link")).toHaveLength(1)
    expect(within(execList).getByRole("link")).toHaveAttribute("aria-current", "page")

    await userEvent.click(planToggle)
    expect(within(navEl).getByRole("link", { name: t.ganttTitle })).toBeInTheDocument()
    expect(JSON.parse(window.localStorage.getItem(SIDEBAR_COLLAPSE_KEY)!)).toEqual(["execute"])
  })

  it("restores collapsed sections from localStorage and ignores malformed data", () => {
    desktop = true
    window.localStorage.setItem(SIDEBAR_COLLAPSE_KEY, JSON.stringify(["review"]))
    const { unmount } = render(
      <Shell>
        <Sidebar projectId="p1" />
      </Shell>,
    )
    expect(screen.getByRole("button", { name: t.navGroupReview })).toHaveAttribute("aria-expanded", "false")
    expect(screen.queryByRole("link", { name: t.chatTitle })).not.toBeInTheDocument()
    unmount()
    expect(parseCollapsed("{nope")).toEqual([])
    expect(parseCollapsed('{"a":1}')).toEqual([])
    expect(parseCollapsed('["a",2]')).toEqual(["a"])
  })

  it("still toggles when localStorage is unavailable", async () => {
    desktop = true
    const blocked = () => {
      throw new Error("blocked")
    }
    Object.defineProperty(window, "localStorage", {
      value: { ...memoryStorage(), getItem: blocked, setItem: blocked },
      configurable: true,
      writable: true,
    })
    render(
      <Shell>
        <Sidebar projectId="p1" />
      </Shell>,
    )
    const toggle = screen.getByRole("button", { name: t.navGroupManage })
    await userEvent.click(toggle)
    expect(toggle).toHaveAttribute("aria-expanded", "false")
    await userEvent.click(toggle)
    expect(toggle).toHaveAttribute("aria-expanded", "true")
  })

  it("closes the drawer immediately when reduced motion is preferred", async () => {
    render(
      <Shell>
        <Header projectId="p1" projectName="Apollo" />
        <Sidebar projectId="p1" />
      </Shell>,
    )
    await userEvent.click(screen.getByRole("button", { name: t.navOpenMenu }))
    vi.stubGlobal(
      "matchMedia",
      vi.fn((q: string) => ({
        media: q,
        matches: q.includes("reduce"),
        addEventListener: () => {},
        removeEventListener: () => {},
      })),
    )
    // re-open with the new media state
    await userEvent.keyboard("{Escape}")
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument())
    await userEvent.click(screen.getByRole("button", { name: t.navOpenMenu }))
    await userEvent.click(screen.getByRole("button", { name: t.navCloseMenu }))
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
  })

  it("opens the mobile drawer from the header hamburger, traps focus and closes on Escape", async () => {
    // Arrange
    render(
      <Shell>
        <Header projectId="p1" projectName="Apollo" />
        <Sidebar projectId="p1" projectName="Apollo" />
      </Shell>,
    )
    const burger = screen.getByRole("button", { name: t.navOpenMenu })
    expect(burger).toHaveAttribute("aria-expanded", "false")
    expect(burger).toHaveAttribute("aria-controls", SIDEBAR_DRAWER_ID)
    // Act
    await userEvent.click(burger)
    // Assert
    const drawer = screen.getByRole("dialog", { name: t.navDrawerLabel })
    expect(t.navDrawerLabel).not.toBe(t.navProjectMenu)
    expect(drawer).toHaveAttribute("id", SIDEBAR_DRAWER_ID)
    expect(burger).toHaveAttribute("aria-expanded", "true")
    expect(document.body.style.overflow).toBe("hidden")
    await waitFor(() => expect(drawer.contains(document.activeElement)).toBe(true))
    await userEvent.keyboard("{Escape}")
    // slide-out animation, then unmount
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument())
    // The scroll lock is released in the drawer's cleanup, which can land just after the unmount under load.
    await waitFor(() => expect(document.body.style.overflow).toBe(""))
  })

  it("closes the drawer via its close button and the backdrop", async () => {
    render(
      <Shell>
        <Header projectId="p1" projectName="Apollo" />
        <Sidebar projectId="p1" />
      </Shell>,
    )
    await userEvent.click(screen.getByRole("button", { name: t.navOpenMenu }))
    await userEvent.click(screen.getByRole("button", { name: t.navCloseMenu }))
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument())

    await userEvent.click(screen.getByRole("button", { name: t.navOpenMenu }))
    const backdrop = screen.getByRole("dialog").previousElementSibling as HTMLElement
    fireEvent.click(backdrop)
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument())
  })

  it("closes the drawer automatically on navigation", async () => {
    const { rerender } = render(
      <Shell>
        <Header projectId="p1" projectName="Apollo" />
        <Sidebar projectId="p1" />
      </Shell>,
    )
    await userEvent.click(screen.getByRole("button", { name: t.navOpenMenu }))
    expect(screen.getByRole("dialog")).toBeInTheDocument()
    nav.pathname = "/projects/p1/sprints"
    rerender(
      <Shell>
        <Header projectId="p1" projectName="Apollo" />
        <Sidebar projectId="p1" />
      </Shell>,
    )
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
  })

  it("never shows the drawer on desktop", () => {
    desktop = true
    function Opener() {
      const d = useSidebarDrawer()
      return (
        <button type="button" onClick={d?.open}>
          force
        </button>
      )
    }
    render(
      <Shell>
        <Opener />
        <Sidebar projectId="p1" />
      </Shell>,
    )
    fireEvent.click(screen.getByRole("button", { name: "force" }))
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
  })
})

describe("Header", () => {
  it("shows no hamburger outside a project layout and no primary nav when signed out", () => {
    render(
      <LanguageProvider initialLanguage="en">
        <Header />
      </LanguageProvider>,
    )
    expect(screen.queryByRole("button", { name: t.navOpenMenu })).not.toBeInTheDocument()
    expect(screen.queryByRole("navigation", { name: t.navPrimary })).not.toBeInTheDocument()
  })

  it("renders the signed-in nav with aria-current, initials, breadcrumb and logout", async () => {
    auth.session = { user: { name: "taro yamada", role: "member" } }
    nav.pathname = "/projects/p1"
    render(
      <LanguageProvider initialLanguage="en">
        <Header projectId="p1" projectName="Apollo" />
      </LanguageProvider>,
    )
    const crumb = screen.getByRole("navigation", { name: t.navBreadcrumb })
    expect(within(crumb).getByRole("link")).toHaveAttribute("aria-current", "page")
    expect(screen.getByText("TA")).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: rx(t.navAdminMenu) })).not.toBeInTheDocument()
    // Logout lives in the user menu (avatar button).
    await userEvent.click(screen.getByRole("button", { name: `${t.navUserMenu}: taro yamada` }))
    await userEvent.click(screen.getByRole("button", { name: t.logout }))
    expect(auth.signOut).toHaveBeenCalled()
  })

  it("marks the home link current on / and shows the admin menu for admins", () => {
    auth.session = { user: { role: "admin" } }
    nav.pathname = "/"
    render(
      <LanguageProvider initialLanguage="en">
        <Header />
      </LanguageProvider>,
    )
    const primary = screen.getByRole("navigation", { name: t.navPrimary })
    const home = within(primary).getAllByRole("link")[0]
    expect(home).toHaveAttribute("aria-current", "page")
    expect(screen.getByText("?")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: rx(t.navAdminMenu) })).toBeInTheDocument()
  })
})

describe("AdminMenu", () => {
  function renderMenu() {
    render(
      <LanguageProvider initialLanguage="en">
        <AdminMenu />
        <button type="button">outside</button>
      </LanguageProvider>,
    )
    return screen.getByRole("button", { name: rx(t.navAdminMenu) })
  }

  it("is a menu button that opens on click and focuses the first item", async () => {
    const button = renderMenu()
    expect(button).toHaveAttribute("aria-haspopup", "menu")
    expect(button).toHaveAttribute("aria-expanded", "false")
    await userEvent.click(button)
    expect(button).toHaveAttribute("aria-expanded", "true")
    const menu = screen.getByRole("menu", { name: t.navAdminMenu })
    expect(button).toHaveAttribute("aria-controls", menu.id)
    const items = screen.getAllByRole("menuitem")
    expect(items).toHaveLength(8)
    expect(items.map((i) => i.getAttribute("href"))).toEqual(expect.arrayContaining(["/admin/api-tokens", "/admin/metrics"]))
    expect(items[0]).toHaveFocus()
    expect(items[0]).toHaveAttribute("tabindex", "0")
    expect(items[1]).toHaveAttribute("tabindex", "-1")
    await userEvent.click(button)
    expect(screen.queryByRole("menu")).not.toBeInTheDocument()
  })

  it("supports arrow keys, Home/End and wraps around", async () => {
    const button = renderMenu()
    button.focus()
    await userEvent.keyboard("{ArrowDown}")
    const items = screen.getAllByRole("menuitem")
    expect(items[0]).toHaveFocus()
    await userEvent.keyboard("{ArrowDown}")
    expect(items[1]).toHaveFocus()
    await userEvent.keyboard("{End}")
    expect(items[items.length - 1]).toHaveFocus()
    await userEvent.keyboard("{ArrowDown}")
    expect(items[0]).toHaveFocus()
    await userEvent.keyboard("{ArrowUp}")
    expect(items[items.length - 1]).toHaveFocus()
    await userEvent.keyboard("{Home}")
    expect(items[0]).toHaveFocus()
    await userEvent.keyboard("{ArrowUp}")
    expect(items[items.length - 1]).toHaveFocus()
  })

  it("ArrowUp on the button opens on the last item", async () => {
    const button = renderMenu()
    button.focus()
    await userEvent.keyboard("{ArrowUp}")
    const items = screen.getAllByRole("menuitem")
    expect(items[items.length - 1]).toHaveFocus()
  })

  it("Escape closes the menu and returns focus to the button", async () => {
    const button = renderMenu()
    await userEvent.click(button)
    await userEvent.keyboard("{Escape}")
    expect(screen.queryByRole("menu")).not.toBeInTheDocument()
    expect(button).toHaveFocus()
  })

  it("Tab, outside click and selecting an item close the menu", async () => {
    const button = renderMenu()
    await userEvent.click(button)
    await userEvent.keyboard("{Tab}")
    expect(screen.queryByRole("menu")).not.toBeInTheDocument()

    await userEvent.click(button)
    fireEvent.pointerDown(screen.getByRole("menu"))
    expect(screen.getByRole("menu")).toBeInTheDocument()
    fireEvent.pointerDown(screen.getByRole("button", { name: "outside" }))
    expect(screen.queryByRole("menu")).not.toBeInTheDocument()

    await userEvent.click(button)
    fireEvent.click(screen.getAllByRole("menuitem")[2])
    expect(screen.queryByRole("menu")).not.toBeInTheDocument()
  })

  it("marks the current admin page with aria-current", async () => {
    nav.pathname = "/admin/sections/abc"
    const button = renderMenu()
    await userEvent.click(button)
    const current = screen.getAllByRole("menuitem").filter((i) => i.getAttribute("aria-current") === "page")
    expect(current).toHaveLength(1)
    expect(current[0]).toHaveAttribute("href", "/admin/sections")
  })
})
