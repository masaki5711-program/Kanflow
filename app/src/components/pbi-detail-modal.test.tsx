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

beforeEach(() => {
  patchBodies = []
  getStatus = 200
  patchStatus = 200
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === "PATCH") {
        patchBodies.push(JSON.parse(String(init.body)))
        return patchStatus === 200 ? jsonResponse({ ok: true }) : jsonResponse({ error: "conflict" }, patchStatus)
      }
      return getStatus === 200 ? jsonResponse(PBI) : jsonResponse({ error: "not found" }, getStatus)
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
})

describe("PbiDetailModal (edit mode)", () => {
  it("closes immediately on Save when nothing changed (no PATCH)", async () => {
    const { onClose } = renderModal({ editable: true })
    await screen.findByLabelText(pt.backlogEpic)
    await userEvent.click(screen.getByRole("button", { name: t.update }))
    expect(onClose).toHaveBeenCalled()
    expect(patchBodies).toEqual([])
  })

  it("guards unsaved changes: Cancel asks, keeping the edit when declined", async () => {
    // Arrange
    const { onClose } = renderModal({ editable: true })
    const epic = await screen.findByLabelText(pt.backlogEpic)
    await userEvent.clear(epic)
    await userEvent.type(epic, "Identity")
    // Act
    await userEvent.click(screen.getByRole("button", { name: t.cancel }))
    // Assert
    const alert = await screen.findByRole("alertdialog")
    expect(alert).toBeInTheDocument()
    await userEvent.click(within(alert).getByRole("button", { name: "Cancel" }))
    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument())
    expect(onClose).not.toHaveBeenCalled()
    expect(screen.getByLabelText(pt.backlogEpic)).toHaveValue("Identity")
  })

  it("guards unsaved changes: Escape asks and discarding closes", async () => {
    const { onClose } = renderModal({ editable: true })
    const epic = await screen.findByLabelText(pt.backlogEpic)
    await userEvent.type(epic, "!")
    await userEvent.keyboard("{Escape}")
    const alert = await screen.findByRole("alertdialog")
    await userEvent.click(within(alert).getByRole("button", { name: "Discard and close" }))
    await waitFor(() => expect(onClose).toHaveBeenCalledWith("escape"))
    expect(patchBodies).toEqual([])
  })

  it("registers a beforeunload guard while dirty", async () => {
    renderModal({ editable: true })
    const epic = await screen.findByLabelText(pt.backlogEpic)
    await userEvent.type(epic, "x")
    const ev = new Event("beforeunload", { cancelable: true })
    window.dispatchEvent(ev)
    expect(ev.defaultPrevented).toBe(true)
  })

  it("PATCHes only changed fields, then calls onSaved and onClose", async () => {
    const { onClose, onSaved } = renderModal({ editable: true })
    const epic = await screen.findByLabelText(pt.backlogEpic)
    await userEvent.clear(epic)
    const score = screen.getByLabelText(pt.backlogWorkloadScore)
    await userEvent.clear(score)
    await userEvent.type(score, "8")
    await userEvent.selectOptions(screen.getByLabelText(t.sprintStatus), "ready")
    await userEvent.type(screen.getByLabelText(t.backlogPoNote), "note")
    await userEvent.click(screen.getByRole("button", { name: t.update }))
    await waitFor(() => expect(onSaved).toHaveBeenCalled())
    expect(onClose).toHaveBeenCalled()
    expect(patchBodies).toEqual([{ epic: null, poNote: "note", workloadScore: 8, status: "ready" }])
    // the not-ready reason field disappears once status is no longer not_ready
    expect(screen.queryByLabelText(t.backlogNotReadyReason)).not.toBeInTheDocument()
  })

  it("keeps the modal open and toasts on save failure", async () => {
    patchStatus = 409
    const { onClose } = renderModal({ editable: true })
    const score = await screen.findByLabelText(pt.backlogWorkloadScore)
    await userEvent.clear(score)
    await userEvent.click(screen.getByRole("button", { name: t.update }))
    expect(await screen.findByText(`${t.backlogSaveFailed}: conflict`)).toBeInTheDocument()
    expect(patchBodies).toEqual([{ workloadScore: null }])
    expect(onClose).not.toHaveBeenCalled()
  })
})
