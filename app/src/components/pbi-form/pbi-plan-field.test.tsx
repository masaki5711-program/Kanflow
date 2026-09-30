import { describe, expect, it, vi } from "vitest"
import { screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { jsonResponse, renderWithProviders, stubFetch, tr } from "@/app/__tests__/test-utils"
import { PbiPlanLink, PbiPlanPicker, planItemHref } from "./pbi-plan-field"
import { EMPTY_PBI_FORM, buildPbiCreateBody, buildPbiPatch, toPbiForm } from "./pbi-form-state"

const t = tr("en")

describe("PBI ↔ master plan", () => {
  it("read view links to the plan item (deep link ?item=)", () => {
    renderWithProviders(<PbiPlanLink projectId="p1" planItem={{ id: "pl 1", name: "Design" }} />, { language: "en" })
    const link = screen.getByRole("link", { name: t.planPbiOpenPlan.replace("{name}", "Design") })
    expect(link).toHaveAttribute("href", "/projects/p1/plan?item=pl%201")
    expect(planItemHref("p", "x")).toBe("/projects/p/plan?item=x")
  })

  it("read view shows 'None' without a link", () => {
    renderWithProviders(<PbiPlanLink projectId="p1" planItem={null} />, { language: "en" })
    expect(screen.getByText(t.planPbiNone)).toBeInTheDocument()
    expect(screen.queryByRole("link")).not.toBeInTheDocument()
  })

  it("picker offers leaf items only (parents and milestones disabled)", async () => {
    stubFetch([
      {
        match: "/api/projects/p1/plan",
        respond: () =>
          jsonResponse({
            today: "2026-10-01",
            dependencies: [],
            items: [
              { id: "P", name: "Phase", plannedStart: "2026-10-01", plannedEnd: "2026-10-10", sortOrder: 1 },
              { id: "L", parentId: "P", name: "Leaf", plannedStart: "2026-10-01", plannedEnd: "2026-10-03", sortOrder: 1 },
              { id: "M", name: "Go", isMilestone: true, plannedStart: "2026-10-09", plannedEnd: "2026-10-09", sortOrder: 2 },
            ],
          }),
      },
    ])
    const onChange = vi.fn()
    const user = userEvent.setup()
    renderWithProviders(<PbiPlanPicker projectId="p1" value="" onChange={onChange} />, { language: "en" })
    const select = screen.getByRole("combobox", { name: new RegExp(t.planPbiField) })
    await within(select).findByRole("option", { name: /Leaf/ })
    expect(within(select).getByRole("option", { name: /Phase/ })).toBeDisabled()
    expect(within(select).getByRole("option", { name: /Go/ })).toBeDisabled()
    await user.selectOptions(select, "L")
    expect(onChange).toHaveBeenCalledWith("L")
  })

  it("form state: planItemId round-trips, unlinks with null, never goes into the create body", () => {
    const item = { initiative: "", epic: "", userStory: "", acceptanceCriteria: "", workloadScore: 0, status: "ready", planItem: { id: "L", name: "Leaf" } }
    const form = toPbiForm(item)
    expect(form.planItemId).toBe("L")
    expect(buildPbiPatch(item, { ...form, planItemId: "" })).toEqual({ planItemId: null })
    expect(buildPbiPatch(item, { ...form, planItemId: "X" })).toEqual({ planItemId: "X" })
    expect(buildPbiCreateBody({ ...EMPTY_PBI_FORM, planItemId: "X" })).not.toHaveProperty("planItemId")
  })
})
