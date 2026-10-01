import { beforeEach, afterEach, describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import type { ReactNode } from "react"
import { getTranslations } from "@/lib/i18n"
import { stubLayout } from "../__tests__/helpers"

const nav = vi.hoisted(() => ({ pathname: "/projects/p1/backlog" }))

vi.mock("next/navigation", () => ({ usePathname: () => nav.pathname, useRouter: () => ({ push: vi.fn() }) }))
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: ReactNode }) => (
    <a href={href} {...rest} onClick={(e) => e.preventDefault()}>
      {children}
    </a>
  ),
}))

const { Sidebar } = await import("@/components/sidebar")
const { SidebarDrawerProvider, useSidebarDrawer } = await import("./sidebar-drawer")
const { buildSidebarGroups, findActiveGroupId } = await import("./sidebar-nav")
const { resetSidebarCollapseStore, SIDEBAR_COLLAPSE_KEY } = await import("./sidebar-collapse")
const { LanguageProvider } = await import("@/lib/language-context")

stubLayout()

const t = getTranslations("en")
const ja = getTranslations("ja")
const idT = getTranslations("id")
let desktop = true

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
  desktop = true
  Object.defineProperty(window, "localStorage", { value: memoryStorage(), configurable: true, writable: true })
  resetSidebarCollapseStore()
  vi.stubGlobal(
    "matchMedia",
    vi.fn((q: string) => ({
      media: q,
      get matches() {
        return desktop && !q.includes("reduce")
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

const stored = () => JSON.parse(window.localStorage.getItem(SIDEBAR_COLLAPSE_KEY) ?? "[]") as string[]
const projectNav = () => screen.getByRole("navigation", { name: t.navProjectMenu })

describe("findActiveGroupId", () => {
  const pt = { navIcebox: "I", navBacklog: "B", navSprints: "S", navReleases: "R" } as never
  const groups = buildSidebarGroups("p1", t, pt, { showTrash: true })

  it("returns the section holding the current page", () => {
    expect(findActiveGroupId(groups, "/projects/p1")).toBe("plan")
    expect(findActiveGroupId(groups, "/projects/p1/sprints/s3")).toBe("execute")
    expect(findActiveGroupId(groups, "/projects/p1/chat")).toBe("review")
    expect(findActiveGroupId(groups, "/projects/p1/trash")).toBe("manage")
  })

  it("returns undefined outside the project menu", () => {
    expect(findActiveGroupId(groups, "/projects/p1/unknown")).toBeUndefined()
    expect(findActiveGroupId(groups, "/projects")).toBeUndefined()
  })
})

describe("Sidebar section headings", () => {
  it("renders every heading as a full-row disclosure button, distinct from the links", () => {
    render(
      <Shell>
        <Sidebar projectId="p1" />
      </Shell>,
    )
    const navEl = projectNav()
    for (const label of [t.navGroupPlan, t.navGroupExecute, t.navGroupReview, t.navGroupManage]) {
      const toggle = within(navEl).getByRole("button", { name: label })
      expect(toggle).toHaveAttribute("aria-expanded", "true")
      expect(toggle.tagName).toBe("BUTTON")
      // the list it controls is labelled by the heading
      expect(within(navEl).getByRole("list", { name: label }).id).toBe(toggle.getAttribute("aria-controls"))
      // a section label, not an item: no item-like hover fill
      expect(toggle.className).not.toMatch(/hover:bg-/)
    }
    // headings are not links
    expect(within(navEl).queryByRole("link", { name: t.navGroupPlan })).not.toBeInTheDocument()
  })

  it("separates sections with a divider (all but the first)", () => {
    const { container } = render(
      <Shell>
        <Sidebar projectId="p1" />
      </Shell>,
    )
    const sections = [...container.querySelectorAll<HTMLElement>("aside [data-sidebar-group]")]
    expect(sections.map((s) => s.dataset.sidebarGroup)).toEqual(["plan", "execute", "review", "manage"])
    expect(sections[0].className).not.toContain("border-t")
    for (const s of sections.slice(1)) expect(s.className).toContain("border-t")
  })

  it("toggles from the keyboard and rotates the chevron", async () => {
    render(
      <Shell>
        <Sidebar projectId="p1" />
      </Shell>,
    )
    const toggle = within(projectNav()).getByRole("button", { name: t.navGroupReview })
    toggle.focus()
    await userEvent.keyboard("{Enter}")
    expect(toggle).toHaveAttribute("aria-expanded", "false")
    expect(toggle.querySelector("svg")?.getAttribute("class")).toContain("-rotate-90")
    expect(screen.queryByRole("link", { name: t.chatTitle })).not.toBeInTheDocument()
    await userEvent.keyboard(" ")
    expect(toggle).toHaveAttribute("aria-expanded", "true")
    expect(toggle.querySelector("svg")?.getAttribute("class")).not.toContain("-rotate-90")
    expect(stored()).toEqual([])
  })

  it("shows how many items a collapsed section hides", async () => {
    render(
      <Shell>
        <Sidebar projectId="p1" />
      </Shell>,
    )
    const toggle = within(projectNav()).getByRole("button", { name: t.navGroupPlan })
    await userEvent.click(toggle)
    // 5 plan items hidden; the count is decorative so the name stays the label
    expect(toggle).toHaveTextContent("5")
    expect(toggle).toHaveAccessibleName(t.navGroupPlan)
  })
})

describe("Sidebar expand / collapse all", () => {
  it("collapses every section (current page stays visible) and opens them again", async () => {
    render(
      <Shell>
        <Sidebar projectId="p1" />
      </Shell>,
    )
    const navEl = projectNav()
    await userEvent.click(within(navEl).getByRole("button", { name: t.navCollapseAll }))
    expect(stored()).toEqual(["plan", "execute", "review", "manage"])
    for (const label of [t.navGroupPlan, t.navGroupExecute, t.navGroupReview, t.navGroupManage]) {
      expect(within(navEl).getByRole("button", { name: label })).toHaveAttribute("aria-expanded", "false")
    }
    const links = within(navEl).getAllByRole("link")
    expect(links).toHaveLength(1)
    expect(links[0]).toHaveAttribute("aria-current", "page")

    await userEvent.click(within(navEl).getByRole("button", { name: t.navExpandAll }))
    expect(stored()).toEqual([])
    expect(within(navEl).getByRole("link", { name: t.ganttTitle })).toBeInTheDocument()
    expect(within(navEl).getByRole("button", { name: t.navCollapseAll })).toBeInTheDocument()
  })

  it("offers 'expand all' as soon as one section is collapsed", async () => {
    render(
      <Shell>
        <Sidebar projectId="p1" />
      </Shell>,
    )
    const navEl = projectNav()
    await userEvent.click(within(navEl).getByRole("button", { name: t.navGroupManage }))
    expect(within(navEl).getByRole("button", { name: t.navExpandAll })).toBeInTheDocument()
  })

  it("has the labels in all three languages", () => {
    expect([ja.navExpandAll, ja.navCollapseAll]).toEqual(["すべて展開", "すべて折りたたむ"])
    expect(idT.navExpandAll).toBeTruthy()
    expect(idT.navCollapseAll).toBeTruthy()
    expect(new Set([t.navExpandAll, ja.navExpandAll, idT.navExpandAll]).size).toBe(3)
  })
})

describe("Sidebar active-section behaviour", () => {
  it("keeps a section collapsed on load and shows only the current page under it", () => {
    window.localStorage.setItem(SIDEBAR_COLLAPSE_KEY, JSON.stringify(["execute"]))
    render(
      <Shell>
        <Sidebar projectId="p1" />
      </Shell>,
    )
    const navEl = projectNav()
    expect(within(navEl).getByRole("button", { name: t.navGroupExecute })).toHaveAttribute("aria-expanded", "false")
    const list = within(navEl).getByRole("list", { name: t.navGroupExecute })
    const links = within(list).getAllByRole("link")
    expect(links).toHaveLength(1)
    expect(links[0]).toHaveAttribute("aria-current", "page")
    expect(links[0].className).toContain("bg-primary-soft")
  })

  it("opens the collapsed section of the page the user navigates to", () => {
    window.localStorage.setItem(SIDEBAR_COLLAPSE_KEY, JSON.stringify(["plan", "review"]))
    // a fresh element each time so React re-renders and re-reads the pathname
    const view = () => (
      <Shell>
        <Sidebar projectId="p1" />
      </Shell>
    )
    const { rerender } = render(view())
    expect(screen.getByRole("button", { name: t.navGroupPlan })).toHaveAttribute("aria-expanded", "false")

    nav.pathname = "/projects/p1/gantt"
    rerender(view())
    expect(screen.getByRole("button", { name: t.navGroupPlan })).toHaveAttribute("aria-expanded", "true")
    expect(screen.getByRole("link", { name: t.calendarTitle })).toBeInTheDocument()
    // other collapsed sections are left alone
    expect(screen.getByRole("button", { name: t.navGroupReview })).toHaveAttribute("aria-expanded", "false")
    expect(stored()).toEqual(["review"])
  })
})

describe("Sidebar mobile drawer", () => {
  it("uses the same section structure and shares the collapsed state", async () => {
    desktop = false
    function Opener() {
      const d = useSidebarDrawer()
      return (
        <button type="button" onClick={d?.open}>
          open drawer
        </button>
      )
    }
    render(
      <Shell>
        <Opener />
        <Sidebar projectId="p1" />
      </Shell>,
    )
    fireEvent.click(screen.getByRole("button", { name: "open drawer" }))
    const drawer = screen.getByRole("dialog", { name: t.navDrawerLabel })
    expect(within(drawer).getByRole("button", { name: t.navCollapseAll })).toBeInTheDocument()
    const toggle = within(drawer).getByRole("button", { name: t.navGroupPlan })
    await userEvent.click(toggle)
    expect(toggle).toHaveAttribute("aria-expanded", "false")
    // the desktop aside (also mounted in jsdom) follows the same store
    const aside = document.querySelector("aside") as HTMLElement
    expect(within(aside).getByRole("button", { name: t.navGroupPlan })).toHaveAttribute("aria-expanded", "false")
  })
})
