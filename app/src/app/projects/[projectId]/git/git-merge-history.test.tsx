import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { getTranslations } from "@/lib/i18n"
import { fillTemplate } from "@/lib/fill-template"
import { jsonResponse, renderWithProviders } from "../settings/__tests__/providers"

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}))

/** The section's live refresh, captured so a test can play "a sync happened". */
const live = vi.hoisted(() => ({ refetch: () => {}, filter: null as unknown }))
vi.mock("@/components/realtime/use-live-refetch", () => ({
  useLiveRefetch: (refetch: () => void, filter: unknown) => {
    live.refetch = refetch
    live.filter = filter
  },
}))

const { GitMergeHistory } = await import("./git-merge-history")
const t = getTranslations("ja")
const PATH = "/api/projects/p1/git/merge-history"

const REPOS = [
  { id: "r1", name: "生産管理 API" },
  { id: "r2", name: "現場端末" },
]
const HOUR = 3_600_000
const merged = new Date(Date.now() - 5 * 24 * HOUR)

function item(iid: number, over: Record<string, unknown> = {}) {
  return {
    id: `r1:${iid}`,
    ref: String(iid),
    title: `PBI-12 変更 ${iid}`,
    url: `https://git.example.test/-/projects/7/pull/${iid}`,
    mergedAt: merged.toISOString(),
    openedAt: new Date(merged.getTime() - 3 * 24 * HOUR).toISOString(),
    author: "Sato",
    mergedBy: "Suzuki",
    sourceBranch: `feat/PBI-12-change-${iid}`,
    targetBranch: "main",
    repository: REPOS[0],
    pbis: [{ id: "b12", displayId: 12, title: "ログインできる" }],
    ...over,
  }
}

type Handler = (params: URLSearchParams) => Response
let handler: Handler = () => jsonResponse({ enabled: true, items: [], nextCursor: null })
const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
  const [path, search = ""] = String(input).split("?")
  if (path === PATH) return handler(new URLSearchParams(search))
  return jsonResponse({})
})
/** The query strings of the history requests so far, in order. */
const requests = () => fetchMock.mock.calls.map(([u]) => String(u)).filter((u) => u.startsWith(PATH)).map((u) => new URLSearchParams(u.split("?")[1] ?? ""))
const lastRequest = () => requests().at(-1) as URLSearchParams

beforeEach(() => {
  handler = () => jsonResponse({ enabled: true, items: [], nextCursor: null })
  fetchMock.mockClear()
  vi.stubGlobal("fetch", fetchMock)
})
afterEach(() => vi.unstubAllGlobals())

const renderHistory = (repositories = REPOS) => renderWithProviders(<GitMergeHistory projectId="p1" repositories={repositories} />)
const section = () => screen.getByRole("region", { name: t.gitMergesTitle })
/** The always-present screen-reader announcement (the loading skeleton is a busy status of its own). */
const announcement = () => within(section()).getByRole("status", { busy: false })

describe("GitMergeHistory", () => {
  it("lists the merges with what Kanflow knows about each", async () => {
    handler = () => jsonResponse({ enabled: true, items: [item(42), item(43, { pbis: [...item(43).pbis, { id: "b13", displayId: 13, title: "ログアウトできる" }] })], nextCursor: null })
    renderHistory()

    const table = await screen.findByRole("table", { name: t.gitMergesCaption })
    expect(within(table).getAllByRole("columnheader").map((h) => h.textContent)).toEqual([
      t.gitMergesColMergedAt,
      t.gitMergesColMr,
      t.gitMergesColSource,
      t.gitMergesColPbi,
      t.gitMergesColAuthor,
      t.gitMergesColMergedBy,
      t.gitMergesColTarget,
      t.gitMergesColLead,
    ])
    const rows = within(table).getAllByRole("row").slice(1)
    expect(rows).toHaveLength(2)

    const first = within(rows[0])
    const link = first.getByRole("link", { name: new RegExp(`^PBI-12 変更 42.*${t.gitMergesOpenMr}`) })
    expect(link).toHaveAttribute("href", "https://git.example.test/-/projects/7/pull/42")
    expect(link).toHaveAttribute("target", "_blank")
    expect(link).toHaveAttribute("rel", "noopener noreferrer")
    // The row header is the title alone; where it came from has a column of its own.
    expect(first.getByRole("rowheader").textContent).toBe(`PBI-12 変更 42 (${t.gitMergesOpenMr})`)
    expect(first.getAllByRole("cell")[1]).toHaveTextContent("生産管理 API·!42·feat/PBI-12-change-42")
    expect(first.getByText("Sato")).toBeInTheDocument()
    expect(first.getByText("Suzuki")).toBeInTheDocument()
    expect(first.getByText("main")).toBeInTheDocument()
    expect(first.getByText(fillTemplate(t.gitMergesLeadDays, { n: 3 }))).toBeInTheDocument()
    expect(rows[0].querySelector("time")).toHaveAttribute("datetime", merged.toISOString())
    expect(first.getByRole("link", { name: `${fillTemplate(t.gitPageOpenPbi, { key: "PBI-12" })}: ログインできる` })).toHaveAttribute("href", "/projects/p1/backlog?pbi=12")

    // One row per merge request, every PBI it delivers.
    expect(within(rows[1]).getAllByRole("link", { name: new RegExp(fillTemplate(t.gitPageOpenPbi, { key: "PBI-1\\d" })) })).toHaveLength(2)
  })

  it("says 'unknown' for what was never recorded, and never links a non-web address", async () => {
    handler = () =>
      jsonResponse({
        enabled: true,
        items: [
          item(7, { title: "", url: "javascript:alert(1)", openedAt: null, author: null, mergedBy: null, sourceBranch: null, targetBranch: null }),
          item(8, { pbis: [], repository: { id: "r1", name: "" }, sourceBranch: null }),
          item(9, { pbis: [{ id: "b9", displayId: 9, title: "" }] }),
        ],
        nextCursor: null,
      })
    renderHistory()

    const table = await screen.findByRole("table")
    const [, row, noPbi, untitledPbi] = within(table).getAllByRole("row")
    // Author, merged by, target branch, opened → merged.
    expect(within(row).getAllByText(t.gitMergesUnknown)).toHaveLength(4)
    // No title: the number stands in; the only link left is the PBI.
    expect(within(row).getByRole("rowheader")).toHaveTextContent("!7")
    expect(within(row).getAllByRole("link")).toHaveLength(1)
    expect(row.querySelector('a[href^="javascript"]')).toBeNull()
    // No PBI known: said so, not an empty cell; no stray separator for an unknown repository name.
    expect(within(noPbi).getAllByRole("cell")[2]).toHaveTextContent(t.gitMergesUnknown)
    expect(within(noPbi).getAllByRole("cell")[1].textContent).toBe("!8")
    // A PBI without a title: no dangling ": " in its name.
    expect(within(untitledPbi).getByRole("link", { name: fillTemplate(t.gitPageOpenPbi, { key: "PBI-9" }) })).toBeInTheDocument()
  })

  it("shows short lead times in hours", async () => {
    handler = () =>
      jsonResponse({
        enabled: true,
        items: [
          item(1, { openedAt: new Date(merged.getTime() - 20 * 60_000).toISOString() }),
          item(2, { openedAt: new Date(merged.getTime() - 5 * HOUR).toISOString() }),
          item(3, { openedAt: new Date(merged.getTime() - HOUR).toISOString() }),
        ],
        nextCursor: null,
      })
    renderHistory()

    const table = await screen.findByRole("table")
    expect(within(table).getByText(t.gitMergesLeadUnderHour)).toBeInTheDocument()
    expect(within(table).getByText(fillTemplate(t.gitMergesLeadHours, { n: 5 }))).toBeInTheDocument()
    expect(within(table).getByText(t.gitMergesLeadHour)).toBeInTheDocument()
    expect(announcement()).toHaveTextContent(fillTemplate(t.gitMergesResult, { n: 1, count: 3 }))
  })

  it("asks for the newest page of everything first", async () => {
    renderHistory()
    await screen.findByText(t.gitMergesEmptyDesc)
    expect(screen.getByText(t.gitMergesEmptyDesc)).toBeInTheDocument()
    expect([...lastRequest().keys()]).toEqual(["limit"])
    // Nothing to page through.
    expect(screen.queryByRole("navigation", { name: t.gitMergesPager })).not.toBeInTheDocument()
  })

  it("filters by period and by repository", async () => {
    const user = userEvent.setup()
    renderHistory()
    await screen.findByText(t.gitMergesEmptyDesc)

    expect(announcement()).toHaveTextContent(t.gitMergesEmpty)

    await user.selectOptions(screen.getByRole("combobox", { name: t.gitMergesPeriod }), fillTemplate(t.gitMergesPeriodDays, { n: 30 }))
    await screen.findByText(t.gitMergesEmptyFilteredDesc)
    // The result of a filter change is announced, even though the page number stays 1.
    expect(announcement()).toHaveTextContent(t.gitMergesEmptyFiltered)
    expect(screen.getByText(t.gitMergesEmptyFilteredDesc)).toBeInTheDocument()
    const from = lastRequest().get("from")
    expect(from).not.toBeNull()
    const days = (Date.now() - Date.parse(from as string)) / (24 * HOUR)
    expect(days).toBeGreaterThan(29.9)
    expect(days).toBeLessThan(30.1)

    await user.selectOptions(screen.getByRole("combobox", { name: t.gitMergesRepo }), "現場端末")
    await waitFor(() => expect(lastRequest().get("repositoryId")).toBe("r2"))
    expect(lastRequest().get("from")).toBe(from)

    await user.selectOptions(screen.getByRole("combobox", { name: t.gitMergesRepo }), t.gitMergesRepoAll)
    await waitFor(() => expect(lastRequest().has("repositoryId")).toBe(false))
  })

  it("offers no repository filter for a single repository", async () => {
    renderHistory([REPOS[0]])
    await screen.findByText(t.gitMergesEmptyDesc)
    expect(screen.getByRole("combobox", { name: t.gitMergesPeriod })).toBeInTheDocument()
    expect(screen.queryByRole("combobox", { name: t.gitMergesRepo })).not.toBeInTheDocument()
  })

  it("pages to older merges and back, and a filter change returns to the newest page", async () => {
    const user = userEvent.setup()
    handler = (params) => {
      const cursor = params.get("cursor")
      if (cursor === null) return jsonResponse({ enabled: true, items: [item(30)], nextCursor: "c1" })
      if (cursor === "c1") return jsonResponse({ enabled: true, items: [item(20)], nextCursor: "c2" })
      return jsonResponse({ enabled: true, items: [item(10)], nextCursor: null })
    }
    renderHistory()

    await screen.findByText("PBI-12 変更 30")
    const pager = screen.getByRole("navigation", { name: t.gitMergesPager })
    const newer = within(pager).getByRole("button", { name: t.gitMergesNewer })
    const older = within(pager).getByRole("button", { name: t.gitMergesOlder })
    expect(newer).toHaveAttribute("aria-disabled", "true")
    expect(older).not.toHaveAttribute("aria-disabled")
    expect(within(pager).getByText(fillTemplate(t.gitMergesPage, { n: 1 }))).toBeInTheDocument()

    // The newest page has nothing newer: the button does nothing.
    await user.click(newer)
    expect(requests()).toHaveLength(1)

    await user.click(older)
    await screen.findByText("PBI-12 変更 20")
    expect(lastRequest().get("cursor")).toBe("c1")
    expect(within(pager).getByText(fillTemplate(t.gitMergesPage, { n: 2 }))).toBeInTheDocument()

    await user.click(within(pager).getByRole("button", { name: t.gitMergesOlder }))
    await screen.findByText("PBI-12 変更 10")
    expect(lastRequest().get("cursor")).toBe("c2")
    // The oldest page: nothing older, and the button stays in place.
    expect(within(pager).getByRole("button", { name: t.gitMergesOlder })).toHaveAttribute("aria-disabled", "true")
    const before = requests().length
    await user.click(within(pager).getByRole("button", { name: t.gitMergesOlder }))
    expect(requests()).toHaveLength(before)

    await user.click(within(pager).getByRole("button", { name: t.gitMergesNewer }))
    await screen.findByText("PBI-12 変更 20")
    expect(lastRequest().get("cursor")).toBe("c1")

    await user.selectOptions(screen.getByRole("combobox", { name: t.gitMergesPeriod }), t.gitMergesPeriodYear)
    await screen.findByText("PBI-12 変更 30")
    expect(lastRequest().has("cursor")).toBe(false)
    expect(lastRequest().has("from")).toBe(true)
    expect(screen.getByText(fillTemplate(t.gitMergesPage, { n: 1 }))).toBeInTheDocument()
  })

  it("says so when the history cannot be read, and reads it again on request", async () => {
    const user = userEvent.setup()
    handler = () => jsonResponse({ error: "取得に失敗しました" }, 500)
    renderHistory()

    // (The toast region has an alert of its own: look inside the section.)
    const alert = await within(section()).findByRole("alert")
    expect(alert).toHaveTextContent(t.gitMergesLoadFailed)
    expect(screen.queryByRole("table")).not.toBeInTheDocument()
    // A failure is not "no merges".
    expect(screen.queryByText(t.gitMergesEmpty)).not.toBeInTheDocument()

    handler = () => jsonResponse({ enabled: true, items: [item(42)], nextCursor: null })
    await user.click(within(alert).getByRole("button", { name: t.errorRetry }))
    await screen.findByText("PBI-12 変更 42")
    expect(within(section()).queryByRole("alert")).not.toBeInTheDocument()
  })

  it("treats a body that is not a history as a failure, not as 'off'", async () => {
    handler = () => jsonResponse({ unexpected: true })
    renderHistory()
    expect(await within(section()).findByRole("alert")).toHaveTextContent(t.gitMergesLoadFailed)
  })

  it("says the rows are from the previous load when reading them again fails", async () => {
    handler = () => jsonResponse({ enabled: true, items: [item(42)], nextCursor: null })
    renderHistory()
    await screen.findByText("PBI-12 変更 42")
    expect(live.filter).toEqual({ types: ["git"], projectId: "p1" })

    // A sync elsewhere asks for a fresh read of the same page, and that read fails.
    handler = () => jsonResponse({ error: "x" }, 500)
    act(() => live.refetch())
    const alert = await within(section()).findByRole("alert")
    expect(alert).toHaveTextContent(t.gitMergesLoadFailed)
    expect(alert).toHaveTextContent(t.gitMergesStale)
    expect(screen.getByText("PBI-12 変更 42")).toBeInTheDocument()
  })

  it("keeps the merges on screen when a later read fails", async () => {
    const user = userEvent.setup()
    handler = () => jsonResponse({ enabled: true, items: [item(42)], nextCursor: "c1" })
    renderHistory()
    await screen.findByText("PBI-12 変更 42")

    // The next page fails: the alert shows, and going back shows the first page again.
    handler = (params) => (params.has("cursor") ? jsonResponse({ error: "x" }, 500) : jsonResponse({ enabled: true, items: [item(42)], nextCursor: "c1" }))
    await user.click(screen.getByRole("button", { name: t.gitMergesOlder }))
    expect(await within(section()).findByRole("alert")).toHaveTextContent(t.gitMergesLoadFailed)
    expect(screen.queryByText(t.gitMergesEmptyFiltered)).not.toBeInTheDocument()

    await user.click(screen.getByRole("button", { name: t.gitMergesNewer }))
    await screen.findByText("PBI-12 変更 42")
  })

  it("draws nothing when the integration is off", async () => {
    handler = () => jsonResponse({ enabled: false, items: [], nextCursor: null })
    renderHistory()
    await waitFor(() => expect(requests()).toHaveLength(1))
    await waitFor(() => expect(screen.queryByRole("region", { name: t.gitMergesTitle })).not.toBeInTheDocument())
  })

  it("is a labelled region with a loading state", async () => {
    let release: (r: Response) => void = () => {}
    fetchMock.mockImplementationOnce(() => new Promise<Response>((resolve) => (release = resolve)))
    renderHistory()

    const skeleton = () => within(section()).queryByRole("status", { busy: true })
    expect(skeleton()).toHaveTextContent(t.loading)
    release(jsonResponse({ enabled: true, items: [item(42)], nextCursor: null }))
    await screen.findByText("PBI-12 変更 42")
    expect(skeleton()).not.toBeInTheDocument()
    // The wide table can be scrolled from the keyboard; the box is named by the section heading.
    expect(within(section()).getByRole("group", { name: t.gitMergesTitle })).toHaveAttribute("tabindex", "0")
  })
})
