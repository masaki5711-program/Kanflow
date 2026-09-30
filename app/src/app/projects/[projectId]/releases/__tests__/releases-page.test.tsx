import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { getTranslations } from "@/lib/i18n"
import { getProjectTypeLabels } from "@/lib/project-type-labels"
import { getUiLabels } from "@/components/ui"
import { jsonResponse, renderWithProviders, stubFetch } from "../../gantt/__tests__/providers"

vi.mock("next/navigation", () => ({ useParams: () => ({ projectId: "p1" }) }))

const { default: ReleasesPage } = await import("../page")
const t = getTranslations("ja")
const pt = getProjectTypeLabels("software", "ja")
const ui = getUiLabels("ja")

const blank = {
  pbItemId: null as string | null,
  iceboxId: null,
  initiative: null,
  epic: null as string | null,
  userStory: null,
  assignedPo: null,
  planVersion: null as string | null,
  releaseVersion: null,
  releaseDate: null as string | null,
  releaseNote: null,
  manualLink: null,
  poNote: null,
  pbItem: null as unknown,
}
const pbi = (id: string, displayId: number, userStory: string) => ({
  id,
  displayId,
  initiative: null,
  epic: null,
  userStory,
  workloadScore: 3,
  status: "done",
})

function seed() {
  return [
    { ...blank, id: "r1", planVersion: "v1.0", status: "staged", pbItemId: "pb1", pbItem: pbi("pb1", 1, "Story One") },
    { ...blank, id: "r2", planVersion: "v1.0", status: "ready", epic: "Epic Two" },
    { ...blank, id: "r3", status: "deferred" },
    {
      ...blank,
      id: "r4",
      planVersion: "v0.9",
      status: "released",
      releaseDate: "2026-01-15T00:00:00.000Z",
      pbItemId: "pb4",
      pbItem: pbi("pb4", 4, "Shipped Story"),
    },
  ]
}

type Call = { url: string; method: string; body: unknown }
let calls: Call[]
let releases: ReturnType<typeof seed>
let failPatch: (id: string) => boolean
let failDelete = false
let failImport = false
let failList = false
let completedItems: unknown[]

beforeEach(() => {
  calls = []
  releases = seed()
  failPatch = () => false
  failDelete = false
  failImport = false
  failList = false
  completedItems = [pbi("pb1", 1, "Already imported"), pbi("pb5", 5, "Candidate Five"), pbi("pb6", 6, "Candidate Six")]
  stubFetch((url, init) => {
    const method = init?.method ?? "GET"
    const body = typeof init?.body === "string" ? JSON.parse(init.body) : undefined
    calls.push({ url, method, body })
    if (url === "/api/projects/p1/releases" && method === "GET") {
      return failList ? jsonResponse({ error: "boom" }, 500) : jsonResponse(releases)
    }
    if (url === "/api/projects/p1/backlog") return jsonResponse({ completedItems })
    if (url === "/api/projects/p1/releases/import") {
      return failImport ? jsonResponse({ error: "import boom" }, 500) : jsonResponse({ ok: true })
    }
    const m = url.match(/\/releases\/(\w+)$/)
    if (m && method === "PATCH") {
      if (failPatch(m[1])) return jsonResponse({ error: "patch boom" }, 500)
      releases = releases.map((r) => (r.id === m[1] ? { ...r, ...(body as object) } : r))
      return jsonResponse({ ok: true })
    }
    if (m && method === "DELETE") {
      if (failDelete) return jsonResponse({ error: "delete boom" }, 500)
      releases = releases.filter((r) => r.id !== m[1])
      return new Response(null, { status: 204 })
    }
    return jsonResponse({ error: "unhandled" }, 404)
  })
})
afterEach(() => vi.unstubAllGlobals())

function sectionOf(heading: string): HTMLElement {
  return screen.getByRole("heading", { name: heading }).closest("section") as HTMLElement
}

describe("ReleasesPage", () => {
  it("groups active items by version and hides released ones behind a toggle", async () => {
    const user = userEvent.setup()
    renderWithProviders(<ReleasesPage />)

    await screen.findByRole("heading", { name: "v1.0" })
    expect(screen.getByRole("heading", { name: pt.releaseUncategorized })).toBeInTheDocument()
    expect(screen.getByText("Story One")).toBeInTheDocument()
    expect(screen.getByText("#1")).toBeInTheDocument()
    expect(screen.getAllByText("Epic Two").length).toBeGreaterThan(0)
    expect(screen.getByText(t.sprintNotEntered)).toBeInTheDocument()
    expect(screen.queryByText("Shipped Story")).not.toBeInTheDocument()

    const releasedToggle = screen.getByRole("button", { name: new RegExp(`${pt.releaseReleasedSection} \\(1\\)`) })
    expect(releasedToggle).toHaveAttribute("aria-expanded", "false")
    await user.click(releasedToggle)
    expect(releasedToggle).toHaveAttribute("aria-expanded", "true")
    expect(screen.getByText("Shipped Story")).toBeInTheDocument()
    expect(within(sectionOf("v0.9")).queryByRole("button", { name: pt.releaseBulkRelease })).not.toBeInTheDocument()
  })

  it("collapses and expands a version group", async () => {
    const user = userEvent.setup()
    renderWithProviders(<ReleasesPage />)
    await screen.findByText("Story One")
    const toggle = screen.getByRole("button", { name: /v1\.0/ })
    expect(toggle).toHaveAttribute("aria-expanded", "true")
    await user.click(toggle)
    expect(toggle).toHaveAttribute("aria-expanded", "false")
    expect(screen.queryByText("Story One")).not.toBeInTheDocument()
    await user.click(toggle)
    expect(screen.getByText("Story One")).toBeInTheDocument()
  })

  it("shows the empty state when there are no items", async () => {
    releases = []
    renderWithProviders(<ReleasesPage />)
    expect(await screen.findByText(t.releaseNoItems)).toBeInTheDocument()
  })

  it("toasts when loading fails", async () => {
    failList = true
    renderWithProviders(<ReleasesPage />)
    expect(await screen.findByText(t.releaseLoadFailed)).toBeInTheDocument()
  })

  describe("import modal", () => {
    it("lists only not-yet-imported completed PBIs and imports the selection", async () => {
      const user = userEvent.setup()
      renderWithProviders(<ReleasesPage />)
      await screen.findByText("Story One")

      await user.click(screen.getByRole("button", { name: pt.releaseImportTitle }))
      const dialog = await screen.findByRole("dialog", { name: pt.releaseImportTitle })
      await within(dialog).findByText("Candidate Five")
      expect(within(dialog).queryByText("Already imported")).not.toBeInTheDocument()

      const submit = within(dialog).getByRole("button", { name: `${pt.releaseImportButton} (0${t.items})` })
      expect(submit).toBeDisabled()

      await user.type(within(dialog).getByPlaceholderText("v1.0.0"), "v2")
      const five = within(dialog).getByRole("checkbox", { name: /Candidate Five/ })
      await user.click(five)
      const six = within(dialog).getByRole("checkbox", { name: /Candidate Six/ })
      await user.click(six)
      await user.click(six) // unselect again
      expect(five).toBeChecked()
      expect(six).not.toBeChecked()

      await user.click(within(dialog).getByRole("button", { name: `${pt.releaseImportButton} (1${t.items})` }))

      await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument())
      const post = calls.find((c) => c.url.endsWith("/import"))
      expect(post).toMatchObject({ method: "POST", body: { pbItemIds: ["pb5"], planVersion: "v2" } })
      expect(await screen.findByText(t.releaseImported.replace("{count}", "1"))).toBeInTheDocument()
      await waitFor(() =>
        expect(calls.filter((c) => c.url === "/api/projects/p1/releases" && c.method === "GET").length).toBe(2),
      )
    })

    it("omits an empty plan version and keeps the modal open on failure", async () => {
      failImport = true
      const user = userEvent.setup()
      renderWithProviders(<ReleasesPage />)
      await screen.findByText("Story One")
      await user.click(screen.getByRole("button", { name: pt.releaseImportTitle }))
      const dialog = await screen.findByRole("dialog")
      await user.click(await within(dialog).findByRole("checkbox", { name: /Candidate Five/ }))
      await user.click(within(dialog).getByRole("button", { name: new RegExp(pt.releaseImportButton) }))

      expect(await screen.findByText(t.releaseImportFailed)).toBeInTheDocument()
      const post = calls.find((c) => c.url.endsWith("/import"))
      expect(post?.body).toEqual({ pbItemIds: ["pb5"] })
      expect(screen.getByRole("dialog", { name: pt.releaseImportTitle })).toBeInTheDocument()
    })

    it("shows an empty state when nothing can be imported and closes cleanly on cancel", async () => {
      completedItems = []
      const user = userEvent.setup()
      renderWithProviders(<ReleasesPage />)
      await screen.findByText("Story One")
      await user.click(screen.getByRole("button", { name: pt.releaseImportTitle }))
      const dialog = await screen.findByRole("dialog")
      expect(await within(dialog).findByText(t.releaseNoCompletedItems)).toBeInTheDocument()
      await user.click(within(dialog).getByRole("button", { name: t.cancel }))
      await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument())
    })

    it("asks before discarding a selection", async () => {
      const user = userEvent.setup()
      renderWithProviders(<ReleasesPage />)
      await screen.findByText("Story One")
      await user.click(screen.getByRole("button", { name: pt.releaseImportTitle }))
      const dialog = await screen.findByRole("dialog")
      await user.click(await within(dialog).findByRole("checkbox", { name: /Candidate Five/ }))
      await user.click(within(dialog).getByRole("button", { name: t.cancel }))
      const confirm = await screen.findByRole("alertdialog")
      await user.click(within(confirm).getByRole("button", { name: ui.discard }))
      await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument())
    })
  })

  describe("edit dialog", () => {
    it("saves edited fields via PATCH and closes", async () => {
      const user = userEvent.setup()
      renderWithProviders(<ReleasesPage />)
      await user.click(await screen.findByText("Story One"))
      const dialog = await screen.findByRole("dialog", { name: pt.releaseEditTitle })
      expect(within(dialog).getByText("PBI #1")).toBeInTheDocument()

      const plan = within(dialog).getByRole("textbox", { name: `${pt.releaseVersion}${t.releasePlanSuffix}` })
      expect(plan).toHaveValue("v1.0")
      await user.clear(plan)
      await user.type(plan, "v1.1")
      await user.type(within(dialog).getByRole("textbox", { name: pt.releaseNote }), "Notes")
      await user.selectOptions(within(dialog).getByRole("combobox", { name: t.sprintStatus }), "ready")
      await user.click(within(dialog).getByRole("button", { name: t.save }))

      await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument())
      const patch = calls.find((c) => c.method === "PATCH")
      expect(patch?.url).toBe("/api/projects/p1/releases/r1")
      expect(patch?.body).toMatchObject({ planVersion: "v1.1", releaseNote: "Notes", status: "ready", epic: null })
      expect(await screen.findByRole("heading", { name: "v1.1" })).toBeInTheDocument()
    })

    it("clearing a field sends null and the dialog stays open when save fails", async () => {
      failPatch = () => true
      const user = userEvent.setup()
      renderWithProviders(<ReleasesPage />)
      await user.click(await screen.findByText("Story One"))
      const dialog = await screen.findByRole("dialog")
      const plan = within(dialog).getByRole("textbox", { name: `${pt.releaseVersion}${t.releasePlanSuffix}` })
      await user.clear(plan)
      await user.click(within(dialog).getByRole("button", { name: t.save }))
      expect(await screen.findByText(t.releaseSaveFailed)).toBeInTheDocument()
      expect(calls.find((c) => c.method === "PATCH")?.body).toMatchObject({ planVersion: null })
      expect(screen.getByRole("dialog", { name: pt.releaseEditTitle })).toBeInTheDocument()
    })

    it("deletes after confirmation (optimistic) and closes", async () => {
      const user = userEvent.setup()
      renderWithProviders(<ReleasesPage />)
      await user.click(await screen.findByText("Story One"))
      const dialog = await screen.findByRole("dialog")
      await user.click(within(dialog).getByRole("button", { name: t.delete }))
      const confirm = await screen.findByRole("alertdialog")
      expect(confirm).toHaveTextContent(t.releaseDeleteConfirm)
      await user.click(within(confirm).getByRole("button", { name: t.delete }))

      await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument())
      expect(calls.some((c) => c.method === "DELETE" && c.url.endsWith("/r1"))).toBe(true)
      expect(screen.queryByText("Story One")).not.toBeInTheDocument()
    })

    it("does nothing when delete is cancelled, and rolls back on failure", async () => {
      const user = userEvent.setup()
      renderWithProviders(<ReleasesPage />)
      await user.click(await screen.findByText("Story One"))
      await user.click(within(await screen.findByRole("dialog")).getByRole("button", { name: t.delete }))
      await user.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: t.cancel }))
      await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument())
      expect(calls.some((c) => c.method === "DELETE")).toBe(false)

      failDelete = true
      await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: t.delete }))
      await user.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: t.delete }))
      expect(await screen.findByText(t.releaseDeleteFailed)).toBeInTheDocument()
      expect(screen.getByRole("dialog")).toBeInTheDocument()
      expect(screen.getAllByText("Story One").length).toBeGreaterThan(0)
    })

    it("edits an unlinked item's remaining fields", async () => {
      const user = userEvent.setup()
      renderWithProviders(<ReleasesPage />)
      await user.click((await screen.findAllByText("Epic Two"))[0])
      const dialog = await screen.findByRole("dialog", { name: pt.releaseEditTitle })
      expect(within(dialog).queryByText(/PBI #/)).not.toBeInTheDocument()
      for (const input of within(dialog).getAllByRole("textbox")) await user.type(input, "x")
      const date = dialog.querySelector('input[type="date"]') as HTMLInputElement
      await user.type(date, "2026-02-03")
      await user.click(within(dialog).getByRole("button", { name: t.save }))
      await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument())
      const body = calls.find((c) => c.method === "PATCH")?.body as Record<string, unknown>
      expect(body).toMatchObject({
        epic: "Epic Twox",
        initiative: "x",
        releaseVersion: "x",
        assignedPo: "x",
        manualLink: "x",
        poNote: "x",
        releaseDate: "2026-02-03",
      })
    })
  })

  describe("bulk release", () => {
    it("confirms with the count and marks every non-released item of the version", async () => {
      const user = userEvent.setup()
      renderWithProviders(<ReleasesPage />)
      await screen.findByText("Story One")
      await user.click(within(sectionOf("v1.0")).getByRole("button", { name: pt.releaseBulkRelease }))
      const confirm = await screen.findByRole("alertdialog")
      expect(confirm).toHaveTextContent(`2 ${t.releaseBulkConfirm}`)
      await user.click(within(confirm).getByRole("button", { name: t.confirm }))

      expect(await screen.findByText(t.releaseBulkDone.replace("{count}", "2"))).toBeInTheDocument()
      const patches = calls.filter((c) => c.method === "PATCH")
      expect(patches.map((p) => p.url).sort()).toEqual(["/api/projects/p1/releases/r1", "/api/projects/p1/releases/r2"])
      expect(patches[0].body).toMatchObject({ status: "released" })
    })

    it("reports partial failures", async () => {
      failPatch = (id) => id === "r2"
      const user = userEvent.setup()
      renderWithProviders(<ReleasesPage />)
      await screen.findByText("Story One")
      await user.click(within(sectionOf("v1.0")).getByRole("button", { name: pt.releaseBulkRelease }))
      await user.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: t.confirm }))
      expect(await screen.findByText(`1 ${t.releaseUpdateFailed}`)).toBeInTheDocument()
    })

    it("does not patch when the confirmation is cancelled", async () => {
      const user = userEvent.setup()
      renderWithProviders(<ReleasesPage />)
      await screen.findByText("Story One")
      await user.click(within(sectionOf(pt.releaseUncategorized)).getByRole("button", { name: pt.releaseBulkRelease }))
      const confirm = await screen.findByRole("alertdialog")
      expect(confirm).toHaveTextContent(`1 ${t.releaseBulkConfirm}`)
      await user.click(within(confirm).getByRole("button", { name: t.cancel }))
      await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument())
      expect(calls.some((c) => c.method === "PATCH")).toBe(false)
    })
  })
})
