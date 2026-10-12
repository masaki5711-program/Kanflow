import { beforeEach, describe, expect, it, vi } from "vitest"
import { fireEvent, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { jsonResponse, renderWithProviders, stubFetch, tr } from "@/app/__tests__/test-utils"
import { PlanBulkDialog } from "../components/plan-bulk-dialog"
import { PlanImportDialog } from "../components/plan-import-dialog"
import { PlanReflowDialog } from "../components/plan-reflow-dialog"
import { bodyOf, callsTo, stubMatchMedia } from "./plan-server"
import { installMemoryStorage, mkItem } from "./fixtures"

const t = tr("en")
const API = "/api/projects/p1/plan"
const MEMBERS = [{ id: "u1", name: "Sato" }]

const moved = (id: string) => ({ id, name: id, plannedStart: "2026-10-01", plannedEnd: "2026-10-05", newStart: "2026-10-08", newEnd: "2026-10-12" })

beforeEach(() => {
  installMemoryStorage()
  stubMatchMedia(false)
})

describe("PlanBulkDialog", () => {
  it("previews a shift of the checked rows, then applies it", async () => {
    const onApplied = vi.fn()
    const fetchMock = stubFetch([
      {
        match: `${API}/bulk`,
        method: "POST",
        respond: (_u, init) => {
          const body = JSON.parse(String(init?.body))
          return jsonResponse({ applied: body.apply, updated: body.apply ? 2 : undefined, moved: [moved("a"), moved("b")], skipped: [] })
        },
      },
    ])
    renderWithProviders(<PlanBulkDialog apiBase={API} mode="shift" ids={["a", "b"]} today="2026-10-01" members={MEMBERS} onClose={vi.fn()} onApplied={onApplied} />, { language: "en" })

    expect(await screen.findByText("2 items will move")).toBeInTheDocument()
    const preview = bodyOf(callsTo(fetchMock, "POST", `${API}/bulk`)[0]) as { op: { days: number }; apply: boolean }
    expect(preview).toMatchObject({ apply: false, op: { type: "shift", days: 7 } })

    await userEvent.setup().click(screen.getByTestId("plan-bulk-apply"))
    await waitFor(() => expect(onApplied).toHaveBeenCalled())
    expect(bodyOf(callsTo(fetchMock, "POST", `${API}/bulk`).at(-1))).toMatchObject({ apply: true, target: { ids: ["a", "b"] } })
  })

  it("sets the owner of the checked rows without a preview", async () => {
    const onApplied = vi.fn()
    const fetchMock = stubFetch([{ match: `${API}/bulk`, method: "POST", respond: () => jsonResponse({ applied: true, updated: 1, moved: [], skipped: [] }) }])
    renderWithProviders(<PlanBulkDialog apiBase={API} mode="owner" ids={["a"]} today="2026-10-01" members={MEMBERS} onClose={vi.fn()} onApplied={onApplied} />, { language: "en" })

    const user = userEvent.setup()
    await user.selectOptions(screen.getByRole("combobox"), "u1")
    await user.click(screen.getByTestId("plan-bulk-apply"))
    await waitFor(() => expect(onApplied).toHaveBeenCalled())
    expect(callsTo(fetchMock, "POST", `${API}/bulk`)).toHaveLength(1)
    expect(bodyOf(callsTo(fetchMock, "POST", `${API}/bulk`)[0])).toMatchObject({ op: { type: "owner", ownerId: "u1" }, apply: true })
  })

  it("'shift from a date' targets the date, not the checked rows", async () => {
    const fetchMock = stubFetch([{ match: `${API}/bulk`, method: "POST", respond: () => jsonResponse({ applied: false, moved: [moved("a")], skipped: [] }) }])
    renderWithProviders(<PlanBulkDialog apiBase={API} mode="shiftFrom" ids={[]} today="2026-10-14" members={MEMBERS} onClose={vi.fn()} onApplied={vi.fn()} />, { language: "en" })

    expect(await screen.findByText("1 items will move")).toBeInTheDocument()
    expect(bodyOf(callsTo(fetchMock, "POST", `${API}/bulk`)[0])).toMatchObject({ target: { fromDate: "2026-10-14" } })
  })
})

describe("PlanReflowDialog", () => {
  it("shows what would move, and applies", async () => {
    const onApplied = vi.fn()
    const fetchMock = stubFetch([
      {
        match: `${API}/reflow`,
        method: "POST",
        respond: (_u, init) => jsonResponse({ applied: JSON.parse(String(init?.body)).apply, moved: [moved("x")], skipped: [{ id: "y", name: "y", reason: "started" }] }),
      },
    ])
    renderWithProviders(<PlanReflowDialog apiBase={API} onClose={vi.fn()} onApplied={onApplied} />, { language: "en" })

    expect(await screen.findByText("1 items will move later")).toBeInTheDocument()
    expect(screen.getByText(/1 will stay/)).toBeInTheDocument()
    await userEvent.setup().click(screen.getByTestId("plan-reflow-apply"))
    await waitFor(() => expect(onApplied).toHaveBeenCalled())
    expect(bodyOf(callsTo(fetchMock, "POST", `${API}/reflow`).at(-1))).toMatchObject({ apply: true })
  })

  it("says so when nothing violates a dependency", async () => {
    stubFetch([{ match: `${API}/reflow`, method: "POST", respond: () => jsonResponse({ applied: false, moved: [], skipped: [] }) }])
    renderWithProviders(<PlanReflowDialog apiBase={API} onClose={vi.fn()} onApplied={vi.fn()} />, { language: "en" })
    expect(await screen.findByText(t.pscReflowNone)).toBeInTheDocument()
    expect(screen.getByTestId("plan-reflow-apply")).toBeDisabled()
  })
})

describe("PlanImportDialog", () => {
  const items = [mkItem({ id: "A", name: "Alpha", plannedStart: "2026-10-01", plannedEnd: "2026-10-20" })]

  function open(onImported = vi.fn()) {
    renderWithProviders(<PlanImportDialog apiBase={API} items={items} members={MEMBERS} today="2026-10-01" nameOf={(i) => i.name} onClose={vi.fn()} onImported={onImported} />, { language: "en" })
    return onImported
  }

  it("reads the pasted table, shows problems, and imports only a clean table", async () => {
    const fetchMock = stubFetch([{ match: `${API}/import`, method: "POST", respond: () => jsonResponse({ applied: true, count: 2, errors: [], createdIds: ["n1", "n2"] }) }])
    const onImported = open()

    const box = screen.getByTestId("plan-import-text")
    fireEvent.change(box, { target: { value: "Design\t10/5\t10/9\tSato\n  Basic\t10/5\t10/6" } })
    expect(screen.getByText("2 rows read")).toBeInTheDocument()
    expect(screen.getByTestId("plan-import-apply")).toBeEnabled()

    fireEvent.change(box, { target: { value: "Design\t10/9\t10/5" } })
    expect(screen.getByText(`Row 1: ${t.pscImportErrOrder}`)).toBeInTheDocument()
    expect(screen.getByTestId("plan-import-apply")).toBeDisabled()

    fireEvent.change(box, { target: { value: "Design\t10/5\t10/9\tSato\n  Basic\t10/5\t10/6" } })
    await userEvent.setup().click(screen.getByTestId("plan-import-apply"))
    await waitFor(() => expect(onImported).toHaveBeenCalled())
    expect(bodyOf(callsTo(fetchMock, "POST", `${API}/import`)[0])).toMatchObject({
      apply: true,
      parentId: null,
      rows: [
        { depth: 0, name: "Design", plannedStart: "2026-10-05", plannedEnd: "2026-10-09", ownerId: "u1" },
        { depth: 1, name: "Basic", plannedStart: "2026-10-05", plannedEnd: "2026-10-06", ownerId: null },
      ],
    })
  })

  it("keeps the dialog open and lists the server's row errors", async () => {
    stubFetch([{ match: `${API}/import`, method: "POST", respond: () => jsonResponse({ applied: false, count: 0, errors: [{ row: 1, code: "owner" }], createdIds: [] }) }])
    const onImported = open()
    fireEvent.change(screen.getByTestId("plan-import-text"), { target: { value: "Design" } })
    await userEvent.setup().click(screen.getByTestId("plan-import-apply"))
    expect(await screen.findByText(`Row 1: ${t.pscImportErrOwner}`)).toBeInTheDocument()
    expect(onImported).not.toHaveBeenCalled()
  })
})
