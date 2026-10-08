import { describe, expect, it, vi } from "vitest"
import { screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { jsonResponse, renderWithProviders, stubFetch } from "@/app/__tests__/test-utils"
import { stubLayout } from "@/components/__tests__/helpers"
import { PlanShiftDialog } from "../components/plan-shift-dialog"

stubLayout()

const preview = (n: number) => ({
  deltaDays: 3,
  moved: Array.from({ length: n }, (_, i) => ({ id: `m${i}`, name: `Step ${i}`, newStart: "2026-11-12", newEnd: "2026-11-16" })),
  skipped: [{ id: "s1" }],
})

function setup(moved: number, hasSuccessors = true) {
  const fetchMock = stubFetch([
    { match: /\/shift-following$/, method: "POST", respond: (_u, init) => jsonResponse(JSON.parse(String(init?.body)).apply ? { ...preview(moved), applied: true } : preview(moved)) },
  ])
  const onApplied = vi.fn()
  renderWithProviders(<PlanShiftDialog apiBase="/api/projects/p1/plan" itemId="A" slip={3} hasSuccessors={hasSuccessors} onClose={() => {}} onApplied={onApplied} />, { language: "en" })
  return { fetchMock, onApplied }
}

const bodies = (fetchMock: ReturnType<typeof setup>["fetchMock"]) => fetchMock.mock.calls.map(([, init]) => JSON.parse(String(init?.body)))

describe("PlanShiftDialog", () => {
  it("previews the dependents first, then applies them", async () => {
    const { fetchMock, onApplied } = setup(2)
    expect(await screen.findByText("2 items move by +3 days")).toBeInTheDocument()
    expect(screen.getByText(/1 items stay/)).toBeInTheDocument()
    expect(screen.getByTestId("plan-shift-dependents")).toBeChecked()
    await userEvent.click(screen.getByTestId("plan-shift-apply"))
    await waitFor(() => expect(onApplied).toHaveBeenCalled())
    expect(bodies(fetchMock)).toEqual([
      { scope: "dependents", apply: false },
      { scope: "dependents", apply: true },
    ])
  })

  it("defaults to 'later' without successors and re-previews when the scope changes", async () => {
    const { fetchMock } = setup(1, false)
    await screen.findByText("1 items move by +3 days")
    expect(screen.getByTestId("plan-shift-later")).toBeChecked()
    await userEvent.click(screen.getByTestId("plan-shift-dependents"))
    await waitFor(() => expect(bodies(fetchMock).at(-1)).toEqual({ scope: "dependents", apply: false }))
  })

  it("disables applying when nothing would move", async () => {
    setup(0)
    expect(await screen.findByText("There is nothing to move")).toBeInTheDocument()
    expect(screen.getByTestId("plan-shift-apply")).toBeDisabled()
  })
})
