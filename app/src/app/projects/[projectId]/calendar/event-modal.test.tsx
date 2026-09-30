import { describe, expect, it, vi } from "vitest"
import { fireEvent, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { getTranslations } from "@/lib/i18n"
import EventModal, { type EventModalProps } from "./event-modal"
import { emptyForm, type Sprint } from "./calendar-types"
import { renderWithProviders } from "./__tests__/render"

const t = getTranslations("ja")
const sprints: Sprint[] = [
  { id: "s1", sprintName: "Sprint 1", startDate: "2026-09-01", endDate: "2026-09-14", status: "active", items: [] },
]

function setup(over: Partial<EventModalProps> = {}) {
  const props: EventModalProps = {
    open: true,
    editingEventId: null,
    initialForm: { ...emptyForm, date: "2026-09-10" },
    sprints,
    saving: false,
    deleting: false,
    onSave: vi.fn(),
    onDelete: vi.fn(),
    onClose: vi.fn(),
    ...over,
  }
  renderWithProviders(<EventModal {...props} />)
  return props
}

const titleInput = () => screen.getByPlaceholderText(t.eventTitlePlaceholder)
const submit = (label = t.add) => screen.getByRole("button", { name: label })

describe("EventModal", () => {
  it("requires a title before saving", async () => {
    const props = setup()
    expect(screen.getByRole("dialog", { name: t.eventAdd })).toBeInTheDocument()
    await userEvent.click(submit())
    expect(screen.getByText(t.calendarTitleRequired)).toHaveAttribute("role", "alert")
    expect(titleInput()).toHaveAttribute("aria-invalid", "true")
    expect(props.onSave).not.toHaveBeenCalled()
  })

  it("rejects an end date before the start date", async () => {
    const props = setup()
    await userEvent.type(titleInput(), "Review")
    const dateInputs = document.querySelectorAll<HTMLInputElement>('input[type="date"]')
    fireEvent.change(dateInputs[1], { target: { value: "2026-09-01" } })
    expect(screen.getByText(t.calendarEndBeforeStart)).toBeInTheDocument()
    await userEvent.click(submit())
    expect(props.onSave).not.toHaveBeenCalled()
  })

  it("does not save without a start date", async () => {
    const props = setup({ initialForm: { ...emptyForm } })
    await userEvent.type(titleInput(), "x")
    await userEvent.click(submit())
    expect(props.onSave).not.toHaveBeenCalled()
  })

  it("saves the full form including colour and sprint", async () => {
    const props = setup()
    await userEvent.type(titleInput(), "Review")
    await userEvent.type(screen.getByPlaceholderText(t.eventDescriptionPlaceholder), "Demo day")
    const dateInputs = document.querySelectorAll<HTMLInputElement>('input[type="date"]')
    fireEvent.change(dateInputs[0], { target: { value: "2026-09-11" } })
    fireEvent.change(dateInputs[1], { target: { value: "2026-09-12" } })
    const red = screen.getByRole("radio", { name: t.calendarColorNames.red })
    await userEvent.click(red)
    expect(red).toHaveAttribute("aria-checked", "true")
    await userEvent.selectOptions(screen.getByRole("combobox"), "s1")
    await userEvent.click(submit())
    expect(props.onSave).toHaveBeenCalledWith({
      title: "Review",
      description: "Demo day",
      date: "2026-09-11",
      endDate: "2026-09-12",
      color: "red",
      sprintId: "s1",
    })
  })

  it("shows update + delete in edit mode, with delete disabled while saving", async () => {
    const props = setup({ editingEventId: "e1", initialForm: { ...emptyForm, title: "Old", date: "2026-09-10" } })
    expect(screen.getByRole("dialog", { name: t.eventEdit })).toBeInTheDocument()
    await userEvent.click(screen.getByRole("button", { name: t.delete }))
    expect(props.onDelete).toHaveBeenCalled()
    await userEvent.click(submit(t.update))
    expect(props.onSave).toHaveBeenCalled()
  })

  it("orders footer buttons delete, cancel, submit", () => {
    setup({ editingEventId: "e1", initialForm: { ...emptyForm, title: "Old", date: "2026-09-10" } })
    const dialog = screen.getByRole("dialog")
    const names = within(dialog)
      .getAllByRole("button")
      .map((b) => b.textContent)
      .filter((n) => n === t.delete || n === t.cancel || n === t.update)
    expect(names).toEqual([t.delete, t.cancel, t.update])
  })

  it("closes immediately when clean, and asks before discarding edits", async () => {
    const props = setup()
    await userEvent.click(screen.getByRole("button", { name: t.cancel }))
    expect(props.onClose).toHaveBeenCalledTimes(1)
  })

  it("guards unsaved changes with a confirm dialog", async () => {
    const props = setup()
    await userEvent.type(titleInput(), "draft")
    await userEvent.click(screen.getByRole("button", { name: t.cancel }))
    expect(props.onClose).not.toHaveBeenCalled()
    await userEvent.click(await screen.findByRole("button", { name: "破棄して閉じる" }))
    expect(props.onClose).toHaveBeenCalledTimes(1)
  })
})
