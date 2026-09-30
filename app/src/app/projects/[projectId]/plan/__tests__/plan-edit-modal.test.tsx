import { describe, expect, it, vi } from "vitest"
import { screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { renderWithProviders, tr } from "@/app/__tests__/test-utils"
import { stubLayout } from "@/components/__tests__/helpers"
import { getUiLabels } from "@/components/ui"
import PlanEditModal from "../plan-edit-modal"
import type { PlanItem } from "../lib/plan-utils"

stubLayout()
const t = tr("en")
const ui = getUiLabels("en")
const lbl = (s: string) => new RegExp(s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))

const item: PlanItem = {
  id: "i1", projectId: "p1", parentId: "root", name: "Design", description: null,
  plannedStart: new Date(2026, 2, 10, 12).toISOString(), plannedEnd: new Date(2026, 2, 20, 12).toISOString(),
  actualStart: new Date(2026, 2, 11, 12).toISOString(), actualEnd: null, progressPct: 30, color: null,
  status: "in_progress", sortOrder: 0, isMilestone: false, notes: "memo",
}
const parents = [
  { id: "root", name: "Root", depth: 0 },
  { id: "i1", name: "Design", depth: 1 },
  { id: "other", name: "Other", depth: 1 },
]

function setup(overrides: Partial<React.ComponentProps<typeof PlanEditModal>> = {}) {
  const props = {
    item,
    parentOptions: parents,
    readOnly: false,
    onClose: vi.fn(),
    onSave: vi.fn(async () => true),
    onDelete: vi.fn(async () => true),
    ...overrides,
  }
  renderWithProviders(<PlanEditModal {...props} />, { language: "en" })
  return props
}

describe("PlanEditModal", () => {
  it("prefills the form and excludes the item itself from parent options", () => {
    setup()
    const dialog = screen.getByRole("dialog", { name: t.planEditTitle })
    expect(within(dialog).getByLabelText(lbl(t.planNamePlaceholder))).toHaveValue("Design")
    expect(within(dialog).getByLabelText(lbl(t.planPlannedStart))).toHaveValue("2026-03-10")
    expect(within(dialog).getByLabelText(lbl(t.planActualStart))).toHaveValue("2026-03-11")
    expect(within(dialog).getByLabelText(t.planStatus)).toHaveValue("in_progress")
    const parent = within(dialog).getByLabelText(t.planParent)
    expect(parent).toHaveValue("root")
    const optionValues = within(parent).getAllByRole("option").map((o) => (o as HTMLOptionElement).value)
    expect(optionValues).toEqual(["", "root", "other"])
  })

  it("submits a normalised patch and closes on success", async () => {
    const user = userEvent.setup()
    const props = setup()
    const name = screen.getByLabelText(lbl(t.planNamePlaceholder))
    await user.clear(name)
    await user.type(name, "Build")
    await user.selectOptions(screen.getByLabelText(t.planStatus), "done")
    await user.selectOptions(screen.getByLabelText(t.planParent), "")
    await user.clear(screen.getByLabelText(t.planNotes))
    await user.click(screen.getByLabelText(t.planIsMilestone))
    await user.click(screen.getByRole("button", { name: t.update }))

    await waitFor(() => expect(props.onClose).toHaveBeenCalled())
    expect(props.onSave).toHaveBeenCalledWith({
      name: "Build",
      description: null,
      plannedStart: "2026-03-10",
      plannedEnd: "2026-03-20",
      actualStart: "2026-03-11",
      actualEnd: null,
      status: "done",
      parentId: null,
      isMilestone: true,
      notes: null,
    })
  })

  it("stays open when saving fails", async () => {
    const user = userEvent.setup()
    const props = setup({ onSave: vi.fn(async () => false) })
    await user.click(screen.getByRole("button", { name: t.update }))
    await waitFor(() => expect(props.onSave).toHaveBeenCalled())
    expect(props.onClose).not.toHaveBeenCalled()
    expect(screen.getByRole("dialog")).toBeInTheDocument()
  })

  it("closes immediately when nothing changed", async () => {
    const user = userEvent.setup()
    const props = setup()
    await user.click(screen.getByRole("button", { name: t.cancel }))
    expect(props.onClose).toHaveBeenCalled()
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument()
  })

  it("asks before discarding unsaved changes", async () => {
    const user = userEvent.setup()
    const props = setup()
    await user.type(screen.getByLabelText(lbl(t.planNamePlaceholder)), "!")
    await user.click(screen.getByRole("button", { name: t.cancel }))

    const guard = await screen.findByRole("alertdialog", { name: ui.unsavedTitle })
    await user.click(within(guard).getByRole("button", { name: ui.cancel }))
    expect(props.onClose).not.toHaveBeenCalled()

    await user.click(screen.getByRole("button", { name: t.cancel }))
    await user.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: ui.discard }))
    await waitFor(() => expect(props.onClose).toHaveBeenCalled())
  })

  it("confirms before deleting; cancel keeps the item", async () => {
    const user = userEvent.setup()
    const props = setup()
    await user.click(screen.getByRole("button", { name: t.delete }))
    let dlg = await screen.findByRole("alertdialog", { name: t.planConfirmDelete })
    await user.click(within(dlg).getByRole("button", { name: t.cancel }))
    expect(props.onDelete).not.toHaveBeenCalled()

    await user.click(screen.getByRole("button", { name: t.delete }))
    dlg = await screen.findByRole("alertdialog", { name: t.planConfirmDelete })
    await user.click(within(dlg).getByRole("button", { name: t.delete }))
    await waitFor(() => expect(props.onDelete).toHaveBeenCalled())
    expect(props.onClose).toHaveBeenCalled()
  })

  it("keeps the dialog open when delete fails", async () => {
    const user = userEvent.setup()
    const props = setup({ onDelete: vi.fn(async () => false) })
    await user.click(screen.getByRole("button", { name: t.delete }))
    await user.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: t.delete }))
    await waitFor(() => expect(props.onDelete).toHaveBeenCalled())
    expect(props.onClose).not.toHaveBeenCalled()
  })

  it("read-only: fields disabled, no save/delete, Close button", async () => {
    const user = userEvent.setup()
    const props = setup({ readOnly: true, onDelete: undefined })
    expect(screen.getByLabelText(lbl(t.planNamePlaceholder))).toBeDisabled()
    expect(screen.queryByRole("button", { name: t.update })).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: t.delete })).not.toBeInTheDocument()
    // Header X and footer "Close" share the label; the footer one is last.
    const closes = screen.getAllByRole("button", { name: t.close })
    await user.click(closes[closes.length - 1])
    expect(props.onClose).toHaveBeenCalled()
  })
})
