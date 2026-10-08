import { beforeEach, describe, expect, it, vi } from "vitest"
import { screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { renderWithProviders, tr } from "@/app/__tests__/test-utils"
import { stubLayout } from "@/components/__tests__/helpers"
import { resetUrl } from "@/app/projects/[projectId]/backlog/__tests__/nav-mock"
import type { Language } from "@/lib/i18n"
import { PlanContent } from "../plan-content"
import { BASE, bodyOf, callsTo, freshState, planServer, stubMatchMedia, type ServerState } from "./plan-server"
import { installMemoryStorage } from "./fixtures"

vi.mock("next/navigation", async () => (await import("@/app/projects/[projectId]/backlog/__tests__/nav-mock")).navigationModule({ projectId: "p1" }))

stubLayout()
const t = tr("en")
let state: ServerState
const lbl = (s: string) => new RegExp(s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))

async function renderPlan(canEdit = true, language: Language = "en") {
  const fetchMock = planServer(state)
  renderWithProviders(<PlanContent projectId="p1" canEdit={canEdit} />, { language })
  await screen.findByTitle(language === "en" ? "Alpha" : "Alpha")
  return fetchMock
}

async function openMenu(user: ReturnType<typeof userEvent.setup>, name: string, item: string) {
  await user.click(screen.getByRole("button", { name: t.planMenuLabel.replace("{name}", name) }))
  await user.click(screen.getByRole("menuitem", { name: item }))
}

async function openEditor(user: ReturnType<typeof userEvent.setup>, name: string) {
  await openMenu(user, name, t.planMenuEdit)
  return screen.findByRole("dialog", { name: t.planEditTitle })
}

beforeEach(() => {
  state = freshState()
  installMemoryStorage()
  stubMatchMedia(false)
  resetUrl("/projects/p1/plan")
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => setTimeout(() => cb(0), 0))
})

describe("draft create flow", () => {
  it("opens a draft without POSTing; cancel discards, save validates then creates", async () => {
    const user = userEvent.setup()
    const fetchMock = await renderPlan()
    await user.click(screen.getByRole("button", { name: t.planAddItem }))
    let dialog = await screen.findByRole("dialog", { name: t.planNewItemTitle })
    // The calendar opens after the last top-level item (Launch ends 2026-10-25), not on today.
    expect(within(dialog).getByLabelText(lbl(t.planPlannedStart))).toHaveValue("2026-10-26")
    expect(within(dialog).getByLabelText(lbl(t.planPlannedEnd))).toHaveValue("2026-11-01")
    expect(within(dialog).getByText(t.planLinkAfterCreate)).toBeInTheDocument()
    await user.click(within(dialog).getByRole("button", { name: t.cancel }))
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument())
    expect(callsTo(fetchMock, "POST", BASE)).toHaveLength(0)

    await user.click(screen.getByRole("button", { name: t.planAddItem }))
    dialog = await screen.findByRole("dialog", { name: t.planNewItemTitle })
    await user.click(within(dialog).getByRole("button", { name: t.save }))
    expect(within(dialog).getByText(t.planNameRequired)).toBeInTheDocument()
    expect(callsTo(fetchMock, "POST", BASE)).toHaveLength(0)
    await user.type(within(dialog).getByLabelText(lbl(t.planNamePlaceholder)), "Design")
    await user.click(within(dialog).getByRole("button", { name: t.save }))
    await waitFor(() => expect(callsTo(fetchMock, "POST", BASE)).toHaveLength(1))
    expect(bodyOf(callsTo(fetchMock, "POST", BASE)[0])).toMatchObject({ name: "Design", parentId: null, plannedStart: "2026-10-26", plannedEnd: "2026-11-01", isMilestone: false })
    expect(await screen.findByText(t.planCreated)).toBeInTheDocument()
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument())
  })

  it("milestone draft defaults to the day after the plan so far, with a single date", async () => {
    const user = userEvent.setup()
    const fetchMock = await renderPlan()
    await user.click(screen.getByRole("button", { name: t.planAddMilestone }))
    const dialog = await screen.findByRole("dialog", { name: t.planNewMilestoneTitle })
    expect(within(dialog).getByLabelText(lbl(t.planMilestoneDate))).toHaveValue("2026-10-26")
    expect(within(dialog).queryByLabelText(lbl(t.planPlannedEnd))).not.toBeInTheDocument()
    await user.type(within(dialog).getByLabelText(lbl(t.planNamePlaceholder)), "Go-live")
    await user.click(within(dialog).getByRole("button", { name: t.save }))
    await waitFor(() => expect(callsTo(fetchMock, "POST", BASE)).toHaveLength(1))
    expect(bodyOf(callsTo(fetchMock, "POST", BASE)[0])).toMatchObject({ isMilestone: true, plannedStart: "2026-10-26", plannedEnd: "2026-10-26" })
  })

  it("add child from the row menu posts the parent id", async () => {
    const user = userEvent.setup()
    const fetchMock = await renderPlan()
    await openMenu(user, "Beta", t.planAddChild)
    const dialog = await screen.findByRole("dialog", { name: t.planNewItemTitle })
    await user.type(within(dialog).getByLabelText(lbl(t.planNamePlaceholder)), "Child")
    await user.click(within(dialog).getByRole("button", { name: t.save }))
    await waitFor(() => expect(callsTo(fetchMock, "POST", BASE)).toHaveLength(1))
    expect(bodyOf(callsTo(fetchMock, "POST", BASE)[0])).toMatchObject({ parentId: "B" })
  })
})

describe("editor: derived fields, save, conflicts", () => {
  it("parent items show dates / progress / status read-only", async () => {
    const user = userEvent.setup()
    await renderPlan()
    const dialog = await openEditor(user, "Alpha")
    expect(within(dialog).getByText(t.planDerivedParentHint)).toBeInTheDocument()
    expect(within(dialog).queryByLabelText(lbl(t.planPlannedStart))).not.toBeInTheDocument()
    expect(within(dialog).queryByLabelText(t.planStatus)).not.toBeInTheDocument()
    expect(within(dialog).getAllByText(t.planDerivedAuto).length).toBeGreaterThanOrEqual(4)
    expect(within(dialog).getByText(t.planLinkLeafOnly)).toBeInTheDocument()
  })

  it("linked leaves: status/progress read-only, dates editable; manual leaves exclude 'delayed'", async () => {
    const user = userEvent.setup()
    await renderPlan()
    let dialog = await openEditor(user, "Alpha-2")
    expect(within(dialog).getByText(t.planDerivedLinkedHint)).toBeInTheDocument()
    expect(within(dialog).queryByLabelText(t.planStatus)).not.toBeInTheDocument()
    expect(within(dialog).getByLabelText(lbl(t.planPlannedStart))).toBeEnabled()
    await user.click(within(dialog).getByRole("button", { name: t.cancel }))
    dialog = await openEditor(user, "Alpha-1")
    const options = within(within(dialog).getByLabelText(t.planStatus)).getAllByRole("option").map((o) => (o as HTMLOptionElement).value)
    expect(options).toEqual(["not_started", "in_progress", "done", "on_hold"])
  })

  it("saves changed fields with the version and toasts; a 409 is explained in the dialog only (N-05: no duplicate toast)", async () => {
    const user = userEvent.setup()
    const fetchMock = await renderPlan()
    let dialog = await openEditor(user, "Alpha-1")
    await user.selectOptions(within(dialog).getByLabelText(t.planStatus), "done")
    await user.type(within(dialog).getByLabelText(t.planDescription), "Hello")
    await user.click(within(dialog).getByRole("button", { name: t.save }))
    await waitFor(() => expect(callsTo(fetchMock, "PATCH", `${BASE}/A1`)).toHaveLength(1))
    expect(bodyOf(callsTo(fetchMock, "PATCH", `${BASE}/A1`)[0])).toEqual({ status: "done", description: "Hello", version: 1 })
    expect(await screen.findByText(t.planSavedJustNow)).toBeInTheDocument()

    state.fail.conflict = true
    dialog = await openEditor(user, "Beta")
    await user.type(within(dialog).getByLabelText(lbl(t.planNamePlaceholder)), "!")
    // meanwhile another user renamed it (server version 2)
    state.items = state.items.map((i) => (i.id === "B" ? { ...i, name: "Beta by Suzuki", version: 2 } : i))
    await user.click(within(dialog).getByRole("button", { name: t.save }))
    expect(await within(dialog).findByRole("alert")).toHaveTextContent(t.apiErrVersionConflictReenter)
    expect(screen.queryByText(t.apiErrVersionConflict)).not.toBeInTheDocument()
    expect(screen.getByRole("dialog", { name: t.planEditTitle })).toBeInTheDocument()
  })

  it("F-03: after a 409 the editor shows the server copy; a second Save never overwrites silently", async () => {
    const user = userEvent.setup()
    const fetchMock = await renderPlan()
    state.fail.conflict = true
    const dialog = await openEditor(user, "Beta")
    const name = within(dialog).getByLabelText(lbl(t.planNamePlaceholder))
    await user.type(name, " (stale)")
    state.items = state.items.map((i) => (i.id === "B" ? { ...i, name: "Beta by Suzuki", version: 2 } : i))
    await user.click(within(dialog).getByRole("button", { name: t.save }))
    const notice = await within(dialog).findByRole("alert")
    expect(notice).toHaveTextContent(t.apiErrVersionConflictReenter)
    // the unsaved input is listed so it can be re-entered
    expect(notice).toHaveTextContent("Beta (stale)")
    expect(name).toHaveValue("Beta by Suzuki")
    state.fail.conflict = false
    // saving the reloaded form unchanged sends nothing (the other user's edit is kept)
    await user.click(within(dialog).getByRole("button", { name: t.save }))
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument())
    expect(callsTo(fetchMock, "PATCH", `${BASE}/B`)).toHaveLength(1)
  })

  it("F-03: an edit made after the conflict is sent with the server's new version", async () => {
    const user = userEvent.setup()
    const fetchMock = await renderPlan()
    state.fail.conflict = true
    const dialog = await openEditor(user, "Beta")
    await user.type(within(dialog).getByLabelText(t.planDescription), "mine")
    state.items = state.items.map((i) => (i.id === "B" ? { ...i, description: "theirs", version: 2 } : i))
    await user.click(within(dialog).getByRole("button", { name: t.save }))
    const description = await within(dialog).findByDisplayValue("theirs")
    state.fail.conflict = false
    await user.type(description, " + mine")
    await user.click(within(dialog).getByRole("button", { name: t.save }))
    await waitFor(() => expect(callsTo(fetchMock, "PATCH", `${BASE}/B`)).toHaveLength(2))
    expect(bodyOf(callsTo(fetchMock, "PATCH", `${BASE}/B`)[1])).toEqual({ description: "theirs + mine", version: 2 })
  })

  it("F-03: 'restore my input' puts the lost values back on top of the new version", async () => {
    const user = userEvent.setup()
    const fetchMock = await renderPlan()
    state.fail.conflict = true
    const dialog = await openEditor(user, "Beta")
    await user.type(within(dialog).getByLabelText(t.planDescription), "mine")
    state.items = state.items.map((i) => (i.id === "B" ? { ...i, description: "theirs", version: 2 } : i))
    await user.click(within(dialog).getByRole("button", { name: t.save }))
    await user.click(await within(dialog).findByRole("button", { name: t.apiErrVersionConflictRestore }))
    expect(within(dialog).getByLabelText(t.planDescription)).toHaveValue("mine")
    expect(within(dialog).queryByRole("alert")).not.toBeInTheDocument()
    state.fail.conflict = false
    await user.click(within(dialog).getByRole("button", { name: t.save }))
    await waitFor(() => expect(callsTo(fetchMock, "PATCH", `${BASE}/B`)).toHaveLength(2))
    expect(bodyOf(callsTo(fetchMock, "PATCH", `${BASE}/B`)[1])).toEqual({ description: "mine", version: 2 })
  })
})

describe("delete with undo", () => {
  it("confirms with the descendant count, deletes with version, and Undo restores", async () => {
    const user = userEvent.setup()
    const fetchMock = await renderPlan()
    await openMenu(user, "Alpha", t.delete)
    const confirm = await screen.findByRole("alertdialog", { name: t.planConfirmDelete.replace("{name}", "Alpha") })
    expect(within(confirm).getByText(lbl(t.planConfirmDeleteDescendants.replace("{count}", "2")))).toBeInTheDocument()
    await user.click(within(confirm).getByRole("button", { name: t.delete }))
    await waitFor(() => expect(callsTo(fetchMock, "DELETE", `${BASE}/A?version=1`)).toHaveLength(1))
    const toastText = t.planDeleted.replace("{name}", "Alpha").replace("{count}", "3")
    expect(await screen.findByText(toastText)).toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: t.planUndo }))
    await waitFor(() => expect(callsTo(fetchMock, "POST", "/api/projects/p1/trash/plan_item/A/restore")).toHaveLength(1))
    expect(await screen.findByText(t.planRestored)).toBeInTheDocument()
  })

  it("cancelling the confirm keeps the item", async () => {
    const user = userEvent.setup()
    const fetchMock = await renderPlan()
    await openMenu(user, "Beta", t.delete)
    await user.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: t.cancel }))
    expect(callsTo(fetchMock, "DELETE", /plan\/B/)).toHaveLength(0)
  })
})

describe("PBI linking", () => {
  it("shows linked PBIs, warns when a PBI moves from another item and PUTs the selection", async () => {
    const user = userEvent.setup()
    const fetchMock = await renderPlan()
    await openMenu(user, "Alpha-2", t.planLinkPbis)
    const dialog = await screen.findByRole("dialog", { name: t.planEditTitle })
    const section = within(dialog).getByRole("region", { name: lbl(t.planLinkSection) })
    // Chosen row and search result both carry the title as tooltip (A4-05).
    expect((await within(section).findAllByText("Login form", { selector: "span[title]" }))[0]).toBeInTheDocument()
    expect(within(section).getByRole("link", { name: t.planLinkOpenBacklog })).toHaveAttribute("href", "/projects/p1/backlog?plan=A2")
    await user.type(within(section).getByRole("searchbox", { name: t.planLinkSearch }), "sign")
    const signup = await within(section).findByRole("checkbox", { name: /Signup/ })
    expect(within(section).getByText(t.planLinkMoveWarning.replace("{name}", "Beta"))).toBeInTheDocument()
    await user.click(signup)
    expect(within(section).getByText(t.planLinkMoveSummary.replace("{count}", "1"))).toBeInTheDocument()
    await user.click(within(dialog).getByRole("button", { name: t.save }))
    await waitFor(() => expect(callsTo(fetchMock, "PUT", `${BASE}/A2/links`)).toHaveLength(1))
    expect(bodyOf(callsTo(fetchMock, "PUT", `${BASE}/A2/links`)[0])).toEqual({ pbiIds: ["pb1", "pb2"] })
    expect(callsTo(fetchMock, "PATCH", `${BASE}/A2`)).toHaveLength(0)
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument())
  })
})

describe("dependencies and baseline", () => {
  it("lists dependencies with violations and removes one", async () => {
    const user = userEvent.setup()
    const fetchMock = await renderPlan()
    const dialog = await openEditor(user, "Alpha-2")
    const section = within(dialog).getByRole("region", { name: t.planDependencies })
    expect(within(section).getByText("Alpha-1")).toBeInTheDocument()
    expect(within(section).getByText(t.planDependencyViolated)).toBeInTheDocument()
    await user.click(within(section).getByRole("button", { name: t.planDependencyRemove.replace("{name}", "Beta") }))
    await waitFor(() => expect(callsTo(fetchMock, "DELETE", `${BASE}/dependencies/d2`)).toHaveLength(1))
  })

  it("adds a successor from the row menu", async () => {
    const user = userEvent.setup()
    const fetchMock = await renderPlan()
    await openMenu(user, "Alpha-1", t.planAddSuccessor)
    const picker = await screen.findByRole("dialog", { name: t.planPickSuccessorTitle })
    // existing successor (Alpha-2) and the parent (Alpha) are listed but disabled with the reason; itself is not listed
    expect(within(picker).getByRole("button", { name: /Alpha-2/ })).toBeDisabled()
    expect(within(picker).getByRole("button", { name: /Alpha-2/ })).toHaveTextContent(t.planSuccessorBlockedExisting)
    expect(within(picker).getByRole("button", { name: /^Alpha / })).toHaveTextContent(t.planSuccessorBlockedHierarchy)
    expect(within(picker).queryByRole("button", { name: /Alpha-1/ })).not.toBeInTheDocument()
    await user.click(within(picker).getByRole("button", { name: /Launch/ }))
    await waitFor(() => expect(callsTo(fetchMock, "POST", `${BASE}/dependencies`)).toHaveLength(1))
    expect(bodyOf(callsTo(fetchMock, "POST", `${BASE}/dependencies`)[0])).toEqual({ predecessorId: "A1", successorId: "M" })
  })

  it("F-11: items upstream of the predecessor are disabled as a cycle", async () => {
    const user = userEvent.setup()
    const fetchMock = await renderPlan()
    await openMenu(user, "Alpha-2", t.planAddSuccessor)
    const picker = await screen.findByRole("dialog", { name: t.planPickSuccessorTitle })
    // A1 → A2 and B → A2 exist: A2 → A1 / A2 → B would close a loop
    for (const name of [/Alpha-1/, /Beta/]) {
      const option = within(picker).getByRole("button", { name })
      expect(option).toBeDisabled()
      expect(option).toHaveTextContent(t.planSuccessorBlockedCycle)
    }
    await user.click(within(picker).getByRole("button", { name: /Beta/ }))
    expect(callsTo(fetchMock, "POST", `${BASE}/dependencies`)).toHaveLength(0)
    expect(within(picker).getByRole("button", { name: /Launch/ })).toBeEnabled()
  })

  it("saving the baseline asks first", async () => {
    const user = userEvent.setup()
    const fetchMock = await renderPlan()
    await user.click(screen.getByRole("button", { name: t.planMoreActions }))
    await user.click(screen.getByRole("menuitem", { name: t.planBaselineSave }))
    await user.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: t.planBaselineSave }))
    await waitFor(() => expect(callsTo(fetchMock, "POST", `${BASE}/baseline`)).toHaveLength(1))
    expect(await screen.findByText(t.planBaselineSaved)).toBeInTheDocument()
  })
})

describe("URL state and permissions", () => {
  it("?item= selects the item and opens its editor, then drops the param", async () => {
    resetUrl("/projects/p1/plan?item=B&zoom=day")
    await renderPlan()
    expect(await screen.findByRole("dialog", { name: t.planEditTitle })).toBeInTheDocument()
    expect(document.querySelector('[data-plan-row="B"]')).toHaveAttribute("data-selected", "true")
    expect(window.location.search).toBe("?zoom=day")
    expect(within(screen.getByRole("group", { name: t.planZoomLabel })).getByRole("button", { name: t.planZoomDay })).toHaveAttribute("aria-pressed", "true")
  })

  it("unknown ?item= toasts; zoom changes update the URL", async () => {
    resetUrl("/projects/p1/plan?item=nope")
    const user = userEvent.setup()
    await renderPlan()
    expect(await screen.findByText(t.planItemNotFound)).toBeInTheDocument()
    await user.click(within(screen.getByRole("group", { name: t.planZoomLabel })).getByRole("button", { name: t.planZoomQuarter }))
    expect(window.location.search).toBe("?zoom=quarter")
    await user.click(within(screen.getByRole("group", { name: t.planZoomLabel })).getByRole("button", { name: t.planZoomWeek }))
    expect(window.location.search).toBe("")
  })

  it("read-only users get no add actions, handles or save", async () => {
    const user = userEvent.setup()
    await renderPlan(false)
    expect(screen.queryByRole("button", { name: t.planAddItem })).not.toBeInTheDocument()
    expect(document.querySelector("[data-plan-handle]")).toBeNull()
    // A3-19: read-only viewers "view" the details, not "edit" them; no glossary-syntax hint.
    await openMenu(user, "Beta", t.planMenuView)
    const dialog = await screen.findByRole("dialog", { name: t.planViewTitle })
    expect(within(dialog).queryByRole("button", { name: t.save })).not.toBeInTheDocument()
    expect(within(dialog).queryByRole("button", { name: t.delete })).not.toBeInTheDocument()
    expect(within(dialog).getAllByRole("button", { name: t.close }).length).toBeGreaterThan(0)
    expect(within(dialog).queryByText(t.glossaryHint)).not.toBeInTheDocument()
  })

  it.each(["ja", "id"] as const)("renders in %s", async (lang) => {
    const tl = tr(lang)
    await renderPlan(true, lang)
    expect(screen.getByRole("heading", { name: tl.planTitle })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: tl.planTodayJump })).toBeInTheDocument()
    expect(screen.getByRole("region", { name: tl.planLegendLabel })).toBeInTheDocument()
  })
})
