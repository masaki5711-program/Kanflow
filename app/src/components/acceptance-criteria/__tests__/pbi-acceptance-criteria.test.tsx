import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { jsonResponse, renderWithProviders, stubLayout } from "@/components/__tests__/helpers"
import { getTranslations } from "@/lib/i18n"
import { PbiAcceptanceCriteria } from "../pbi-acceptance-criteria"
import { toAcBody, hasAcContent, EMPTY_AC_FORM } from "../ac-form"
import type { AcDto } from "../ac-form"

stubLayout()

const t = getTranslations("en")
const URL_BASE = "/api/projects/p1/backlog/b1/acceptance-criteria"

const ITEMS: AcDto[] = [
  { id: "PBI-12/AC-1", seq: 1, given: null, when: null, then: null, text: "Login works", evidenceKind: null },
  { id: "PBI-12/AC-3", seq: 3, given: "a registered user", when: "they sign in", then: "the home page opens", text: null, evidenceKind: "measurement" },
  { id: "PBI-12/AC-4", seq: 4, given: null, when: null, then: null, text: "Spec signed off", evidenceKind: "approval" },
]

let items: AcDto[]
let canEdit: boolean
const calls: Array<{ method: string; url: string; body?: unknown }> = []

beforeEach(() => {
  calls.length = 0
  items = ITEMS
  canEdit = false
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    const method = (init?.method ?? "GET").toUpperCase()
    calls.push({ method, url: String(url), body: init?.body ? JSON.parse(String(init.body)) : undefined })
    if (method === "GET") return jsonResponse({ data: items, canEdit })
    if (method === "POST") return jsonResponse({ data: { ...ITEMS[0], id: "PBI-12/AC-5", seq: 5 } }, 201)
    if (method === "DELETE") return jsonResponse({ data: { id: "PBI-12/AC-1" } })
    return jsonResponse({ data: ITEMS[0] })
  }))
})
afterEach(() => vi.unstubAllGlobals())

function renderPanel(legacyText?: string | null) {
  return renderWithProviders(<PbiAcceptanceCriteria projectId="p1" pbiId="b1" legacyText={legacyText} />)
}

describe("PBI acceptance criteria checklist", () => {
  it("lists every item with its stable id, Given / When / Then or free text, and an evidence label that is text, not just an icon", async () => {
    renderPanel()
    const region = await screen.findByRole("region", { name: /acceptance criteria/i })
    const rows = within(region).getAllByRole("listitem")
    expect(rows).toHaveLength(3)
    expect(within(rows[0]).getByText("PBI-12/AC-1")).toBeInTheDocument()
    expect(within(rows[0]).getByText("Login works")).toBeInTheDocument()
    expect(within(rows[1]).getByText("PBI-12/AC-3")).toBeInTheDocument()
    expect(within(rows[1]).getByText("the home page opens")).toBeInTheDocument()
    expect(within(rows[1]).getByText(t.pbiAcGiven)).toBeInTheDocument()
    expect(within(rows[1]).getByText(t.pbiAcEvidenceMeasurement)).toBeInTheDocument()
    expect(within(rows[2]).getByText(t.pbiAcEvidenceApproval)).toBeInTheDocument()
    // Undecided evidence is shown gray with its own text.
    expect(within(rows[0]).getByText(t.pbiAcEvidenceNone).closest("[data-evidence]")).toHaveAttribute("data-evidence", "none")
    expect(rows[1].querySelector("[data-evidence='measurement']")).not.toBeNull()
    // Icons are decoration only.
    for (const svg of region.querySelectorAll("svg")) expect(svg).toHaveAttribute("aria-hidden", "true")
  })

  it("a viewer (canEdit false) sees no add / edit / delete controls", async () => {
    renderPanel()
    await screen.findByText("PBI-12/AC-1")
    expect(screen.queryByRole("button", { name: t.pbiAcAdd })).toBeNull()
    expect(screen.queryByRole("button", { name: /Edit PBI-12/ })).toBeNull()
    expect(screen.queryByRole("button", { name: /Delete PBI-12/ })).toBeNull()
  })

  it("shows the empty state, and the folded legacy text (read-only) while there are no items", async () => {
    items = []
    const { container } = renderPanel("old line 1\nold line 2")
    expect(await screen.findByText(t.pbiAcEmpty)).toBeInTheDocument()
    const legacy = container.querySelector("[data-ac-legacy]") as HTMLDetailsElement
    expect(legacy.open).toBe(true)
    expect(within(legacy).getByText(t.pbiAcLegacyTitle)).toBeInTheDocument()
    expect(legacy.textContent).toContain("old line 1")
    expect(legacy.querySelector("textarea, input")).toBeNull()
  })

  it("the legacy text is folded once items exist", async () => {
    const { container } = renderPanel("old")
    await screen.findByText("PBI-12/AC-1")
    expect((container.querySelector("[data-ac-legacy]") as HTMLDetailsElement).open).toBe(false)
  })

  it("a load failure shows an alert instead of an empty list", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({ error: "boom" }, 500)))
    renderPanel()
    expect(await screen.findByText(t.pbiAcLoadFailed)).toHaveAttribute("role", "alert")
  })
})

describe("PO / SM editing (canEdit from the server)", () => {
  beforeEach(() => {
    canEdit = true
  })

  it("adds an item with only free text (Given / When / Then stay empty) and reloads", async () => {
    const user = userEvent.setup()
    renderPanel()
    await user.click(await screen.findByRole("button", { name: t.pbiAcAdd }))
    const form = screen.getByRole("form", { name: t.pbiAcAdd })
    await user.type(within(form).getByLabelText(t.pbiAcText), "  Exports a CSV  ")
    await user.selectOptions(within(form).getByLabelText(t.pbiAcEvidence), "test")
    await user.click(within(form).getByRole("button", { name: t.save }))
    await waitFor(() => expect(calls.some((c) => c.method === "POST")).toBe(true))
    expect(calls.find((c) => c.method === "POST")).toMatchObject({
      url: URL_BASE,
      body: { given: null, when: null, then: null, text: "Exports a CSV", evidenceKind: "test" },
    })
    await waitFor(() => expect(calls.filter((c) => c.method === "GET").length).toBeGreaterThanOrEqual(2))
  })

  it("refuses an all-empty form with a message and sends nothing", async () => {
    const user = userEvent.setup()
    renderPanel()
    await user.click(await screen.findByRole("button", { name: t.pbiAcAdd }))
    await user.click(within(screen.getByRole("form", { name: t.pbiAcAdd })).getByRole("button", { name: t.save }))
    expect(await screen.findByText(t.pbiAcContentRequired)).toBeInTheDocument()
    expect(calls.some((c) => c.method === "POST")).toBe(false)
  })

  it("edits an item in place by its number (PATCH .../AC-3) with the Given / When / Then filled", async () => {
    const user = userEvent.setup()
    renderPanel()
    await user.click(await screen.findByRole("button", { name: "Edit PBI-12/AC-3" }))
    const form = screen.getByRole("form", { name: "Edit PBI-12/AC-3" })
    expect(within(form).getByLabelText(t.pbiAcWhen)).toHaveValue("they sign in")
    await user.clear(within(form).getByLabelText(t.pbiAcThen))
    await user.type(within(form).getByLabelText(t.pbiAcThen), "the dashboard opens")
    await user.click(within(form).getByRole("button", { name: t.save }))
    await waitFor(() => expect(calls.some((c) => c.method === "PATCH")).toBe(true))
    expect(calls.find((c) => c.method === "PATCH")).toMatchObject({
      url: `${URL_BASE}/AC-3`,
      body: { given: "a registered user", when: "they sign in", then: "the dashboard opens", text: null, evidenceKind: "measurement" },
    })
  })

  it("deletes only after a confirm; cancelling sends nothing", async () => {
    const user = userEvent.setup()
    renderPanel()
    await user.click(await screen.findByRole("button", { name: "Delete PBI-12/AC-1" }))
    const dialog = await screen.findByRole("alertdialog")
    expect(within(dialog).getByText(t.pbiAcDeleteConfirmMessage.replace("{id}", "PBI-12/AC-1"))).toBeInTheDocument()
    await user.click(within(dialog).getByRole("button", { name: /Cancel/i }))
    expect(calls.some((c) => c.method === "DELETE")).toBe(false)

    await user.click(screen.getByRole("button", { name: "Delete PBI-12/AC-1" }))
    await user.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: t.delete }))
    await waitFor(() => expect(calls.some((c) => c.method === "DELETE")).toBe(true))
    expect(calls.find((c) => c.method === "DELETE")?.url).toBe(`${URL_BASE}/AC-1`)
  })
})

describe("form helpers", () => {
  it("toAcBody trims and maps empty to null; hasAcContent needs one of the four texts", () => {
    expect(toAcBody({ given: " g ", when: "", then: " ", text: "", evidenceKind: "" })).toEqual({ given: "g", when: null, then: null, text: null, evidenceKind: null })
    expect(hasAcContent(EMPTY_AC_FORM)).toBe(false)
    expect(hasAcContent({ ...EMPTY_AC_FORM, then: "x", evidenceKind: "test" })).toBe(true)
  })
})
