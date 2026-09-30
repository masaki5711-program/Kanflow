import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { getTranslations } from "@/lib/i18n"
import { getProjectTypeLabels } from "@/lib/project-type-labels"
import { jsonResponse, renderWithProviders, stubLayout } from "./__tests__/helpers"

/**
 * PBI detail modal: browser Back guard (F-02), ?tab=comments (F-05), INVEST
 * permission (F-07) and the conflict "restore my input" action.
 */
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
  status: "ready",
  notReadyReason: null,
  poNote: null,
  assignedPo: "Hanako",
  completedAt: null,
  createdAt: "2026-01-01",
  updatedAt: "2026-01-01",
  productGoal: null,
  iceboxItem: null,
  version: 3,
}

let patches: unknown[] = []
let conflictOnce = false

beforeEach(() => {
  patches = []
  conflictOnce = false
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const u = String(url)
      if (init?.method === "PATCH") {
        patches.push(JSON.parse(String(init.body)))
        if (conflictOnce) {
          conflictOnce = false
          return jsonResponse({ error: "stale", code: "VERSION_CONFLICT", current: { ...PBI, epic: "Theirs", version: 4 } }, 409)
        }
        return jsonResponse({ ok: true })
      }
      if (u.endsWith("/icebox")) return jsonResponse({ unreviewed: [], reviewed: [] })
      if (u.endsWith("/goals")) return jsonResponse([])
      if (u.endsWith("/projects/p1")) return jsonResponse({ pointUnit: "SP" })
      if (u.includes("/comments/counts")) return jsonResponse({ counts: {} })
      if (u.includes("/comments")) return jsonResponse({ items: [], nextCursor: null })
      if (u.includes("/members")) return jsonResponse([])
      if (u.includes("/activity")) return jsonResponse({ items: [], nextCursor: null })
      return jsonResponse(PBI)
    }),
  )
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  window.history.replaceState(null, "", "/")
})

function renderModal(props: Partial<React.ComponentProps<typeof PbiDetailModal>> = {}) {
  const onClose = vi.fn()
  renderWithProviders(<PbiDetailModal projectId="p1" pbiId="pbi-1" onClose={onClose} {...props} />)
  return { onClose }
}

async function editEpic(text: string) {
  await userEvent.click(await screen.findByRole("button", { name: t.edit }))
  const epic = await screen.findByLabelText(pt.backlogEpic, { selector: "input" })
  await userEvent.clear(epic)
  await userEvent.type(epic, text)
  return epic
}

describe("PbiDetailModal — browser Back while editing (F-02)", () => {
  it("asks with the unsaved-changes confirm; cancelling keeps the modal, its URL and the edits", async () => {
    window.history.replaceState(null, "", "/projects/p1/backlog?pbi=12")
    const back = vi.spyOn(window.history, "back")
    const { onClose } = renderModal({ editable: true })
    const epic = await editEpic("Mine")
    act(() => {
      window.history.replaceState(null, "", "/projects/p1/backlog")
      window.dispatchEvent(new PopStateEvent("popstate"))
    })
    const alert = await screen.findByRole("alertdialog")
    expect(window.location.search).toBe("?pbi=12")
    await userEvent.click(within(alert).getByRole("button", { name: t.cancel }))
    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument())
    expect(epic).toHaveValue("Mine")
    expect(back).not.toHaveBeenCalled()
    expect(onClose).not.toHaveBeenCalled()
  })

  it("discarding goes back for real", async () => {
    window.history.replaceState(null, "", "/projects/p1/backlog?pbi=12")
    const back = vi.spyOn(window.history, "back").mockImplementation(() => {})
    renderModal({ editable: true })
    await editEpic("Mine")
    act(() => {
      window.history.replaceState(null, "", "/projects/p1/backlog")
      window.dispatchEvent(new PopStateEvent("popstate"))
    })
    const alert = await screen.findByRole("alertdialog")
    await userEvent.click(within(alert).getByRole("button", { name: /discard/i }))
    await waitFor(() => expect(back).toHaveBeenCalledTimes(1))
  })
})

describe("PbiDetailModal — tabs and permissions", () => {
  it("initialTab=comments opens on the Comments tab (F-05)", async () => {
    renderModal({ initialTab: "comments" })
    const tab = await screen.findByRole("tab", { name: new RegExp(t.commentsTitle) })
    expect(tab).toHaveAttribute("aria-selected", "true")
    expect(screen.getByRole("tab", { name: t.commentsTabDetails })).toHaveAttribute("aria-selected", "false")
  })

  it("hides INVEST without ai.use (F-07)", async () => {
    renderModal({ canInvest: false })
    await screen.findByRole("button", { name: t.backlogCopyLink })
    expect(screen.queryByRole("button", { name: new RegExp(t.aiInvestReview) })).not.toBeInTheDocument()
  })
})

describe("PbiDetailModal — version conflict", () => {
  it("'Restore my input' puts the lost value back over the latest version", async () => {
    conflictOnce = true
    renderModal({ editable: true })
    await editEpic("Mine")
    await userEvent.click(screen.getByRole("button", { name: t.update }))
    expect(await screen.findByDisplayValue("Theirs")).toBeInTheDocument()
    await userEvent.click(screen.getByRole("button", { name: t.apiErrVersionConflictRestore }))
    expect(screen.getByLabelText(pt.backlogEpic, { selector: "input" })).toHaveValue("Mine")
    expect(screen.queryByText(t.apiErrVersionConflictReenter)).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole("button", { name: t.update }))
    await waitFor(() => expect(patches).toEqual([{ epic: "Mine", version: 3 }, { epic: "Mine", version: 4 }]))
  })
})
