import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { deferred, json, renderWithProviders, stubFetch, t } from "./helpers"
import DailyScrumPanel from "../components/daily-scrum-panel"

const URL = "/api/projects/p1/sprints/s1/daily-scrums"

function note(id: string, over: Record<string, unknown> = {}) {
  return {
    id, sprintId: "s1", date: "2026-09-03T00:00:00.000Z", content: `Note ${id}`, author: "Alice",
    archivedAt: null, createdAt: "2026-09-03T00:00:00.000Z", updatedAt: "2026-09-03T00:00:00.000Z", ...over,
  }
}

function renderPanel(readOnly = false) {
  return renderWithProviders(
    <DailyScrumPanel projectId="p1" sprintId="s1" sprintStartDate="2026-09-01T00:00:00.000Z"
      sprintEndDate="2026-09-14T00:00:00.000Z" readOnly={readOnly} />,
  )
}

beforeEach(() => {
  // "Today" (the add form's default date) must fall inside the sprint range.
  vi.useFakeTimers({ toFake: ["Date"] })
  vi.setSystemTime(new Date(2026, 8, 5, 10))
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe("DailyScrumPanel", () => {
  it("defaults the add form's date to the sprint end date when the sprint has ended", async () => {
    vi.setSystemTime(new Date(2026, 8, 23, 10))
    stubFetch({ [URL]: () => json([]) })
    renderPanel()
    await screen.findByText(t.sprintDailyScrumEmpty)
    expect(screen.getByLabelText(new RegExp(t.sprintDailyScrumDatePlaceholder))).toHaveValue("2026-09-14")
  })

  it("shows a skeleton, then the empty state", async () => {
    const pending = deferred<Response>()
    stubFetch({ [URL]: () => pending.promise })
    renderPanel()
    expect(screen.getByText(t.loading)).toBeInTheDocument()
    pending.resolve(json([]))
    expect(await screen.findByText(t.sprintDailyScrumEmpty)).toBeInTheDocument()
  })

  it("creates a note with trimmed content, refetches and resets the form", async () => {
    let notes: unknown[] = []
    const { calls } = stubFetch({
      [URL]: () => json(notes),
      [`POST ${URL}`]: (body: unknown) => {
        notes = [note("n1", { content: (body as { content: string }).content })]
        return json({})
      },
    })
    renderPanel()
    await screen.findByText(t.sprintDailyScrumEmpty)
    const submit = screen.getByRole("button", { name: t.add })
    expect(submit).toBeDisabled()
    const textarea = screen.getByPlaceholderText(t.sprintDailyScrumContentPlaceholder)
    await userEvent.type(textarea, "  Yesterday: X  ")
    expect(screen.getByText("16 / 2000")).toBeInTheDocument()
    const dateInput = screen.getByLabelText(new RegExp(t.sprintDailyScrumDatePlaceholder))
    expect(dateInput).toHaveAttribute("min", "2026-09-01")
    expect(dateInput).toHaveAttribute("max", "2026-09-14")
    await userEvent.click(submit)
    await waitFor(() => expect(calls.find((c) => c.method === "POST")?.body).toEqual({ date: "2026-09-05", content: "Yesterday: X" }))
    expect(await screen.findByText("Yesterday: X")).toBeInTheDocument()
    expect(textarea).toHaveValue("")
  })

  it("keeps the draft and toasts when creating fails", async () => {
    stubFetch({ [URL]: [], [`POST ${URL}`]: () => json({ error: "server says no" }, 500) })
    renderPanel()
    await screen.findByText(t.sprintDailyScrumEmpty)
    const textarea = screen.getByPlaceholderText(t.sprintDailyScrumContentPlaceholder)
    await userEvent.type(textarea, "draft")
    await userEvent.click(screen.getByRole("button", { name: t.add }))
    expect(await screen.findByText("server says no")).toBeInTheDocument()
    expect(textarea).toHaveValue("draft")
  })

  it("archives a note optimistically and can restore it from the archived list", async () => {
    const archive = deferred<Response>()
    let notes = [note("n1")]
    const { calls } = stubFetch({
      [URL]: () => json(notes),
      [`PATCH ${URL}/n1`]: (body: unknown) => {
        const archived = (body as { archived: boolean }).archived
        if (archived) return archive.promise.then((r) => {
          notes = [note("n1", { archivedAt: "2026-09-04T00:00:00.000Z" })]
          return r
        })
        notes = [note("n1")]
        return json({})
      },
    })
    renderPanel()
    const item = (await screen.findByText("Note n1")).closest("li") as HTMLElement
    const archiveBtn = within(item).getByRole("button", { name: new RegExp(`^${t.sprintDailyScrumArchive}:`) })
    await userEvent.click(archiveBtn)
    // Optimistically moved out of the active list before the server answers.
    expect(screen.getByText(t.sprintDailyScrumEmpty)).toBeInTheDocument()
    const archivedToggle = screen.getByRole("button", { name: `${t.sprintDailyScrumArchived} (1)` })
    expect(archivedToggle).toHaveAttribute("aria-expanded", "false")
    archive.resolve(json({}))
    await waitFor(() => expect(calls.filter((c) => c.method === "GET").length).toBeGreaterThan(1))

    await userEvent.click(archivedToggle)
    expect(archivedToggle).toHaveAttribute("aria-expanded", "true")
    const archivedItem = screen.getByText("Note n1").closest("li") as HTMLElement
    expect(within(archivedItem).queryByRole("button", { name: new RegExp(`^${t.edit}:`) })).not.toBeInTheDocument()
    await userEvent.click(within(archivedItem).getByRole("button", { name: new RegExp(`^${t.sprintDailyScrumUnarchive}:`) }))
    await waitFor(() => expect(calls.filter((c) => c.method === "PATCH").map((c) => c.body)).toEqual([{ archived: true }, { archived: false }]))
    expect(await screen.findByText("Note n1")).toBeInTheDocument()
    expect(screen.queryByText(t.sprintDailyScrumEmpty)).not.toBeInTheDocument()
  })

  it("rolls back an archive when the request fails", async () => {
    stubFetch({ [URL]: [note("n1")], [`PATCH ${URL}/n1`]: () => json({ error: "boom" }, 500) })
    renderPanel()
    const item = (await screen.findByText("Note n1")).closest("li") as HTMLElement
    await userEvent.click(within(item).getByRole("button", { name: new RegExp(`^${t.sprintDailyScrumArchive}:`) }))
    expect(await screen.findByText("boom")).toBeInTheDocument()
    expect(screen.getByText("Note n1")).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: /\(1\)$/ })).not.toBeInTheDocument()
  })

  it("edits a note in place and deletes a note after confirmation", async () => {
    let notes = [note("n1"), note("n2", { author: null })]
    const { calls } = stubFetch({
      [URL]: () => json(notes),
      [`PATCH ${URL}/n1`]: (body: unknown) => {
        notes = [note("n1", { content: (body as { content: string }).content }), notes[1]]
        return json({})
      },
      [`DELETE ${URL}/n2`]: () => {
        notes = [notes[0]]
        return json({})
      },
    })
    renderPanel()
    const item = (await screen.findByText("Note n1")).closest("li") as HTMLElement
    await userEvent.click(within(item).getByRole("button", { name: new RegExp(`^${t.edit}:`) }))
    const editor = screen.getByDisplayValue("Note n1")
    // Cancel returns to read mode.
    await userEvent.click(screen.getByRole("button", { name: t.cancel }))
    expect(editor).not.toBeInTheDocument()
    await userEvent.click(within(screen.getByText("Note n1").closest("li") as HTMLElement).getByRole("button", { name: new RegExp(`^${t.edit}:`) }))
    const edit2 = screen.getByDisplayValue("Note n1")
    await userEvent.clear(edit2)
    await userEvent.type(edit2, "Updated")
    await userEvent.click(screen.getByRole("button", { name: t.save }))
    await waitFor(() => expect(calls.find((c) => c.method === "PATCH")?.body).toEqual({ date: "2026-09-03", content: "Updated" }))
    expect(await screen.findByText("Updated")).toBeInTheDocument()

    const n2 = screen.getByText("Note n2").closest("li") as HTMLElement
    await userEvent.click(within(n2).getByRole("button", { name: new RegExp(`^${t.delete}:`) }))
    const dlg = await screen.findByRole("alertdialog")
    expect(dlg).toHaveTextContent(t.sprintDailyScrumDeleteConfirm)
    await userEvent.click(within(dlg).getByRole("button", { name: t.cancel }))
    expect(calls.some((c) => c.method === "DELETE")).toBe(false)
    await userEvent.click(within(n2).getByRole("button", { name: new RegExp(`^${t.delete}:`) }))
    await userEvent.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: t.delete }))
    await waitFor(() => expect(screen.queryByText("Note n2")).not.toBeInTheDocument())
    expect(calls.some((c) => c.method === "DELETE" && c.url === `${URL}/n2`)).toBe(true)
  })

  it("keeps the editor open when the update fails", async () => {
    stubFetch({ [URL]: [note("n1")], [`PATCH ${URL}/n1`]: () => json({ error: "nope" }, 500) })
    renderPanel()
    const item = (await screen.findByText("Note n1")).closest("li") as HTMLElement
    await userEvent.click(within(item).getByRole("button", { name: new RegExp(`^${t.edit}:`) }))
    await userEvent.click(screen.getByRole("button", { name: t.save }))
    expect(await screen.findByText("nope")).toBeInTheDocument()
    expect(screen.getByDisplayValue("Note n1")).toBeInTheDocument()
  })

  it("hides the add form and row actions in read-only mode, and tolerates bad dates", async () => {
    stubFetch({ [URL]: [note("n1", { date: "not-a-date" })] })
    renderPanel(true)
    expect(await screen.findByText("Note n1")).toBeInTheDocument()
    expect(screen.getByText("not-a-date")).toBeInTheDocument()
    expect(screen.queryByPlaceholderText(t.sprintDailyScrumContentPlaceholder)).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: new RegExp(`^${t.delete}:`) })).not.toBeInTheDocument()
  })
})
