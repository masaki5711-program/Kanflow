import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { getTranslations } from "@/lib/i18n"
import { getProjectTypeLabels } from "@/lib/project-type-labels"
import type { PbiFormOptions } from "@/components/pbi-form/use-pbi-form-options"
import { jsonResponse, renderWithProviders, stubLayout } from "./__tests__/helpers"

const { PbiCreateModal } = await import("./pbi-create-modal")

stubLayout()

const t = getTranslations("en")
const pt = getProjectTypeLabels("software", "en")

const OPTIONS: PbiFormOptions = {
  iceboxOptions: [
    { id: "ib1", displayId: 11, request: "Icebox request one", author: "Ann" },
    { id: "ib2", displayId: 12, request: "Used request", author: "Bob" },
  ],
  goals: [{ id: "g1", title: "Goal one" }],
  pointUnit: "SP",
  iceboxUsage: new Map([["ib2", { pbiId: "other", displayId: 1, label: "Uses ib2" }]]),
}

let posted: unknown[] = []
let postStatus = 201

beforeEach(() => {
  posted = []
  postStatus = 201
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.method === "POST") {
        posted.push(JSON.parse(String(init.body)))
        return postStatus === 201 ? jsonResponse({ id: "new", displayId: 42 }, 201) : jsonResponse({ error: "bad" }, postStatus)
      }
      return jsonResponse({})
    }),
  )
})
afterEach(() => vi.unstubAllGlobals())

function renderCreate(props: Partial<React.ComponentProps<typeof PbiCreateModal>> = {}) {
  const onClose = vi.fn()
  const onCreated = vi.fn()
  renderWithProviders(<PbiCreateModal projectId="p1" onClose={onClose} onCreated={onCreated} formOptions={OPTIONS} {...props} />)
  return { onClose, onCreated }
}

describe("PbiCreateModal", () => {
  it("creates a PBI with the picked IceBox request, goal and points", async () => {
    const { onClose, onCreated } = renderCreate()
    const dialog = screen.getByRole("dialog", { name: t.backlogAddItem })
    const [iceboxSelect, goalSelect] = within(dialog).getAllByRole("combobox")
    await userEvent.selectOptions(goalSelect, "g1")
    await userEvent.selectOptions(iceboxSelect, "ib1")
    await userEvent.click(within(within(dialog).getByRole("group", { name: t.backlogWorkloadQuickPick.replace("{label}", pt.backlogWorkloadScore) })).getByRole("button", { name: "5" }))
    await userEvent.click(screen.getByRole("button", { name: t.add }))
    await waitFor(() => expect(onCreated).toHaveBeenCalledWith({ id: "new", displayId: 42 }))
    expect(onClose).toHaveBeenCalled()
    expect(posted).toEqual([
      { userStory: "Icebox request one", iceboxItemId: "ib1", productGoalId: "g1", workloadScore: 5, status: "not_ready" },
    ])
    expect(await screen.findByText(t.backlogCreatedToast.replace("{id}", "42"))).toBeInTheDocument()
  })

  it("stays open and toasts when saving fails", async () => {
    postStatus = 422
    const { onClose } = renderCreate()
    await userEvent.type(screen.getByLabelText(pt.backlogInitiative, { selector: "input" }), "Login")
    await userEvent.click(screen.getByRole("button", { name: t.add }))
    expect(await screen.findByText(new RegExp(t.backlogSaveFailed))).toBeInTheDocument()
    expect(onClose).not.toHaveBeenCalled()
  })

  it("keeps Add disabled until an initiative or a user story is entered (F-01)", async () => {
    renderCreate()
    const add = screen.getByRole("button", { name: t.add })
    const message = t.backlogContentRequired.replace("{story}", pt.backlogUserStory).replace("{initiative}", pt.backlogInitiative)
    expect(add).toBeDisabled()
    expect(add).toHaveAccessibleDescription(message)
    // Started filling in other fields only: inline error on the user story.
    await userEvent.type(screen.getByLabelText(pt.backlogEpic, { selector: "input" }), "Auth")
    expect(screen.getByText(message)).toHaveAttribute("role", "alert")
    expect(screen.getByLabelText(pt.backlogUserStory)).toHaveAttribute("aria-invalid", "true")
    expect(add).toBeDisabled()
    // Whitespace does not count.
    await userEvent.type(screen.getByLabelText(pt.backlogUserStory), "   ")
    expect(add).toBeDisabled()
    await userEvent.type(screen.getByLabelText(pt.backlogUserStory), "As a user")
    expect(add).toBeEnabled()
    expect(screen.queryByText(message)).not.toBeInTheDocument()
    await userEvent.click(add)
    await waitFor(() => expect(posted).toHaveLength(1))
  })

  it("names the help buttons and the two AI buttons after their fields (F-13)", () => {
    renderCreate()
    expect(screen.getByRole("button", { name: t.backlogHelpAbout.replace("{field}", pt.backlogInitiative) })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: t.backlogHelpAbout.replace("{field}", pt.backlogEpic) })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: `${t.aiGenerate} (${pt.backlogUserStory})` })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: `${t.aiGenerate} (${pt.backlogAcceptanceCriteria})` })).toBeInTheDocument()
  })

  it("closes without asking when nothing was entered", async () => {
    const first = renderCreate()
    await userEvent.click(screen.getByRole("button", { name: t.cancel }))
    expect(first.onClose).toHaveBeenCalled()
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument()
  })

  it("a pre-filled draft counts as unsaved (Cancel asks)", async () => {
    const { onClose } = renderCreate({ initialForm: { initiative: "From IceBox draft" } })
    expect(screen.getByLabelText(pt.backlogInitiative, { selector: "input" })).toHaveValue("From IceBox draft")
    await userEvent.click(screen.getByRole("button", { name: t.cancel }))
    const alert = await screen.findByRole("alertdialog")
    await userEvent.click(within(alert).getByRole("button", { name: "Cancel" }))
    expect(onClose).not.toHaveBeenCalled()
  })

  it("warns before reusing an IceBox request already referenced by another PBI", async () => {
    renderCreate()
    const iceboxSelect = screen.getAllByRole("combobox")[0]
    expect(within(iceboxSelect).getByRole("option", { name: /#12/ })).toHaveTextContent(t.backlogIceboxAlreadyUsedTag)

    await userEvent.selectOptions(iceboxSelect, "ib2")
    let dialog = await screen.findByRole("alertdialog")
    expect(dialog).toHaveTextContent("#1 Uses ib2")
    await userEvent.click(within(dialog).getByRole("button", { name: t.cancel }))
    expect(iceboxSelect).toHaveValue("")

    await userEvent.selectOptions(iceboxSelect, "ib2")
    dialog = await screen.findByRole("alertdialog")
    await userEvent.click(within(dialog).getByRole("button", { name: t.backlogIceboxReuseAnyway }))
    expect(iceboxSelect).toHaveValue("ib2")
    expect(screen.getAllByRole("status").some((s) => s.textContent?.includes(t.backlogIceboxAlreadyUsedTitle))).toBe(true)
  })

  it("fetches the form choices when the caller has none", async () => {
    const urls: string[] = []
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        urls.push(String(url))
        if (String(url).endsWith("/icebox")) return jsonResponse({ unreviewed: [], reviewed: [] })
        if (String(url).endsWith("/goals")) return jsonResponse([{ id: "gx", title: "Fetched goal" }])
        return jsonResponse({ pointUnit: "SP" })
      }),
    )
    renderCreate({ formOptions: undefined })
    expect(await screen.findByRole("option", { name: "Fetched goal" })).toBeInTheDocument()
    expect(urls.sort()).toEqual(["/api/projects/p1", "/api/projects/p1/goals", "/api/projects/p1/icebox"])
  })
})
