import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { getTranslations } from "@/lib/i18n"
import { getProjectTypeLabels } from "@/lib/project-type-labels"
import { jsonResponse, renderWithProviders, stubLayout } from "./__tests__/helpers"

vi.mock("@/components/ai-result-modal", () => ({
  AIResultModal: ({ title, fetchUrl, onClose }: { title: string; fetchUrl: string; onClose: () => void }) => (
    <div data-testid="ai-modal" data-url={fetchUrl}>
      {title}
      <button type="button" onClick={onClose}>
        close-ai
      </button>
    </div>
  ),
}))

const { default: PbiDetailModal } = await import("./pbi-detail-modal")

stubLayout()

const t = getTranslations("en")
const pt = getProjectTypeLabels("software", "en")

const PBI = {
  id: "pbi-1",
  displayId: 12,
  initiative: "Faster login",
  epic: "Auth",
  userStory: "As a user I want SSO",
  acceptanceCriteria: "Given...",
  referenceDoc: null,
  workloadScore: 5,
  status: "not_ready",
  notReadyReason: "Needs design",
  poNote: null,
  assignedPo: "Hanako",
  completedAt: null,
  createdAt: "2026-01-01",
  updatedAt: "2026-01-01",
  productGoal: { id: "g1", title: "Goal A" },
  iceboxItem: { id: "i1", displayId: 3, request: "Idea" },
}

let patchBodies: unknown[] = []
let getStatus = 200
let patchStatus = 200
let optionGets: string[] = []

/** Routes the modal's GETs: the PBI itself, and the form choices (icebox / goals / project). */
function respondGet(url: string) {
  if (url.endsWith("/icebox")) return (optionGets.push("icebox"), jsonResponse({ unreviewed: [{ id: "i1", displayId: 3, request: "Idea", author: "Ann" }], reviewed: [] }))
  if (url.endsWith("/goals")) return (optionGets.push("goals"), jsonResponse([{ id: "g1", title: "Goal A" }]))
  if (url.endsWith("/projects/p1")) return (optionGets.push("project"), jsonResponse({ pointUnit: "SP" }))
  if (url.includes("/comments") || url.includes("/activity")) return jsonResponse([])
  return getStatus === 200 ? jsonResponse(PBI) : jsonResponse({ error: "not found" }, getStatus)
}

beforeEach(() => {
  patchBodies = []
  optionGets = []
  getStatus = 200
  patchStatus = 200
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === "PATCH") {
        patchBodies.push(JSON.parse(String(init.body)))
        return patchStatus === 200 ? jsonResponse({ ok: true }) : jsonResponse({ error: "conflict" }, patchStatus)
      }
      return respondGet(String(url))
    }),
  )
})
afterEach(() => {
  vi.unstubAllGlobals()
})

function renderModal(props: Partial<React.ComponentProps<typeof PbiDetailModal>> = {}) {
  const onClose = vi.fn()
  const onSaved = vi.fn()
  renderWithProviders(<PbiDetailModal projectId="p1" pbiId="pbi-1" onClose={onClose} onSaved={onSaved} {...props} />)
  return { onClose, onSaved }
}

async function enterEditMode() {
  await userEvent.click(await screen.findByRole("button", { name: t.edit }))
  return screen.findByLabelText(pt.backlogEpic, { selector: "input" })
}

describe("PbiDetailModal (read mode)", () => {
  it("shows a loading skeleton then the read-only details", async () => {
    renderModal()
    expect(screen.getByRole("status", { busy: true })).toBeInTheDocument()
    const dialog = await screen.findByRole("dialog", { name: "Faster login" })
    expect(within(dialog).getByText("#12")).toBeInTheDocument()
    expect(within(dialog).getByText(t.backlogStatusNotReady)).toBeInTheDocument()
    expect(within(dialog).getByText("→ Goal A")).toBeInTheDocument()
    expect(within(dialog).getByText("As a user I want SSO")).toBeInTheDocument()
    expect(within(dialog).getByText("Needs design")).toBeInTheDocument()
    expect(within(dialog).getByText("#3 Idea")).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: t.update })).not.toBeInTheDocument()
    // Without edit rights there is no Edit button, and no form data is fetched.
    expect(screen.queryByRole("button", { name: t.edit })).not.toBeInTheDocument()
    expect(optionGets).toEqual([])
  })

  it("shows an error state with retry when loading fails", async () => {
    getStatus = 404
    renderModal()
    expect(await screen.findByText("not found")).toBeInTheDocument()
    getStatus = 200
    await userEvent.click(screen.getByRole("button", { name: t.backlogRetry }))
    expect(await screen.findByRole("dialog", { name: "Faster login" })).toBeInTheDocument()
  })

  it("closes without asking when nothing is edited", async () => {
    const { onClose } = renderModal()
    await screen.findByRole("dialog", { name: "Faster login" })
    // Footer "Close" (the header ✕ shares the label; the footer one is last in DOM order)
    const closes = screen.getAllByRole("button", { name: t.close })
    await userEvent.click(closes[closes.length - 1])
    expect(onClose).toHaveBeenCalledWith("request")
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument()
  })

  it("opens the INVEST review modal", async () => {
    renderModal()
    await screen.findByRole("dialog", { name: "Faster login" })
    await userEvent.click(screen.getByRole("button", { name: new RegExp(t.aiInvestReview) }))
    expect(screen.getByTestId("ai-modal")).toHaveAttribute("data-url", "/api/projects/p1/backlog/pbi-1/ai/invest-review")
    await userEvent.click(screen.getByRole("button", { name: "close-ai" }))
    expect(screen.queryByTestId("ai-modal")).not.toBeInTheDocument()
  })

  it("copies the deep link (by displayId) and confirms with a toast", async () => {
    const writeText = vi.fn(async () => undefined)
    vi.stubGlobal("navigator", { ...navigator, clipboard: { writeText } })
    renderModal()
    await screen.findByRole("dialog", { name: "Faster login" })
    await userEvent.click(screen.getByRole("button", { name: t.backlogCopyLink }))
    expect(writeText).toHaveBeenCalledWith(`${window.location.origin}/projects/p1/backlog?pbi=12`)
    expect(await screen.findByText(t.backlogLinkCopied)).toBeInTheDocument()
  })

  it("reports a clipboard failure", async () => {
    vi.stubGlobal("navigator", { ...navigator, clipboard: { writeText: vi.fn(async () => Promise.reject(new Error("denied"))) } })
    renderModal()
    await screen.findByRole("dialog", { name: "Faster login" })
    await userEvent.click(screen.getByRole("button", { name: t.backlogCopyLink }))
    expect(await screen.findByText(t.backlogLinkCopyFailed)).toBeInTheDocument()
  })
})

describe("PbiDetailModal (edit mode)", () => {
  it("opens read-only; Edit switches the Details tab to the form and loads the form choices", async () => {
    renderModal({ editable: true })
    await screen.findByRole("dialog", { name: "Faster login" })
    expect(screen.queryByLabelText(pt.backlogEpic, { selector: "input" })).not.toBeInTheDocument()
    const epic = await enterEditMode()
    expect(epic).toHaveValue("Auth")
    expect(screen.getByRole("button", { name: t.update })).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: t.edit })).not.toBeInTheDocument()
    await waitFor(() => expect(optionGets.sort()).toEqual(["goals", "icebox", "project"]))
  })

  it("initialMode=edit starts in the form", async () => {
    renderModal({ editable: true, initialMode: "edit" })
    expect(await screen.findByLabelText(pt.backlogEpic, { selector: "input" })).toHaveValue("Auth")
  })

  it("uses the caller's form options instead of fetching them", async () => {
    renderModal({
      editable: true,
      initialMode: "edit",
      formOptions: { iceboxOptions: [], goals: [], pointUnit: "SP", iceboxUsage: new Map() },
    })
    await screen.findByLabelText(pt.backlogEpic, { selector: "input" })
    expect(optionGets).toEqual([])
  })

  it("Update without changes returns to the read view without a PATCH", async () => {
    const { onClose } = renderModal({ editable: true })
    await enterEditMode()
    await userEvent.click(screen.getByRole("button", { name: t.update }))
    expect(await screen.findByRole("button", { name: t.edit })).toBeInTheDocument()
    expect(onClose).not.toHaveBeenCalled()
    expect(patchBodies).toEqual([])
  })

  it("Cancel with unsaved changes asks; declining keeps the edit, discarding returns to read mode", async () => {
    // Arrange
    const { onClose } = renderModal({ editable: true })
    const epic = await enterEditMode()
    await userEvent.clear(epic)
    await userEvent.type(epic, "Identity")
    // Act
    await userEvent.click(screen.getByRole("button", { name: t.cancel }))
    // Assert
    let alert = await screen.findByRole("alertdialog")
    await userEvent.click(within(alert).getByRole("button", { name: "Cancel" }))
    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument())
    expect(screen.getByLabelText(pt.backlogEpic, { selector: "input" })).toHaveValue("Identity")

    await userEvent.click(screen.getByRole("button", { name: t.cancel }))
    alert = await screen.findByRole("alertdialog")
    await userEvent.click(within(alert).getByRole("button", { name: "Discard and close" }))
    expect(await screen.findByRole("button", { name: t.edit })).toBeInTheDocument()
    expect(screen.getByText("Auth")).toBeInTheDocument()
    expect(onClose).not.toHaveBeenCalled()
  })

  it("Cancel without changes returns to read mode without asking", async () => {
    renderModal({ editable: true })
    await enterEditMode()
    await userEvent.click(screen.getByRole("button", { name: t.cancel }))
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument()
    expect(await screen.findByRole("button", { name: t.edit })).toBeInTheDocument()
  })

  it("guards unsaved changes: Escape asks and discarding closes", async () => {
    const { onClose } = renderModal({ editable: true })
    const epic = await enterEditMode()
    await userEvent.type(epic, "!")
    await userEvent.keyboard("{Escape}")
    const alert = await screen.findByRole("alertdialog")
    await userEvent.click(within(alert).getByRole("button", { name: "Discard and close" }))
    await waitFor(() => expect(onClose).toHaveBeenCalledWith("escape"))
    expect(patchBodies).toEqual([])
  })

  it("registers a beforeunload guard while dirty", async () => {
    renderModal({ editable: true })
    const epic = await enterEditMode()
    await userEvent.type(epic, "x")
    const ev = new Event("beforeunload", { cancelable: true })
    window.dispatchEvent(ev)
    expect(ev.defaultPrevented).toBe(true)
  })

  it("PATCHes only changed fields, calls onSaved and goes back to the read view", async () => {
    const { onClose, onSaved } = renderModal({ editable: true })
    const epic = await enterEditMode()
    await userEvent.clear(epic)
    const score = screen.getByLabelText(pt.backlogWorkloadScore)
    await userEvent.clear(score)
    await userEvent.type(score, "8")
    await userEvent.selectOptions(screen.getByLabelText(t.sprintStatus), "ready")
    // the not-ready reason field disappears once status is no longer not_ready
    expect(screen.queryByLabelText(t.backlogNotReadyReason)).not.toBeInTheDocument()
    await userEvent.type(screen.getByLabelText(t.backlogPoNote), "note")
    await userEvent.click(screen.getByRole("button", { name: t.update }))
    await waitFor(() => expect(onSaved).toHaveBeenCalled())
    expect(onClose).not.toHaveBeenCalled()
    expect(patchBodies).toEqual([{ epic: "", poNote: "note", workloadScore: 8, status: "ready" }])
    expect(await screen.findByRole("button", { name: t.edit })).toBeInTheDocument()
  })

  it("quick-pick point buttons set the workload", async () => {
    renderModal({ editable: true })
    await enterEditMode()
    const group = screen.getByRole("group", { name: t.backlogWorkloadQuickPick.replace("{label}", pt.backlogWorkloadScore) })
    await userEvent.click(within(group).getByRole("button", { name: "13" }))
    expect(screen.getByLabelText(pt.backlogWorkloadScore)).toHaveValue(13)
    await userEvent.click(screen.getByRole("button", { name: t.update }))
    await waitFor(() => expect(patchBodies).toEqual([{ workloadScore: 13 }]))
  })

  it("keeps the form open and toasts on save failure", async () => {
    patchStatus = 422
    const { onClose } = renderModal({ editable: true })
    await enterEditMode()
    const score = screen.getByLabelText(pt.backlogWorkloadScore)
    await userEvent.clear(score)
    await userEvent.click(screen.getByRole("button", { name: t.update }))
    expect(await screen.findByText(`${t.backlogSaveFailed}: conflict`)).toBeInTheDocument()
    expect(patchBodies).toEqual([{ workloadScore: 0 }])
    expect(onClose).not.toHaveBeenCalled()
    expect(screen.getByLabelText(pt.backlogWorkloadScore)).toBeInTheDocument()
  })

  it("sends the loaded version; a VERSION_CONFLICT loads the server's version into the form, lists the lost input and stays in edit mode", async () => {
    let gets = 0
    const bodies: unknown[] = []
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        if (init?.method === "PATCH") {
          bodies.push(JSON.parse(String(init.body)))
          return jsonResponse({ error: "stale", code: "VERSION_CONFLICT", current: { ...PBI, epic: "Theirs", version: 4 } }, 409)
        }
        if (!String(url).endsWith("/backlog/pbi-1")) return respondGet(String(url))
        gets++
        return jsonResponse(gets === 1 ? { ...PBI, version: 3 } : { ...PBI, epic: "Theirs", version: 4 })
      }),
    )
    const { onClose } = renderModal({ editable: true })
    const epic = await enterEditMode()
    await userEvent.clear(epic)
    await userEvent.type(epic, "Mine")
    await userEvent.click(screen.getByRole("button", { name: t.update }))
    await waitFor(() => expect(bodies).toEqual([{ epic: "Mine", version: 3 }]))
    expect(await screen.findByDisplayValue("Theirs")).toBeInTheDocument()
    expect(screen.queryByText(new RegExp(t.backlogSaveFailed))).not.toBeInTheDocument()
    expect(onClose).not.toHaveBeenCalled()
    // `current` from the 409 body replaced the stale copy (no extra GET).
    expect(gets).toBe(1)
    const notice = screen.getByText(t.apiErrVersionConflictReenter).closest("[role=alert]") as HTMLElement
    expect(within(notice).getByText("Mine")).toBeInTheDocument()
    // A second save sends the new version, so it can never silently overwrite.
    await userEvent.type(screen.getByDisplayValue("Theirs"), "!")
    await userEvent.click(screen.getByRole("button", { name: t.update }))
    await waitFor(() => expect(bodies).toEqual([{ epic: "Mine", version: 3 }, { epic: "Theirs!", version: 4 }]))
  })

  it("unlinks the IceBox request and the goal (sent as null)", async () => {
    renderModal({ editable: true })
    await enterEditMode()
    await waitFor(() => expect(optionGets).toContain("icebox"))
    const [iceboxSelect, goalSelect] = screen.getAllByRole("combobox")
    await userEvent.selectOptions(goalSelect, "")
    await userEvent.selectOptions(iceboxSelect, "")
    await userEvent.click(screen.getByRole("button", { name: t.update }))
    await waitFor(() => expect(patchBodies).toEqual([{ productGoalId: null, iceboxItemId: null }]))
  })
})
