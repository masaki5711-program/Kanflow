import { afterEach, describe, expect, it, vi } from "vitest"
import { screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { json, renderWithProviders, stubFetch, t } from "./helpers"
import SprintEditDialog from "../components/sprint-edit-dialog"

const refresh = vi.hoisted(() => vi.fn())
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh, push: vi.fn(), replace: vi.fn() }) }))

const sprintLite = { id: "s1", sprintName: "Sprint 1", startDate: "2026-09-01T00:00:00Z", endDate: "2026-09-14T00:00:00Z", sprintGoal: null, capacity: 10 }

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("SprintEditDialog", () => {
  it("disables save when the name is blank", async () => {
    stubFetch({})
    renderWithProviders(<SprintEditDialog projectId="p1" sprint={sprintLite} onClose={vi.fn()} />)
    await userEvent.clear(screen.getByDisplayValue("Sprint 1"))
    expect(screen.getByRole("button", { name: t.save })).toBeDisabled()
  })

  it("saves trimmed values, refreshes and closes", async () => {
    const { calls } = stubFetch({ "PATCH /api/projects/p1/sprints/s1": {} })
    const onClose = vi.fn()
    const onSaved = vi.fn()
    renderWithProviders(<SprintEditDialog projectId="p1" sprint={sprintLite} onClose={onClose} onSaved={onSaved} />)
    await userEvent.type(screen.getByDisplayValue("Sprint 1"), "  ")
    const [goal] = screen.getAllByRole("textbox").filter((el) => el.tagName === "TEXTAREA")
    await userEvent.type(goal, " Goal ")
    const cap = screen.getByDisplayValue("10")
    await userEvent.clear(cap)
    await userEvent.type(cap, "x")
    await userEvent.click(screen.getByRole("button", { name: t.save }))
    await waitFor(() => expect(onClose).toHaveBeenCalled())
    expect(calls[0].body).toEqual({ sprintName: "Sprint 1", startDate: "2026-09-01", endDate: "2026-09-14", sprintGoal: "Goal", capacity: 0 })
    expect(onSaved).toHaveBeenCalled()
    expect(refresh).toHaveBeenCalled()
    expect(await screen.findByText(t.sprintSaved)).toBeInTheDocument()
  })

  it("stays open and toasts on failure", async () => {
    stubFetch({ "PATCH /api/projects/p1/sprints/s1": () => json({ error: "overlap" }, 400) })
    const onClose = vi.fn()
    renderWithProviders(<SprintEditDialog projectId="p1" sprint={{ ...sprintLite, startDate: "" }} onClose={onClose} />)
    const dateInputs = screen.getAllByDisplayValue("").filter((el) => el.getAttribute("type") === "date")
    await userEvent.type(dateInputs[0], "2026-09-02")
    await userEvent.click(screen.getByRole("button", { name: t.save }))
    expect(await screen.findByText("overlap")).toBeInTheDocument()
    expect(screen.getByText(t.sprintUpdateFailed)).toBeInTheDocument()
    expect(onClose).not.toHaveBeenCalled()
  })

  it("after a 409 shows the other user's values and saves them with the new version", async () => {
    const current = { ...sprintLite, sprintName: "Sprint 1 (SM edit)", capacity: 12, version: 7 }
    let conflicted = false
    const { calls } = stubFetch({
      "PATCH /api/projects/p1/sprints/s1": () => {
        if (conflicted) return json({})
        conflicted = true
        return json({ error: "stale", code: "VERSION_CONFLICT", current }, 409)
      },
    })
    const onClose = vi.fn()
    const onSaved = vi.fn()
    renderWithProviders(<SprintEditDialog projectId="p1" sprint={{ ...sprintLite, version: 6 }} onClose={onClose} onSaved={onSaved} />)
    await userEvent.type(screen.getByDisplayValue("Sprint 1"), " (PO edit)")
    await userEvent.click(screen.getByRole("button", { name: t.save }))

    expect(await screen.findByText(t.sprintEditConflictNotice)).toBeInTheDocument()
    expect(screen.getByDisplayValue("Sprint 1 (SM edit)")).toBeInTheDocument()
    expect(screen.getByDisplayValue("12")).toBeInTheDocument()
    expect(onClose).not.toHaveBeenCalled()
    expect(onSaved).toHaveBeenCalled()

    await userEvent.click(screen.getByRole("button", { name: t.save }))
    await waitFor(() => expect(onClose).toHaveBeenCalled())
    expect(calls[0].body).toMatchObject({ sprintName: "Sprint 1 (PO edit)", version: 6 })
    expect(calls[1].body).toMatchObject({ sprintName: "Sprint 1 (SM edit)", capacity: 12, version: 7 })
  })

  it("closes after a 409 without the current row", async () => {
    stubFetch({ "PATCH /api/projects/p1/sprints/s1": () => json({ error: "stale", code: "VERSION_CONFLICT" }, 409) })
    const onClose = vi.fn()
    renderWithProviders(<SprintEditDialog projectId="p1" sprint={{ ...sprintLite, version: 1 }} onClose={onClose} />)
    await userEvent.click(screen.getByRole("button", { name: t.save }))
    await waitFor(() => expect(onClose).toHaveBeenCalled())
  })
})
