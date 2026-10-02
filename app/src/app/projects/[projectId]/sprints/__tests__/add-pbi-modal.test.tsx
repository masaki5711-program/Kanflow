import { afterEach, describe, expect, it, vi } from "vitest"
import { screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { deferred, json, renderWithProviders, stubFetch, t } from "./helpers"
import AddPbiModal from "../components/add-pbi-modal"

vi.mock("@/components/pbi-detail-modal", () => ({
  default: ({ pbiId, onClose }: { pbiId: string; onClose: () => void }) => (
    <div data-testid="pbi-detail">{pbiId}<button onClick={onClose}>close-detail</button></div>
  ),
}))

const BACKLOG = "/api/projects/p1/backlog"
const ATTACH = "/api/projects/p1/sprints/s1/pbis"

const readyItems = [
  { id: "a", displayId: 1, initiative: "Login page", epic: "Auth", userStory: null, workloadScore: 3, status: "ready", productGoal: { id: "g", title: "Goal X" } },
  { id: "b", displayId: 2, initiative: null, epic: null, userStory: "Search story", workloadScore: 5, status: "ready" },
  { id: "c", displayId: 3, initiative: null, epic: null, userStory: null, workloadScore: 1, status: "ready" },
  { id: "x", displayId: 9, initiative: "Already in sprint", epic: null, userStory: null, workloadScore: 1, status: "ready" },
]

function renderModal(canCreate = true) {
  const onAdded = vi.fn()
  const onClose = vi.fn()
  renderWithProviders(
    <AddPbiModal projectId="p1" sprintId="s1" sprintName="Sprint 1" existingPbIds={new Set(["x"])} pointUnit="SP"
      canCreate={canCreate} onAdded={onAdded} onClose={onClose} />,
  )
  return { onAdded, onClose }
}

const selectLabel = (id: number, title: string) => `${t.backlogAddPbiSelect.replace("{id}", String(id))} ${title}`

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("AddPbiModal", () => {
  it("lists eligible ready PBIs, filters by search and attaches the selection", async () => {
    const { calls } = stubFetch({ [BACKLOG]: { readyItems }, [`POST ${ATTACH}`]: {} })
    const { onAdded, onClose } = renderModal()
    expect(screen.getByText(t.loading)).toBeInTheDocument()
    expect(await screen.findByText("Goal X")).toBeInTheDocument()
    expect(screen.queryByText("Already in sprint")).not.toBeInTheDocument()
    expect(screen.getByText("—")).toBeInTheDocument()

    const submit = screen.getByRole("button", { name: t.sprintAddPbiSubmit })
    expect(submit).toBeDisabled()
    const rowA = screen.getByRole("checkbox", { name: selectLabel(1, "Login page") })
    await userEvent.click(rowA)
    expect(rowA).toHaveAttribute("aria-checked", "true")
    await userEvent.click(screen.getByRole("checkbox", { name: selectLabel(2, "Search story") }))
    expect(screen.getByText(t.backlogAddPbiSelectedCount.replace("{n}", "2"))).toBeInTheDocument()
    await userEvent.click(screen.getByRole("checkbox", { name: selectLabel(2, "Search story") }))

    const search = screen.getByRole("searchbox")
    await userEvent.type(search, "goal x")
    expect(screen.queryByText("Search story")).not.toBeInTheDocument()
    await userEvent.clear(search)
    await userEvent.type(search, "zzz")
    expect(screen.getByText(t.userNoResults)).toBeInTheDocument()
    await userEvent.clear(search)

    await userEvent.click(submit)
    await waitFor(() => expect(calls.find((c) => c.method === "POST")?.body).toEqual({ pbIds: ["a"] }))
    await waitFor(() => expect(onAdded).toHaveBeenCalled())
    expect(onClose).toHaveBeenCalled()
  })

  it("shows the empty state when the backlog has no ready items and hides the tabs for members", async () => {
    stubFetch({ [BACKLOG]: {} })
    renderModal(false)
    expect(await screen.findByText(t.sprintNoTasks)).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: t.backlogAddPbiTabExisting })).not.toBeInTheDocument()
  })

  it("opens and closes the PBI detail preview", async () => {
    stubFetch({ [BACKLOG]: { readyItems } })
    renderModal()
    await userEvent.click(await screen.findByRole("button", { name: `${t.view}: #1` }))
    expect(screen.getByTestId("pbi-detail")).toHaveTextContent("a")
    await userEvent.click(screen.getByText("close-detail"))
    expect(screen.queryByTestId("pbi-detail")).not.toBeInTheDocument()
  })

  it("creates a brand-new PBI and attaches it to the sprint", async () => {
    const create = deferred<Response>()
    const { calls } = stubFetch({
      [BACKLOG]: { readyItems },
      [`POST ${BACKLOG}`]: () => create.promise,
      [`POST ${ATTACH}`]: {},
    })
    const { onAdded } = renderModal()
    await screen.findByText("Goal X")
    const newTab = screen.getByRole("button", { name: `+ ${t.backlogAddPbiTabNew}` })
    await userEvent.click(newTab)
    expect(newTab).toHaveAttribute("aria-pressed", "true")
    const submit = screen.getByRole("button", { name: t.sprintAddPbiSubmit })
    expect(submit).toBeDisabled()
    const [initiative, epic] = screen.getAllByRole("textbox")
    await userEvent.type(initiative, "  New feature ")
    await userEvent.type(epic, "E")
    const score = screen.getByRole("spinbutton")
    await userEvent.clear(score)
    await userEvent.click(submit)
    create.resolve(json({ id: "new1" }))
    await waitFor(() => expect(onAdded).toHaveBeenCalled())
    expect(calls.find((c) => c.method === "POST" && c.url === BACKLOG)?.body).toEqual({
      initiative: "New feature", epic: "E", userStory: null, acceptanceCriteria: null, workloadScore: 0, assignedPo: null, referenceDoc: null, status: "ready",
    })
    expect(calls.find((c) => c.url === ATTACH)?.body).toEqual({ pbIds: ["new1"] })
  })

  it("toasts when attaching fails and keeps the modal open", async () => {
    stubFetch({ [BACKLOG]: { readyItems }, [`POST ${ATTACH}`]: () => json({ error: "already attached" }, 409) })
    const { onClose } = renderModal()
    await userEvent.click(await screen.findByRole("checkbox", { name: selectLabel(1, "Login page") }))
    await userEvent.click(screen.getByRole("button", { name: t.sprintAddPbiSubmit }))
    expect(await screen.findByText("already attached")).toBeInTheDocument()
    expect(onClose).not.toHaveBeenCalled()
  })

  it("asks before discarding a selection on cancel", async () => {
    stubFetch({ [BACKLOG]: { readyItems } })
    const { onClose } = renderModal()
    await userEvent.click(await screen.findByRole("checkbox", { name: selectLabel(1, "Login page") }))
    const dialog = screen.getByRole("dialog")
    await userEvent.click(within(dialog).getByRole("button", { name: t.cancel }))
    const confirm = await screen.findByRole("alertdialog")
    await userEvent.click(within(confirm).getAllByRole("button")[1])
    await waitFor(() => expect(onClose).toHaveBeenCalled())
  })
})
