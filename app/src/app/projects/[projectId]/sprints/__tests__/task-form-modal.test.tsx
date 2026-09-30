import { afterEach, describe, expect, it, vi } from "vitest"
import { screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { deferred, json, pb, renderWithProviders, sprint, stubFetch, t, task } from "./helpers"
import TaskFormModal from "../components/task-form-modal"
import type { Member, Sprint, SprintItem, TaskFormState } from "../components/types"

const pb1 = pb("pb1", { initiative: null, userStory: "As a user" })
const pb2 = pb("pb2")
const members: Member[] = [
  { id: "m1", userId: "u1", role: "po", user: { id: "u1", name: "Alice", email: "a@x" } },
  { id: "m2", userId: "u2", role: "dev", user: { id: "u2", name: "Bob", email: "b@x" } },
]
const pbiDetail = {
  id: "pb1", initiative: "Init", epic: "Ep", userStory: "Story", acceptanceCriteria: "AC", referenceDoc: null,
  workloadScore: 5, status: "ready", assignedPo: "Carol", poNote: null,
}

interface Opts {
  sprint?: Sprint
  task?: SprintItem | null
  initialPbItemId?: string
  canEditPbi?: boolean
  onSave?: (form: TaskFormState) => Promise<boolean>
  onBulkAdd?: (pbItemId: string, assigneeIds: string[], names: string[]) => Promise<boolean>
}

function renderModal(o: Opts = {}) {
  const onClose = vi.fn()
  const onSave = vi.fn(o.onSave ?? (async () => true))
  const onPbiSaved = vi.fn()
  renderWithProviders(
    <TaskFormModal projectId="p1" sprint={o.sprint ?? sprint("s1", { items: [task("t1", pb1), task("t2", pb2)] })}
      task={o.task ?? null} initialPbItemId={o.initialPbItemId} members={members}
      canEditPbi={o.canEditPbi} onSave={onSave} onBulkAdd={o.onBulkAdd} onPbiSaved={onPbiSaved} onClose={onClose} />,
  )
  return { onClose, onSave, onPbiSaved }
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("TaskFormModal", () => {
  it("warns and disables submit when the sprint has no PBIs", async () => {
    stubFetch({})
    renderModal({ sprint: sprint("s1") })
    expect(screen.getByText(t.sprintTaskNeedsPbiFirst)).toHaveAttribute("role", "alert")
    expect(screen.getByRole("button", { name: t.add })).toBeDisabled()
    expect(screen.getByRole("combobox")).toBeDisabled()
  })

  it("renders the footer as Cancel then primary action", async () => {
    stubFetch({})
    renderModal()
    const dialog = screen.getByRole("dialog")
    const cancel = within(dialog).getByRole("button", { name: t.cancel })
    const add = within(dialog).getByRole("button", { name: t.add })
    expect(cancel.compareDocumentPosition(add) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(add).toHaveAttribute("type", "submit")
    expect(add).toHaveAttribute("form", "sprint-task-form")
  })

  it("labels task hours in hours, not in the project point unit", () => {
    stubFetch({ "/api/projects/p1/backlog/pb1": pbiDetail })
    renderModal({ task: task("t1", pb1, { estimatedHours: 1, actualHours: 2 }) })
    expect(screen.getByLabelText(`${t.sprintEstimatedHoursShort} (${t.sprintHoursUnit})`)).toHaveValue(1)
    expect(screen.getByLabelText(`${t.sprintActualHoursShort} (${t.sprintHoursUnit})`)).toHaveValue(2)
    expect(t.sprintEstimatedHoursShort).toBe("見積時間")
  })

  it("blocks submission until a PBI and a task name are provided", async () => {
    stubFetch({ "/api/projects/p1/backlog/pb2": { ...pbiDetail, id: "pb2" } })
    const { onSave, onClose } = renderModal()
    const add = screen.getByRole("button", { name: t.add })
    await userEvent.click(add)
    expect(onSave).not.toHaveBeenCalled()
    await userEvent.selectOptions(screen.getByRole("combobox"), "pb2")
    await userEvent.click(add)
    expect(onSave).not.toHaveBeenCalled()
    await userEvent.type(screen.getByPlaceholderText(t.taskNamePlaceholder), "Build")
    await userEvent.click(screen.getByRole("button", { name: "Bob" }))
    await userEvent.type(screen.getByPlaceholderText(t.taskHoursPlaceholder), "2.5")
    await userEvent.click(add)
    await waitFor(() => expect(onSave).toHaveBeenCalledWith({
      pbItemId: "pb2", taskName: "Build", assigneeIds: ["u2"], loadedAssigneeIds: null, estimatedHours: "2.5", actualHours: "", status: "todo",
    }, expect.any(Function)))
    expect(onClose).toHaveBeenCalled()
  })

  it("lists PBIs using the user story when the initiative is empty", () => {
    stubFetch({})
    renderModal()
    expect(screen.getByRole("option", { name: "#1 As a user" })).toBeInTheDocument()
    expect(screen.getByRole("option", { name: "#2 Initiative pb2" })).toBeInTheDocument()
  })

  it("closes immediately when pristine, but asks before discarding unsaved changes", async () => {
    stubFetch({ "/api/projects/p1/backlog/pb1": pbiDetail })
    const { onClose } = renderModal({ initialPbItemId: "pb1" })
    await userEvent.click(screen.getByRole("button", { name: t.cancel }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it("guards unsaved edits: keeping editing leaves the modal open, discarding closes it", async () => {
    stubFetch({ "/api/projects/p1/backlog/pb1": pbiDetail })
    const { onClose } = renderModal({ initialPbItemId: "pb1" })
    await userEvent.type(screen.getByPlaceholderText(t.taskNamePlaceholder), "x")
    await userEvent.click(screen.getByRole("button", { name: t.cancel }))
    let dlg = await screen.findByRole("alertdialog")
    await userEvent.click(within(dlg).getAllByRole("button")[0])
    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument())
    expect(onClose).not.toHaveBeenCalled()

    await userEvent.keyboard("{Escape}")
    dlg = await screen.findByRole("alertdialog")
    await userEvent.click(within(dlg).getAllByRole("button")[1])
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1))
  })

  it("keeps the modal open when onSave reports failure", async () => {
    stubFetch({})
    const { onClose } = renderModal({ task: task("t1", pb1, { estimatedHours: 1, actualHours: 2, assignee: "Alice" }), onSave: async () => false })
    expect(screen.getByText(t.sprintTaskEdit)).toBeInTheDocument()
    expect(screen.queryByRole("option", { name: /#1/ })).not.toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Alice" })).toHaveAttribute("aria-pressed", "true")
    // Clicking the selected member clears the assignment.
    await userEvent.click(screen.getByRole("button", { name: "Alice" }))
    expect(screen.getByRole("button", { name: "Alice" })).toHaveAttribute("aria-pressed", "false")
    await userEvent.selectOptions(screen.getByDisplayValue(t.taskTodo), "done")
    await userEvent.clear(screen.getByDisplayValue("2"))
    await userEvent.type(screen.getAllByRole("spinbutton")[1], "4")
    await userEvent.click(screen.getByRole("button", { name: t.update }))
    await waitFor(() => expect(screen.getByRole("button", { name: t.update })).not.toBeDisabled())
    expect(onClose).not.toHaveBeenCalled()
  })

  it("edits the PBI inline and saves it before the task", async () => {
    const patch = deferred<Response>()
    const { calls } = stubFetch({
      "/api/projects/p1/backlog/pb1": pbiDetail,
      "PATCH /api/projects/p1/backlog/pb1": () => patch.promise,
    })
    const { onSave, onPbiSaved } = renderModal({ initialPbItemId: "pb1", canEditPbi: true })
    const toggle = await screen.findByRole("button", { name: new RegExp(t.sprintTaskPbiDetail) })
    expect(toggle).toHaveTextContent(t.sprintTaskPbiEditable)
    await userEvent.click(toggle)
    expect(toggle).toHaveAttribute("aria-expanded", "true")
    const initiative = screen.getByDisplayValue("Init")
    await userEvent.type(initiative, "!")
    await userEvent.type(screen.getByDisplayValue("Ep"), "2")
    await userEvent.type(screen.getByDisplayValue("Story"), ".")
    await userEvent.type(screen.getByDisplayValue("AC"), ".")
    await userEvent.type(screen.getByDisplayValue("Carol"), "e")
    await userEvent.clear(screen.getByDisplayValue("5"))
    await userEvent.selectOptions(screen.getByDisplayValue(t.backlogStatusReady), "completed")
    expect(screen.getByText(t.sprintTaskPbiUnsaved)).toBeInTheDocument()
    await userEvent.type(screen.getByPlaceholderText(t.taskNamePlaceholder), "T")
    await userEvent.click(screen.getByRole("button", { name: t.add }))
    expect(await screen.findByText(t.saving)).toBeInTheDocument()
    patch.resolve(json({}))
    await waitFor(() => expect(onSave).toHaveBeenCalled())
    expect(calls.find((c) => c.method === "PATCH")?.body).toEqual({
      initiative: "Init!", epic: "Ep2", userStory: "Story.", acceptanceCriteria: "AC.", referenceDoc: null,
      workloadScore: 0, status: "completed", assignedPo: "Carole", poNote: null,
    })
    expect(onPbiSaved).toHaveBeenCalled()
  })

  it("does not save the task when the PBI save fails", async () => {
    stubFetch({
      "/api/projects/p1/backlog/pb1": pbiDetail,
      "PATCH /api/projects/p1/backlog/pb1": () => json({ error: "pbi locked" }, 409),
    })
    const { onSave } = renderModal({ initialPbItemId: "pb1", canEditPbi: true })
    await userEvent.click(await screen.findByRole("button", { name: new RegExp(t.sprintTaskPbiDetail) }))
    await userEvent.type(screen.getByDisplayValue("Init"), "?")
    await userEvent.type(screen.getByPlaceholderText(t.taskNamePlaceholder), "T")
    await userEvent.click(screen.getByRole("button", { name: t.add }))
    expect(await screen.findByText("pbi locked")).toBeInTheDocument()
    expect(screen.getByText(t.sprintTaskPbiSaveFailed)).toBeInTheDocument()
    expect(onSave).not.toHaveBeenCalled()
  })

  it("shows the PBI panel read-only for non-editors", async () => {
    stubFetch({ "/api/projects/p1/backlog/pb1": pbiDetail })
    renderModal({ initialPbItemId: "pb1" })
    const toggle = await screen.findByRole("button", { name: new RegExp(t.sprintTaskPbiDetail) })
    expect(toggle).toHaveTextContent(t.sprintTaskPbiReadOnly)
    await userEvent.click(toggle)
    expect(screen.getByDisplayValue("Init")).toHaveAttribute("readonly")
    await userEvent.click(toggle)
    expect(screen.queryByDisplayValue("Init")).not.toBeInTheDocument()
  })

  it("bulk-adds a fixed-task group with the chosen assignee", async () => {
    stubFetch({
      "/api/projects/p1/backlog/pb1": pbiDetail,
      "/api/user/fixed-tasks": [
        { id: "g1", taskName: "Release", items: [{ id: "i1", taskName: "Tag" }, { id: "i2", taskName: "Deploy" }] },
        { id: "g2", taskName: "Empty", items: [] },
      ],
    })
    const onBulkAdd = vi.fn(async () => true)
    const { onClose } = renderModal({ onBulkAdd })
    const select = await screen.findByLabelText(t.fixedTasksApplyFromTemplate)
    await userEvent.selectOptions(select, "g2")
    expect(screen.getByText(t.fixedTasksItemEmpty)).toBeInTheDocument()
    expect(screen.getByRole("button", { name: t.fixedTasksBulkAdd })).toBeDisabled()
    await userEvent.selectOptions(select, "g1")
    expect(screen.getByText("Deploy")).toBeInTheDocument()
    // Disabled until a PBI is chosen.
    expect(screen.getByRole("button", { name: `${t.fixedTasksBulkAdd} (2)` })).toBeDisabled()
    await userEvent.selectOptions(screen.getAllByRole("combobox")[0], "pb1")
    await userEvent.click(screen.getByRole("button", { name: "Alice" }))
    await userEvent.click(screen.getByRole("button", { name: `${t.fixedTasksBulkAdd} (2)` }))
    await waitFor(() => expect(onBulkAdd).toHaveBeenCalledWith("pb1", ["u1"], ["Tag", "Deploy"]))
    expect(onClose).toHaveBeenCalled()
  })

  it("pre-selects the normalized assignees of an edited task and saves ids", async () => {
    stubFetch({})
    const onSave = vi.fn(async () => true)
    renderModal({ task: task("t1", pb1, { assignee: "stale text", assignees: [{ id: "u2", name: "Bob" }] }), onSave })
    expect(screen.getByRole("button", { name: "Bob" })).toHaveAttribute("aria-pressed", "true")
    expect(screen.getByRole("button", { name: "Alice" })).toHaveAttribute("aria-pressed", "false")
    await userEvent.click(screen.getByRole("button", { name: "Alice" }))
    await userEvent.click(screen.getByRole("button", { name: t.update }))
    await waitFor(() => expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ assigneeIds: ["u1"] }), expect.any(Function)))
  })

  it("shows the empty assignee hint when there are no members", () => {
    stubFetch({})
    renderWithProviders(
      <TaskFormModal projectId="p1" sprint={sprint("s1", { items: [task("t1", pb1)] })} task={null} members={[]}
        onSave={async () => true} onClose={() => {}} />,
    )
    expect(screen.getByText(t.sprintUnassigned)).toBeInTheDocument()
  })
})
