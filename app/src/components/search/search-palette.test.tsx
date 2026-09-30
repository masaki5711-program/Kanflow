import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, renderHook, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { jsonResponse, renderWithProviders, stubFetch, tr } from "@/app/__tests__/test-utils"
import { stubLayout } from "@/components/__tests__/helpers"
import type { SearchResultDto } from "@/services/search/search.types"
import { SearchPalette } from "./search-palette"
import { buildPaletteCommands, filterCommands, projectIdFromPath } from "./palette-commands"
import { useSearchResults } from "./use-search-results"

const router = vi.hoisted(() => ({ push: vi.fn() }))
vi.mock("next/navigation", () => ({ useRouter: () => router, usePathname: () => "/projects/p1" }))

stubLayout()

const t = tr("en")
const RESULT: SearchResultDto = {
  query: "login",
  groups: [
    {
      type: "pbi",
      items: [
        {
          type: "pbi",
          id: "b1",
          projectId: "p1",
          projectName: "Apollo",
          projectI18n: {},
          title: "Login page\nsecond line",
          titleField: "initiative",
          i18n: {},
          displayId: 12,
          context: null,
          status: "ready",
          href: "/projects/p1/backlog?pbi=b1",
        },
      ],
    },
    {
      type: "task",
      items: [
        {
          type: "task",
          id: "t1",
          projectId: "p1",
          projectName: "Apollo",
          projectI18n: {},
          title: "Write login tests",
          titleField: "taskName",
          i18n: {},
          displayId: null,
          context: "Sprint 3",
          status: "todo",
          href: "/projects/p1/sprints?task=t1",
        },
      ],
    },
  ],
}

beforeEach(() => router.push.mockClear())
afterEach(() => vi.unstubAllGlobals())

function renderPalette(onClose = vi.fn(), projectId: string | null = "p1") {
  renderWithProviders(<SearchPalette open onClose={onClose} projectId={projectId} />, { language: "en" })
  return { onClose, input: screen.getByRole("combobox", { name: t.searchInputLabel }) }
}

const activeOption = () => {
  const input = screen.getByRole("combobox")
  const id = input.getAttribute("aria-activedescendant")
  return id ? document.getElementById(id) : null
}

describe("SearchPalette", () => {
  it("opens focused on an accessible combobox listing the commands", async () => {
    stubFetch([])
    const { input } = renderPalette()
    expect(screen.getByRole("dialog", { name: t.searchDialogTitle })).toBeInTheDocument()
    await waitFor(() => expect(input).toHaveFocus())
    expect(input).toHaveAttribute("aria-controls", screen.getByRole("listbox").id)
    expect(input).toHaveAttribute("aria-expanded", "true")
    expect(screen.getByRole("group", { name: t.searchGroupCommands })).toBeInTheDocument()
    expect(screen.getByRole("option", { name: "Go to Product Backlog" })).toBeInTheDocument()
    expect(activeOption()).toHaveAttribute("aria-selected", "true")
  })

  it("arrow keys move the active option with wrap-around; Enter navigates and closes", async () => {
    stubFetch([])
    const user = userEvent.setup()
    const { input, onClose } = renderPalette()
    const options = screen.getAllByRole("option")
    expect(activeOption()).toBe(options[0])
    await user.type(input, "{ArrowDown}")
    expect(activeOption()).toBe(options[1])
    await user.type(input, "{ArrowUp}{ArrowUp}")
    expect(activeOption()).toBe(options[options.length - 1])
    await user.type(input, "{ArrowDown}")
    expect(activeOption()).toBe(options[0])
    await user.type(input, "{Enter}")
    expect(onClose).toHaveBeenCalled()
    expect(router.push).toHaveBeenCalledWith("/projects/p1")
  })

  it("asks for 2+ characters and does not call the API for one", async () => {
    const fetchMock = stubFetch([])
    const user = userEvent.setup()
    const { input } = renderPalette()
    await user.type(input, "x")
    expect(within(screen.getByRole("dialog")).getByRole("status")).toHaveTextContent(t.searchMinChars)
    await new Promise((r) => setTimeout(r, 250))
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("debounces, shows grouped results with project names and opens a hit", async () => {
    const fetchMock = stubFetch([{ match: /\/api\/search\?/, respond: () => jsonResponse(RESULT) }])
    const user = userEvent.setup()
    const { input, onClose } = renderPalette()
    await user.type(input, "login")
    expect(await screen.findByRole("group", { name: t.searchGroupPbi })).toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(String(fetchMock.mock.calls[0][0])).toBe("/api/search?q=login&limit=5")
    expect(screen.getByRole("group", { name: t.searchGroupTask })).toBeInTheDocument()
    const pbi = screen.getByRole("option", { name: /PBI-12\s*Login page/ })
    expect(pbi).toHaveTextContent("Apollo")
    expect(pbi).not.toHaveTextContent("second line")
    expect(screen.getByRole("option", { name: /Write login tests/ })).toHaveTextContent("Apollo / Sprint 3")
    expect(within(screen.getByRole("dialog")).getByRole("status")).toHaveTextContent("2")
    // results come first while searching
    expect(activeOption()).toBe(pbi)
    await user.type(input, "{Enter}")
    expect(router.push).toHaveBeenCalledWith("/projects/p1/backlog?pbi=b1")
    expect(onClose).toHaveBeenCalled()
  })

  it("clicking an option selects it", async () => {
    stubFetch([{ match: /\/api\/search\?/, respond: () => jsonResponse(RESULT) }])
    const user = userEvent.setup()
    const { input } = renderPalette()
    await user.type(input, "login")
    await user.click(await screen.findByRole("option", { name: /Write login tests/ }))
    expect(router.push).toHaveBeenCalledWith("/projects/p1/sprints?task=t1")
  })

  it("shows the empty and error states", async () => {
    let fail = false
    stubFetch([
      {
        match: /\/api\/search\?/,
        respond: () => (fail ? jsonResponse({ error: "x" }, 500) : jsonResponse({ query: "zzz", groups: [] })),
      },
    ])
    const user = userEvent.setup()
    const { input } = renderPalette()
    await user.type(input, "zzz")
    expect(await screen.findByText(/Nothing matches “zzz”/)).toBeInTheDocument()
    fail = true
    await user.type(input, "q")
    expect(await screen.findByText(t.searchFailed)).toBeInTheDocument()
  })

  it("switches the display language from a command", async () => {
    stubFetch([])
    const user = userEvent.setup()
    const { input, onClose } = renderPalette(vi.fn(), null)
    await user.type(input, "Bahasa")
    const cmd = screen.getByRole("option", { name: /Bahasa Indonesia/ })
    await user.click(cmd)
    expect(onClose).toHaveBeenCalled()
    expect(await screen.findByRole("dialog", { name: tr("id").searchDialogTitle })).toBeInTheDocument()
  })
})

describe("useSearchResults", () => {
  it("aborts the stale request when the query changes", async () => {
    const signals: AbortSignal[] = []
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init?: RequestInit) => {
        signals.push(init!.signal!)
        return new Promise<Response>(() => {})
      }),
    )
    vi.useFakeTimers()
    const { result, rerender } = renderHook(({ q }) => useSearchResults(q), { initialProps: { q: "ab" } })
    expect(result.current.status).toBe("loading")
    await act(async () => vi.advanceTimersByTime(200))
    expect(signals).toHaveLength(1)
    rerender({ q: "abc" })
    expect(signals[0].aborted).toBe(true)
    await act(async () => vi.advanceTimersByTime(199))
    expect(signals).toHaveLength(1)
    await act(async () => vi.advanceTimersByTime(1))
    expect(signals).toHaveLength(2)
    rerender({ q: "" })
    expect(result.current.status).toBe("idle")
    vi.useRealTimers()
  })
})

describe("palette-commands", () => {
  it("builds project page commands (no trash) plus global and language ones", () => {
    const cmds = buildPaletteCommands({ projectId: "p1", t, pt: { navIcebox: "I", navBacklog: "B", navSprints: "S", navReleases: "R" } as never, language: "en" })
    const hrefs = cmds.flatMap((c) => (c.action.kind === "navigate" ? [c.action.href] : []))
    expect(hrefs).toContain("/projects/p1/backlog")
    expect(hrefs).toContain("/projects/p1/burndown")
    expect(hrefs).not.toContain("/projects/p1/trash")
    expect(hrefs).toEqual(expect.arrayContaining(["/", "/me"]))
    const langs = cmds.flatMap((c) => (c.action.kind === "language" ? [c.action.language] : []))
    expect(langs).toEqual(["ja", "id"])
    expect(filterCommands(cmds, "GO TO B").map((c) => c.label)).toEqual(["Go to B", `Go to ${t.burndownPageTitle}`])
    expect(filterCommands(cmds, "  ")).toHaveLength(cmds.length)
  })

  it("has no project commands outside a project", () => {
    const cmds = buildPaletteCommands({ projectId: null, t, pt: {} as never, language: "ja" })
    expect(cmds.every((c) => c.action.kind === "language" || !("href" in c.action) || !c.action.href.startsWith("/projects"))).toBe(true)
  })

  it("projectIdFromPath", () => {
    expect(projectIdFromPath("/projects/abc/backlog")).toBe("abc")
    expect(projectIdFromPath("/projects/abc")).toBe("abc")
    expect(projectIdFromPath("/me")).toBeNull()
    expect(projectIdFromPath(null)).toBeNull()
  })
})
