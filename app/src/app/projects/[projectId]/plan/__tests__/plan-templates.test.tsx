import { beforeEach, describe, expect, it, vi } from "vitest"
import { screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { jsonResponse, renderWithProviders, stubFetch, tr } from "@/app/__tests__/test-utils"
import { stubLayout } from "@/components/__tests__/helpers"
import { resetUrl } from "@/app/projects/[projectId]/backlog/__tests__/nav-mock"
import { builtinByKey } from "@/lib/plan-templates/builtins"
import { PlanContent } from "../plan-content"
import { TemplateLoadDialog } from "../templates/template-load-dialog"
import { PLAN_COLUMNS, prefsKey } from "../lib/prefs"
import { installMemoryStorage, mkItem } from "./fixtures"
import { freshState, planServer, stubMatchMedia, type ServerState } from "./plan-server"

vi.mock("next/navigation", async () => (await import("@/app/projects/[projectId]/backlog/__tests__/nav-mock")).navigationModule({ projectId: "p1" }))

stubLayout()
const t = tr("en")

beforeEach(() => {
  installMemoryStorage()
  stubMatchMedia(false)
  resetUrl("/projects/p1/plan")
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => setTimeout(() => cb(0), 0))
})

describe("plan page: undated rows (日程未定)", () => {
  let state: ServerState
  beforeEach(() => {
    state = freshState()
    state.items = [...state.items, mkItem({ id: "U", name: "Spec", sortOrder: 4, plannedStart: null, plannedEnd: null, durationDays: 20 })]
    state.dependencies = [...state.dependencies, { id: "d9", predecessorId: "B", successorId: "U" }]
  })

  it("lists the row with 'Not scheduled' cells and a chip instead of a bar; no arrow to it", async () => {
    window.localStorage.setItem(prefsKey("p1"), JSON.stringify({ columns: PLAN_COLUMNS }))
    planServer(state)
    renderWithProviders(<PlanContent projectId="p1" canEdit />, { language: "en" })
    await screen.findByTitle("Spec")
    const row = document.querySelector<HTMLElement>('[data-plan-row="U"]')!
    expect(within(row).getAllByText(t.tplUndated).length).toBeGreaterThanOrEqual(3)
    expect(within(row).getByText("~20 days")).toBeInTheDocument()
    const chip = row.querySelector<HTMLElement>("[data-plan-undated]")!
    expect(chip).toHaveAccessibleName("Spec: not scheduled (open to set dates)")
    // FS arrows skip the undated successor (no bar to point at); the dated ones stay.
    expect(document.querySelector('[data-plan-arrow="d9"]')).toBeNull()
    expect(document.querySelector('[data-plan-arrow="d1"]')).not.toBeNull()
    await userEvent.click(chip)
    const dialog = await screen.findByRole("dialog")
    expect(within(dialog).getByLabelText(t.planPlannedStart)).toHaveValue("")
  })

  it("offers 'Load template' in the toolbar for editors only", async () => {
    planServer(state)
    renderWithProviders(<PlanContent projectId="p1" canEdit={false} />, { language: "en" })
    await screen.findByTitle("Spec")
    expect(screen.queryByTestId("plan-load-template")).not.toBeInTheDocument()
  })
})

describe("TemplateLoadDialog", () => {
  const equipment = builtinByKey("equipment")!
  const summary = { id: "t1", builtinKey: "equipment", isBuiltin: true, name: equipment.name, description: equipment.description, visibility: "public", owner: null, stageCount: 8, nodeCount: 20, hasDurations: true, version: 0, updatedAt: "2026-10-01T00:00:00Z", updatedByName: null, isMine: false, canChangeVisibility: false, canDelete: false }
  const mine = { ...summary, id: "t2", builtinKey: null, isBuiltin: false, name: "My line move", isMine: true, visibility: "private", stageCount: 2 }

  function setup(applied: boolean) {
    const fetchMock = stubFetch([
      { match: "/api/plan-templates", method: "GET", respond: () => jsonResponse([summary, mine]) },
      { match: "/api/plan-templates/t1", method: "GET", respond: () => jsonResponse({ ...summary, content: equipment.content }) },
      {
        match: "/api/projects/p1/plan/templates/applications",
        respond: () => jsonResponse(applied ? [{ id: "a1", templateId: "t1", templateName: "設備導入", templateVersion: 0, createdRootIds: [], appliedBy: { id: "u1", name: "Sato" }, appliedAt: "2026-09-30T00:00:00Z" }] : []),
      },
      { match: "/api/projects/p1/plan/templates/apply", method: "POST", respond: () => jsonResponse({ applicationId: "a2", createdRootIds: ["n1"], createdCount: 3, alreadyApplied: applied, hasDurations: true }, 201) },
    ])
    const onApplied = vi.fn()
    const items = [mkItem({ id: "P", name: "Existing phase" }), mkItem({ id: "MS", name: "Gate", isMilestone: true })]
    renderWithProviders(<TemplateLoadDialog projectId="p1" items={items} nameOf={(i) => i.name} onClose={() => {}} onApplied={onApplied} />, { language: "en" })
    return { fetchMock, onApplied }
  }

  it("groups templates, previews with checkboxes, excludes a subtree and posts the load", async () => {
    const { fetchMock, onApplied } = setup(false)
    expect(await screen.findByText(t.tplSectionBuiltin)).toBeInTheDocument()
    expect(screen.getByText(t.tplSectionMine)).toBeInTheDocument()
    await userEvent.click(screen.getByRole("button", { name: /設備導入/ }))
    const tree = await screen.findByRole("list", { name: "設備導入" })
    const spec = within(tree).getByRole("checkbox", { name: /仕様決定/ })
    await userEvent.click(spec)
    // Its children are greyed out and disabled.
    expect(within(tree).getByRole("checkbox", { name: /要求仕様の整理/ })).toBeDisabled()
    expect(screen.queryByTestId("tpl-already-applied")).not.toBeInTheDocument()
    // Milestone parents cannot take children: only "Existing phase" is offered besides the top level.
    const position = screen.getByLabelText(t.tplInsertPosition)
    expect(within(position).getAllByRole("option").map((o) => o.textContent)).toEqual([t.tplInsertTop, "Existing phase"])
    await userEvent.selectOptions(position, "P")
    const submit = screen.getByTestId("tpl-load-submit")
    expect(submit).toHaveTextContent(/^Load \d+ items$/)
    await userEvent.click(submit)
    await waitFor(() => expect(onApplied).toHaveBeenCalled())
    const post = fetchMock.mock.calls.find(([u, init]) => String(u).endsWith("/apply") && init?.method === "POST")
    expect(JSON.parse(String(post?.[1]?.body))).toEqual({ templateId: "t1", excludePaths: ["0"], parentId: "P" })
  })

  it("a start date + 'weekdays only' are posted with the load; without a date neither is sent", async () => {
    const { fetchMock, onApplied } = setup(false)
    await userEvent.click(await screen.findByRole("button", { name: /設備導入/ }))
    await screen.findByRole("list", { name: "設備導入" })
    // The weekend option is meaningless without a start date.
    expect(screen.getByTestId("tpl-skip-weekends")).toBeDisabled()
    await userEvent.type(screen.getByTestId("tpl-start-date"), "2026-11-02")
    const weekdays = screen.getByTestId("tpl-skip-weekends")
    expect(weekdays).toBeEnabled()
    await userEvent.click(weekdays)
    await userEvent.click(screen.getByTestId("tpl-load-submit"))
    await waitFor(() => expect(onApplied).toHaveBeenCalled())
    const post = fetchMock.mock.calls.find(([u, init]) => String(u).endsWith("/apply") && init?.method === "POST")
    expect(JSON.parse(String(post?.[1]?.body))).toEqual({ templateId: "t1", excludePaths: [], parentId: null, startDate: "2026-11-02", skipWeekends: true })
  })

  it("warns when the template was already loaded but still allows loading", async () => {
    setup(true)
    await userEvent.click(await screen.findByRole("button", { name: /設備導入/ }))
    expect(await screen.findByTestId("tpl-already-applied")).toHaveTextContent("Sato")
    expect(screen.getByTestId("tpl-load-submit")).toBeEnabled()
  })

  it("search filters the list; unchecking everything disables the load", async () => {
    setup(false)
    await screen.findByText(t.tplSectionBuiltin)
    await userEvent.type(screen.getByLabelText(t.tplSearch), "line move")
    expect(screen.queryByRole("button", { name: /設備導入/ })).not.toBeInTheDocument()
    await userEvent.clear(screen.getByLabelText(t.tplSearch))
    await userEvent.click(screen.getByRole("button", { name: /設備導入/ }))
    await screen.findByRole("list", { name: "設備導入" })
    await userEvent.click(screen.getByRole("button", { name: t.tplSelectNone }))
    expect(screen.getByTestId("tpl-load-submit")).toBeDisabled()
  })
})
