import { afterEach, describe, expect, it, vi } from "vitest"
import { act, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { jsonResponse, renderWithProviders, stubFetch, tr } from "@/app/__tests__/test-utils"
import type { GlossaryEntry } from "@/lib/translation/types"
import { GlossaryManagement } from "../glossary/glossary-management"

const t = tr("ja")

function entry(over: Partial<GlossaryEntry> & { id: string; term: string }): GlossaryEntry {
  return {
    translation: `${over.term}-id`,
    sourceLocale: "ja",
    targetLocale: "id",
    note: null,
    autoReverse: false,
    usageCount: 0,
    updatedAt: "2026-09-01T00:00:00Z",
    ...over,
  } as GlossaryEntry
}

const rows = [entry({ id: "g1", term: "改善", translation: "Kaizen", note: "core", autoReverse: true, usageCount: 5 }), entry({ id: "g2", term: "品質" })]

afterEach(() => vi.unstubAllGlobals())

function glossaryRoute(respond: (url: URL) => Response) {
  return { match: /\/api\/admin\/glossary\?/, method: "GET", respond: (u: string) => respond(new URL(u, "http://x")) }
}

/** Waits past the search debounce window. */
const settleDebounce = () => act(() => new Promise((r) => setTimeout(r, 350)))

async function answerConfirm(user: ReturnType<typeof userEvent.setup>, accept: boolean) {
  const dialog = await screen.findByRole("alertdialog")
  const buttons = within(dialog).getAllByRole("button")
  await user.click(accept ? buttons[buttons.length - 1] : buttons[0])
}

describe("GlossaryManagement", () => {
  it("loads the ja→id page, shows rows, empty state and notation help", async () => {
    const fetchMock = stubFetch([glossaryRoute(() => jsonResponse({ data: rows, total: 2 }))])
    renderWithProviders(<GlossaryManagement />)
    expect(screen.getByText(t.glossaryLoading)).toBeInTheDocument()
    expect(await screen.findByDisplayValue("改善")).toBeInTheDocument()
    expect(screen.getByText(t.glossarySummary.replace("{total}", "2"))).toBeInTheDocument()
    expect(screen.getAllByText(t.glossaryAutoReverseHint).length).toBeGreaterThan(0)
    const url = new URL(String(fetchMock.mock.calls[0][0]), "http://x")
    expect(url.searchParams.get("source")).toBe("ja")
    expect(url.searchParams.get("offset")).toBe("0")
  })

  it("shows the empty row and disables re-translate-all when there are no entries (id)", async () => {
    stubFetch([glossaryRoute(() => jsonResponse({ data: [], total: 0 }))])
    const ti = tr("id")
    renderWithProviders(<GlossaryManagement />, { language: "id" })
    expect(await screen.findByText(ti.glossaryEmpty)).toBeInTheDocument()
    expect(screen.getByRole("button", { name: ti.glossaryRetranslateAll })).toBeDisabled()
  })

  it("switches direction and debounces search back to page 1", async () => {
    const fetchMock = stubFetch([glossaryRoute(() => jsonResponse({ data: rows, total: 2 }))])
    const user = userEvent.setup()
    renderWithProviders(<GlossaryManagement />)
    await screen.findByDisplayValue("改善")
    const idTab = screen.getByRole("button", { name: t.glossaryTabId })
    await user.click(idTab)
    expect(idTab).toHaveAttribute("aria-pressed", "true")
    await waitFor(() => expect(fetchMock.mock.calls.some((c) => String(c[0]).includes("source=id"))).toBe(true))

    await user.type(screen.getByRole("searchbox", { name: t.glossarySearch }), " kai ")
    await waitFor(() => expect(fetchMock.mock.calls.some((c) => String(c[0]).includes("q=kai"))).toBe(true), { timeout: 2000 })
  })

  it("paginates when there are more than 50 entries", async () => {
    const fetchMock = stubFetch([glossaryRoute(() => jsonResponse({ data: rows, total: 120 }))])
    const user = userEvent.setup()
    renderWithProviders(<GlossaryManagement />)
    await screen.findByDisplayValue("改善")
    const nav = () => screen.getByRole("navigation", { name: t.glossaryTitle })
    const prev = () => within(nav()).getByRole("button", { name: new RegExp(t.glossaryPrev) })
    expect(within(nav()).getByText("1 / 3")).toBeInTheDocument()
    expect(prev()).toBeDisabled()
    // Clicking "next" right after load must stick (regression: the mount-time
    // search debounce reset the page ~300 ms later) and the pager stays visible.
    const navBefore = nav()
    await user.click(within(nav()).getByRole("button", { name: new RegExp(t.glossaryNext) }))
    expect(nav()).toBe(navBefore)
    await waitFor(() => expect(within(nav()).getByText("2 / 3")).toBeInTheDocument())
    expect(fetchMock.mock.calls.some((c) => String(c[0]).includes("offset=50"))).toBe(true)
    await settleDebounce()
    expect(within(nav()).getByText("2 / 3")).toBeInTheDocument()
    expect(fetchMock.mock.calls.filter((c) => String(c[0]).includes("offset=0")).length).toBe(1)
    await waitFor(() => expect(prev()).toBeEnabled())
    await user.click(prev())
    await waitFor(() => expect(within(nav()).getByText("1 / 3")).toBeInTheDocument())
  })

  it("inline-edits a term optimistically and saves; unchanged or empty edits are ignored", async () => {
    const fetchMock = stubFetch([
      glossaryRoute(() => jsonResponse({ data: rows, total: 2 })),
      {
        match: "/api/admin/glossary/g1",
        method: "PATCH",
        respond: (_u, init) => jsonResponse({ ...rows[0], ...JSON.parse(String(init?.body)) }),
      },
    ])
    const user = userEvent.setup()
    renderWithProviders(<GlossaryManagement />)
    const term = await screen.findByDisplayValue("改善")

    // Empty (not allowed) reverts
    await user.clear(term)
    act(() => term.blur())
    expect(term).toHaveValue("改善")
    // Escape reverts without saving (regression: it used to commit the edit)
    await user.type(term, "X{Escape}")
    expect(term).toHaveValue("改善")
    expect(fetchMock.mock.calls.some((c) => c[1]?.method === "PATCH")).toBe(false)
    // Same value → no request
    act(() => term.blur())
    expect(fetchMock.mock.calls.some((c) => c[1]?.method === "PATCH")).toBe(false)

    await user.clear(term)
    await user.type(term, "改善活動{Enter}")
    await waitFor(() => expect(fetchMock.mock.calls.some((c) => c[1]?.method === "PATCH")).toBe(true))
    // Inline edits do not toast on success.
    expect(screen.queryByText(t.glossarySaved)).not.toBeInTheDocument()
    const patch = fetchMock.mock.calls.find((c) => c[1]?.method === "PATCH")
    expect(JSON.parse(String(patch?.[1]?.body))).toEqual({ term: "改善活動" })
    expect(screen.getByDisplayValue("改善活動")).toBeInTheDocument()
  })

  it("saves notes (empty → null) and translations; rolls back on failure with a toast", async () => {
    let fail = false
    const fetchMock = stubFetch([
      glossaryRoute(() => jsonResponse({ data: rows, total: 2 })),
      {
        match: /\/api\/admin\/glossary\/g\d$/,
        method: "PATCH",
        respond: (u, init) =>
          fail ? jsonResponse({ error: "conflict" }, 409) : jsonResponse({ ...rows.find((r) => u.endsWith(r.id)), ...JSON.parse(String(init?.body)) }),
      },
    ])
    const user = userEvent.setup()
    renderWithProviders(<GlossaryManagement />)
    const note = await screen.findByDisplayValue("core")
    await user.clear(note)
    act(() => note.blur())
    await waitFor(() => expect(fetchMock.mock.calls.some((c) => c[1]?.body === JSON.stringify({ note: null }))).toBe(true))

    fail = true
    const translation = screen.getByDisplayValue("品質-id")
    await user.clear(translation)
    await user.type(translation, "Kualitas{Enter}")
    expect(await screen.findByText("conflict")).toBeInTheDocument()
    await waitFor(() => expect(screen.getByDisplayValue("品質-id")).toBeInTheDocument())
  })

  it("confirms before delete; deletes and refetches, reports failures", async () => {
    let fail = false
    const fetchMock = stubFetch([
      glossaryRoute(() => jsonResponse({ data: rows, total: 2 })),
      { match: /\/api\/admin\/glossary\/g\d$/, method: "DELETE", respond: () => (fail ? jsonResponse({ error: "cannot" }, 500) : jsonResponse({ ok: true })) },
    ])
    const user = userEvent.setup()
    renderWithProviders(<GlossaryManagement />)
    await screen.findByDisplayValue("改善")
    const deleteButtons = screen.getAllByRole("button", { name: t.delete })
    await user.click(deleteButtons[0])
    expect(await screen.findByText(t.glossaryDeleteConfirm.replace("{term}", "改善"))).toBeInTheDocument()
    await answerConfirm(user, false)
    expect(fetchMock.mock.calls.some((c) => c[1]?.method === "DELETE")).toBe(false)

    await user.click(deleteButtons[0])
    await answerConfirm(user, true)
    expect(await screen.findByText(t.glossaryDeleted)).toBeInTheDocument()

    fail = true
    await waitFor(() => expect(screen.getAllByRole("button", { name: t.delete })[1]).toBeEnabled())
    await user.click(screen.getAllByRole("button", { name: t.delete })[1])
    await answerConfirm(user, true)
    expect(await screen.findByText("cannot")).toBeInTheDocument()
  })

  it("re-translates all or one entry and reports errors", async () => {
    let fail = false
    const fetchMock = stubFetch([
      glossaryRoute(() => jsonResponse({ data: rows, total: 2 })),
      { match: "/api/admin/glossary", method: "PUT", respond: () => (fail ? jsonResponse({ error: "queue full" }, 503) : jsonResponse({ requeued: 7 })) },
    ])
    const user = userEvent.setup()
    renderWithProviders(<GlossaryManagement />)
    await screen.findByDisplayValue("改善")
    await user.click(screen.getByRole("button", { name: t.glossaryRetranslateAll }))
    expect(await screen.findByText(t.glossaryRetranslateQueued.replace("{count}", "7"))).toBeInTheDocument()
    expect(JSON.parse(String(fetchMock.mock.calls.find((c) => c[1]?.method === "PUT")?.[1]?.body))).toEqual({})

    fail = true
    await waitFor(() => expect(screen.getAllByRole("button", { name: t.glossaryRetranslateOne })[0]).toBeEnabled())
    await user.click(screen.getAllByRole("button", { name: t.glossaryRetranslateOne })[0])
    expect(await screen.findByText("queue full")).toBeInTheDocument()
    const last = fetchMock.mock.calls.filter((c) => c[1]?.method === "PUT").pop()
    expect(JSON.parse(String(last?.[1]?.body))).toEqual({ ids: ["g1"] })
  })
})

describe("GlossaryAddForm (via GlossaryManagement)", () => {
  it("adds a trimmed pair for the current direction and refetches", async () => {
    const fetchMock = stubFetch([
      glossaryRoute(() => jsonResponse({ data: rows, total: 2 })),
      { match: "/api/admin/glossary", method: "POST", respond: () => jsonResponse({ id: "g3" }, 201) },
    ])
    const user = userEvent.setup()
    renderWithProviders(<GlossaryManagement />)
    await screen.findByDisplayValue("改善")
    await user.click(screen.getByRole("button", { name: t.glossaryTabId }))
    const add = screen.getByRole("button", { name: t.glossaryAdd })
    expect(add).toBeDisabled()
    await user.type(screen.getByRole("textbox", { name: new RegExp(`${t.glossaryColTerm} \\(${t.glossaryLangId}\\)`) }), " Mesin ")
    await user.type(screen.getByRole("textbox", { name: new RegExp(`${t.glossaryColTranslation} \\(${t.glossaryLangJa}\\)`) }), " 機械 ")
    await user.click(add)
    expect(await screen.findByText(t.glossaryAdded)).toBeInTheDocument()
    const post = fetchMock.mock.calls.find((c) => c[1]?.method === "POST")
    expect(JSON.parse(String(post?.[1]?.body))).toEqual({ sourceLocale: "id", targetLocale: "ja", term: "Mesin", translation: "機械", note: null })
  })

  it("toasts the server error when adding fails and keeps the input", async () => {
    stubFetch([
      glossaryRoute(() => jsonResponse({ data: rows, total: 120 })),
      { match: "/api/admin/glossary", method: "POST", respond: () => jsonResponse({ error: "exists" }, 409) },
    ])
    const user = userEvent.setup()
    renderWithProviders(<GlossaryManagement />)
    await screen.findByDisplayValue("改善")
    const termInput = screen.getByRole("textbox", { name: new RegExp(`${t.glossaryColTerm} \\(${t.glossaryLangJa}\\)`) })
    await user.type(termInput, "改善")
    await user.type(screen.getByRole("textbox", { name: new RegExp(`${t.glossaryColTranslation} \\(`) }), "Kaizen")
    await user.type(screen.getAllByRole("textbox", { name: t.glossaryColNote })[0], "n")
    await user.click(screen.getByRole("button", { name: t.glossaryAdd }))
    expect(await screen.findByText("exists")).toBeInTheDocument()
    expect(termInput).toHaveValue("改善")
  })

  it("jumps back to page 1 after adding while on a later page", async () => {
    const fetchMock = stubFetch([
      glossaryRoute(() => jsonResponse({ data: rows, total: 120 })),
      { match: "/api/admin/glossary", method: "POST", respond: () => jsonResponse({ id: "g3" }, 201) },
    ])
    const user = userEvent.setup()
    renderWithProviders(<GlossaryManagement />)
    await screen.findByDisplayValue("改善")
    await settleDebounce()
    await user.click(screen.getByRole("button", { name: new RegExp(t.glossaryNext) }))
    await waitFor(() => expect(screen.getByText("2 / 3")).toBeInTheDocument())
    await user.type(screen.getByRole("textbox", { name: new RegExp(`${t.glossaryColTerm} \\(`) }), "a")
    await user.type(screen.getByRole("textbox", { name: new RegExp(`${t.glossaryColTranslation} \\(`) }), "b")
    await user.click(screen.getByRole("button", { name: t.glossaryAdd }))
    await waitFor(() => expect(screen.getByText("1 / 3")).toBeInTheDocument())
    expect(fetchMock.mock.calls.filter((c) => String(c[0]).includes("offset=0")).length).toBeGreaterThanOrEqual(1)
  })
})
