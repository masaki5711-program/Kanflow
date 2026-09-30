import { describe, expect, it, vi } from "vitest"
import { fireEvent, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { renderWithProviders, tr } from "@/app/__tests__/test-utils"
import { BacklogItemCard, type CardActions } from "../backlog-item-card"
import { pbi } from "./fixtures"

const t = tr("ja")

function makeActions(): CardActions {
  return {
    onOpen: vi.fn(),
    onStatusChange: vi.fn(),
    onDelete: vi.fn(),
    onInvest: vi.fn(),
    onToggleSelect: vi.fn(),
    onMoveToEdge: vi.fn(),
    onHandleKeyDown: vi.fn(),
    onHandlePointerDown: vi.fn(),
    onHandleBlur: vi.fn(),
  }
}

const PERMS = { canEdit: true, canReorder: true, canDelete: true, canInvest: true }
const STATE = { selectMode: false, isSelected: false, isDragging: false }

describe("BacklogItemCard", () => {
  it("shows epic, goal, icebox chips and a de-duplicated in-sprint badge", () => {
    const item = pbi("a", 1, {
      epic: "Payments",
      productGoal: { id: "g", title: "Grow revenue" },
      iceboxItem: { id: "ib", displayId: 3, request: "Customer asked" },
      userStory: null,
      sprintItems: [
        { sprint: { id: "s1", sprintName: "Sprint 1", status: "active" } },
        { sprint: { id: "s1", sprintName: "Sprint 1", status: "active" } },
        { sprint: { id: "s2", sprintName: "Sprint 2", status: "planning" } },
      ],
    })
    renderWithProviders(
      <ul>
        <BacklogItemCard item={item} section="ready" {...PERMS} {...STATE} {...makeActions()} />
      </ul>,
    )
    expect(screen.getByText(t.backlogInSprintBadge)).toBeInTheDocument()
    expect(screen.getByText("(Sprint 1, Sprint 2)")).toBeInTheDocument()
    expect(screen.getByText("Payments")).toBeInTheDocument()
    expect(screen.getByText("Grow revenue")).toBeInTheDocument()
    expect(screen.getByTitle(t.backlogIceboxChip.replace("{text}", "Customer asked"))).toBeInTheDocument()
    expect(screen.getAllByText(t.sprintNotEntered).length).toBeGreaterThan(0)
  })

  it("renders completed items without edit, drag or menu controls", () => {
    renderWithProviders(
      <ul>
        <BacklogItemCard item={pbi("c", 9, { status: "completed" })} section="completed" {...PERMS} {...STATE} {...makeActions()} />
      </ul>,
    )
    expect(screen.getByText(t.backlogStatusCompleted)).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: t.edit })).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: t.backlogDragHandle.replace("{id}", "9") })).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: t.backlogMoreActions.replace("{id}", "9") })).not.toBeInTheDocument()
  })

  it("opens the detail from the title (read) and the pencil (edit)", async () => {
    const actions = makeActions()
    const item = pbi("a", 1)
    renderWithProviders(
      <ul>
        <BacklogItemCard item={item} section="ready" {...PERMS} {...STATE} {...actions} />
      </ul>,
    )
    await userEvent.click(screen.getByRole("button", { name: "Initiative a" }))
    expect(actions.onOpen).toHaveBeenCalledWith(item, "read")
    await userEvent.click(screen.getByRole("button", { name: t.edit }))
    expect(actions.onOpen).toHaveBeenCalledWith(item, "edit")
  })

  it("hides reorder and delete controls without the PO rights (SM)", () => {
    renderWithProviders(
      <ul>
        <BacklogItemCard item={pbi("a", 1)} section="ready" canEdit canReorder={false} canDelete={false} canInvest {...STATE} {...makeActions()} />
      </ul>,
    )
    expect(screen.queryByRole("button", { name: t.backlogDragHandle.replace("{id}", "1") })).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: t.delete })).not.toBeInTheDocument()
    expect(screen.getByRole("button", { name: t.edit })).toBeInTheDocument()
  })

  it("wires the drag handle (keyboard, pointer, blur) with its help text", () => {
    const actions = makeActions()
    const item = pbi("a", 1)
    renderWithProviders(
      <ul>
        <BacklogItemCard item={item} section="ready" {...PERMS} {...STATE} isDragging {...actions} />
      </ul>,
    )
    const handle = screen.getByRole("button", { name: t.backlogDragHandle.replace("{id}", "1") })
    expect(handle).toHaveAttribute("aria-describedby", "backlog-dnd-help")
    expect(handle).toHaveAttribute("aria-pressed", "true")
    fireEvent.keyDown(handle, { key: " " })
    fireEvent.pointerDown(handle, { button: 0 })
    fireEvent.blur(handle)
    expect(actions.onHandleKeyDown).toHaveBeenCalledWith(expect.objectContaining({ key: " " }), item)
    expect(actions.onHandlePointerDown).toHaveBeenCalledWith(expect.anything(), item)
    expect(actions.onHandleBlur).toHaveBeenCalled()
  })

  it("menu offers move to top / bottom (keyboard operable, Esc closes)", async () => {
    const actions = makeActions()
    const item = pbi("a", 1)
    renderWithProviders(
      <ul>
        <BacklogItemCard item={item} section="ready" {...PERMS} {...STATE} {...actions} />
      </ul>,
    )
    const menuButton = screen.getByRole("button", { name: t.backlogMoreActions.replace("{id}", "1") })
    await userEvent.click(menuButton)
    const menu = screen.getByRole("menu")
    expect(within(menu).getByRole("menuitem", { name: t.backlogMoveToTop })).toHaveFocus()
    await userEvent.keyboard("{ArrowDown}")
    expect(within(menu).getByRole("menuitem", { name: t.backlogMoveToBottom })).toHaveFocus()
    await userEvent.keyboard("{Escape}")
    expect(screen.queryByRole("menu")).not.toBeInTheDocument()
    expect(menuButton).toHaveFocus()

    await userEvent.click(menuButton)
    await userEvent.click(screen.getByRole("menuitem", { name: t.backlogMoveToBottom }))
    expect(actions.onMoveToEdge).toHaveBeenCalledWith(item, "bottom")
    expect(screen.queryByRole("menu")).not.toBeInTheDocument()
  })

  it("shows a selection checkbox in select mode and reports shift-clicks", async () => {
    const actions = makeActions()
    const item = pbi("a", 1)
    renderWithProviders(
      <ul>
        <BacklogItemCard item={item} section="ready" {...PERMS} {...STATE} selectMode isSelected {...actions} />
      </ul>,
    )
    const box = screen.getByRole("checkbox", { name: t.backlogSelectItem.replace("{id}", "1") })
    expect(box).toBeChecked()
    fireEvent.click(box, { shiftKey: true })
    expect(actions.onToggleSelect).toHaveBeenCalledWith(item, true)
  })

  it("hides INVEST without ai.use and shows the translated sprint name (F-07, F-13)", async () => {
    const actions = makeActions()
    const item = pbi("a", 1, {
      sprintItems: [
        { sprint: { id: "s1", sprintName: "Sprint Minggu ke 9", status: "active", i18n: { sprintName: { ja: "第9週スプリント", id: "Sprint Minggu ke 9", source: "id", status: "done" } } } },
      ],
    })
    const { unmount } = renderWithProviders(
      <ul>
        <BacklogItemCard item={item} section="ready" {...PERMS} canInvest={false} {...STATE} {...actions} />
      </ul>,
    )
    expect(screen.queryByRole("button", { name: new RegExp(t.aiInvestReview) })).not.toBeInTheDocument()
    expect(screen.getByText("(第9週スプリント)")).toBeInTheDocument()
    unmount()
    renderWithProviders(
      <ul>
        <BacklogItemCard item={item} section="ready" {...PERMS} {...STATE} {...actions} />
      </ul>,
    )
    await userEvent.click(screen.getByRole("button", { name: new RegExp(t.aiInvestReview) }))
    expect(actions.onInvest).toHaveBeenCalledWith(item)
  })
})
