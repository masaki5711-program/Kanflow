import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { getTranslations } from "@/lib/i18n"
import { jsonResponse, renderWithProviders } from "./__tests__/providers"

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  session: { data: { user: { id: "u1", role: "user" } } } as { data: unknown },
}))

vi.mock("next/navigation", () => ({
  useParams: () => ({ projectId: "p1" }),
  useRouter: () => ({ push: mocks.push, replace: vi.fn(), refresh: vi.fn() }),
}))
vi.mock("next-auth/react", () => ({ useSession: () => mocks.session }))
vi.mock("@/components/member-picker", () => ({
  MemberPicker: ({ onAdded }: { onAdded: () => void }) => (
    <button type="button" onClick={onAdded}>
      mock-add-member
    </button>
  ),
}))

const { default: SettingsPage } = await import("./page")
const t = getTranslations("ja")

const MEMBERS = [
  {
    id: "m1",
    role: "po",
    user: { id: "u1", name: "Alice", email: "a@x", employeeNumber: "E1", department: "Dev" },
  },
  {
    id: "m2",
    role: "dev",
    user: { id: "u2", name: "Bob", email: "b@x", employeeNumber: null, department: null },
  },
]
const PROJECT = {
  defaultCapacity: 20,
  sprintDurationDays: 14,
  pointUnit: "SP",
  pointDescription: "",
  sections: [{ id: "s1" }, { section: { id: "s2" } }],
}
const SPRINTS = [
  { sprintName: "S1", capacity: 10, actualScore: 12, status: "done" },
  { sprintName: "S2", capacity: 10, actualScore: 8, status: "archived" },
  { sprintName: "S3", capacity: 0, actualScore: 0, status: "done" },
  { sprintName: "S4", capacity: 10, actualScore: 10, status: "active" },
]
const SECTIONS = [
  { id: "s1", name: "Sec One" },
  { id: "s2", name: "Sec Two" },
  { id: "s3", name: "Sec Three" },
]

type Handler = (url: string, init: RequestInit) => Response | Promise<Response>
let overrides: Record<string, Handler> = {}
const fetchMock = vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
  const url = String(input)
  const method = init.method ?? "GET"
  const key = `${method} ${url}`
  if (overrides[key]) return overrides[key](url, init)
  if (key === "GET /api/projects/p1") return jsonResponse(PROJECT)
  if (key === "GET /api/projects/p1/members") return jsonResponse(MEMBERS)
  if (key === "GET /api/projects/p1/sprints") return jsonResponse(SPRINTS)
  if (key === "GET /api/sections") return jsonResponse(SECTIONS)
  return jsonResponse({ ok: true })
})

function calls(method: string, url: string) {
  return fetchMock.mock.calls.filter(([u, i]) => String(u) === url && ((i as RequestInit)?.method ?? "GET") === method)
}
function bodyOf(call: unknown[]) {
  return JSON.parse((call[1] as RequestInit).body as string)
}

beforeEach(() => {
  overrides = {}
  fetchMock.mockClear()
  mocks.push.mockClear()
  mocks.session = { data: { user: { id: "u1", role: "user" } } }
  vi.stubGlobal("fetch", fetchMock)
})
afterEach(() => {
  vi.unstubAllGlobals()
})

async function renderLoaded(language: "ja" | "en" = "ja") {
  const utils = renderWithProviders(<SettingsPage />, { language })
  await screen.findByText("Alice")
  return utils
}

describe("SettingsPage members", () => {
  it("lists members with details and count", async () => {
    await renderLoaded()
    expect(screen.getByText("E1")).toBeInTheDocument()
    expect(screen.getByText(/Dev$/)).toBeInTheDocument()
    const section = screen.getByRole("heading", { name: t.settingsMembers }).closest("section") as HTMLElement
    expect(within(section).getByText("2")).toBeInTheDocument()
  })

  it("changes a role optimistically and PATCHes it", async () => {
    const user = userEvent.setup()
    await renderLoaded()
    const select = screen.getByRole("combobox", { name: t.settingsRoleOf.replace("{name}", "Bob") })
    await user.selectOptions(select, "sm")
    expect(select).toHaveValue("sm")
    await waitFor(() => expect(calls("PATCH", "/api/projects/p1/members/m2")).toHaveLength(1))
    expect(bodyOf(calls("PATCH", "/api/projects/p1/members/m2")[0])).toEqual({ role: "sm" })
    expect(select).toHaveValue("sm")
  })

  it("rolls back the role and shows an error toast when PATCH fails", async () => {
    let release!: () => void
    overrides["PATCH /api/projects/p1/members/m2"] = () =>
      new Promise((resolve) => {
        release = () => resolve(jsonResponse({ error: "nope" }, 500))
      })
    const user = userEvent.setup()
    await renderLoaded()
    const select = screen.getByRole("combobox", { name: t.settingsRoleOf.replace("{name}", "Bob") })
    await user.selectOptions(select, "po")
    expect(select).toHaveValue("po")
    release()
    await waitFor(() => expect(select).toHaveValue("dev"))
    expect(await screen.findByText(t.settingsRoleChangeFailed)).toBeInTheDocument()
  })

  it("removes a member only after confirmation", async () => {
    const user = userEvent.setup()
    await renderLoaded()
    const removeBtn = screen.getByRole("button", { name: t.settingsRemoveMemberOf.replace("{name}", "Bob") })

    await user.click(removeBtn)
    const dialog = await screen.findByRole("alertdialog").catch(() => screen.findByRole("dialog"))
    await user.click(within(dialog).getByRole("button", { name: t.cancel }))
    expect(screen.getByText("Bob")).toBeInTheDocument()
    expect(calls("DELETE", "/api/projects/p1/members/m2")).toHaveLength(0)

    await user.click(removeBtn)
    const dialog2 = await screen.findByRole("alertdialog").catch(() => screen.findByRole("dialog"))
    await user.click(within(dialog2).getByRole("button", { name: t.delete }))
    await waitFor(() => expect(screen.queryByText("Bob")).not.toBeInTheDocument())
    expect(calls("DELETE", "/api/projects/p1/members/m2")).toHaveLength(1)
  })

  it("restores a removed member when DELETE fails", async () => {
    overrides["DELETE /api/projects/p1/members/m2"] = () => jsonResponse({ error: "x" }, 500)
    const user = userEvent.setup()
    await renderLoaded()
    await user.click(screen.getByRole("button", { name: t.settingsRemoveMemberOf.replace("{name}", "Bob") }))
    const dialog = await screen.findByRole("alertdialog").catch(() => screen.findByRole("dialog"))
    await user.click(within(dialog).getByRole("button", { name: t.delete }))
    expect(await screen.findByText(t.settingsRemoveFailed)).toBeInTheDocument()
    expect(screen.getByText("Bob")).toBeInTheDocument()
  })

  it("refetches members when the picker reports an addition", async () => {
    const user = userEvent.setup()
    await renderLoaded()
    const before = calls("GET", "/api/projects/p1/members").length
    await user.click(screen.getByRole("button", { name: "mock-add-member" }))
    await waitFor(() => expect(calls("GET", "/api/projects/p1/members").length).toBe(before + 1))
  })

  it("shows the empty state when there are no members", async () => {
    overrides["GET /api/projects/p1/members"] = () => jsonResponse({ not: "array" })
    renderWithProviders(<SettingsPage />)
    expect(await screen.findByText(t.settingsMembersEmpty)).toBeInTheDocument()
  })
})

describe("SettingsPage project loading", () => {
  it("shows a retry state when the project fails to load and retries", async () => {
    let fail = true
    overrides["GET /api/projects/p1"] = () => (fail ? jsonResponse({ error: "boom" }, 500) : jsonResponse(PROJECT))
    const user = userEvent.setup()
    renderWithProviders(<SettingsPage />)
    const retry = await screen.findByRole("button", { name: t.errorRetry })
    expect(screen.getAllByText(t.settingsLoadFailed).length).toBeGreaterThan(0)
    fail = false
    await user.click(retry)
    expect(await screen.findByRole("heading", { name: t.settingsSprintWorkload })).toBeInTheDocument()
  })

  it("hides section assignment for non-PO non-admin users", async () => {
    mocks.session = { data: { user: { id: "u2", role: "user" } } }
    await renderLoaded()
    await screen.findByRole("heading", { name: t.settingsSprintWorkload })
    expect(screen.queryByRole("heading", { name: t.sectionTitle })).not.toBeInTheDocument()
  })
})

describe("SectionAssignSection", () => {
  it("preselects project sections, toggles, and saves the selection", async () => {
    const user = userEvent.setup()
    await renderLoaded()
    const one = await screen.findByRole("checkbox", { name: "Sec One" })
    expect(one).toBeChecked()
    expect(screen.getByRole("checkbox", { name: "Sec Two" })).toBeChecked()
    const three = screen.getByRole("checkbox", { name: "Sec Three" })
    expect(three).not.toBeChecked()

    await user.click(one)
    await user.click(three)
    const card = screen.getByRole("heading", { name: t.sectionTitle }).closest("section") as HTMLElement
    const saveBtn = within(card).getByRole("button", { name: t.save })
    expect(within(card).getByText(t.settingsUnsavedChanges)).toBeInTheDocument()
    await user.click(saveBtn)
    await waitFor(() => expect(calls("PATCH", "/api/projects/p1")).toHaveLength(1))
    expect(bodyOf(calls("PATCH", "/api/projects/p1")[0])).toEqual({ sectionIds: ["s2", "s3"] })
    expect(await screen.findByText(t.saved)).toBeInTheDocument()
    // Clean again → save disabled, no unsaved hint.
    await waitFor(() => expect(saveBtn).toBeDisabled())
    expect(within(card).queryByText(t.settingsUnsavedChanges)).not.toBeInTheDocument()
  })

  it("shows an empty state and disables save when no sections exist (admin)", async () => {
    mocks.session = { data: { user: { id: "zz", role: "admin" } } }
    overrides["GET /api/sections"] = () => jsonResponse([])
    await renderLoaded()
    expect(await screen.findByText(t.sectionEmpty)).toBeInTheDocument()
    const card = screen.getByRole("heading", { name: t.sectionTitle }).closest("section") as HTMLElement
    expect(within(card).getByRole("button", { name: t.save })).toBeDisabled()
  })

  it("toasts when saving sections fails", async () => {
    overrides["PATCH /api/projects/p1"] = () => jsonResponse({ error: "x" }, 500)
    const user = userEvent.setup()
    await renderLoaded()
    await user.click(await screen.findByRole("checkbox", { name: "Sec Three" }))
    const card = screen.getByRole("heading", { name: t.sectionTitle }).closest("section") as HTMLElement
    await user.click(within(card).getByRole("button", { name: t.save }))
    expect(await screen.findByText(t.settingsSaveFailed)).toBeInTheDocument()
    // Still dirty after a failed save.
    expect(within(card).getByText(t.settingsUnsavedChanges)).toBeInTheDocument()
  })
})

describe("SprintWorkloadSection", () => {
  it("pluralizes durations in English: 1 day / 2 days / 1 week / 2 weeks", async () => {
    await renderLoaded("en")
    const en = getTranslations("en")
    const select = await screen.findByRole("combobox", { name: en.settingsSprintDuration })
    const labels = within(select)
      .getAllByRole("option")
      .map((o) => o.textContent)
    expect(labels).toEqual(["1 day", "2 days", "3 days", "4 days", "1 week", "2 weeks", "3 weeks", "4 weeks"])
    expect(select).toHaveValue("14")
  })

  it("shows average actual score from done/archived sprints and the history table", async () => {
    await renderLoaded()
    await screen.findByRole("heading", { name: t.settingsSprintWorkload })
    // (12 + 8 + 0) / 3 = 6.67 → 7
    expect(screen.getByText("7")).toBeInTheDocument()
    expect(screen.getByText(new RegExp(t.settingsSprintCount.replace("{count}", "3")))).toBeInTheDocument()
    const table = screen.getByRole("table", { name: t.settingsSprintHistory })
    const rows = within(table).getAllByRole("row")
    expect(rows).toHaveLength(4)
    expect(within(rows[1]).getByText("120%")).toBeInTheDocument()
    expect(within(rows[1]).getByText("+2")).toBeInTheDocument()
    expect(within(rows[2]).getByText("-2")).toBeInTheDocument()
    expect(within(rows[3]).getByText("0%")).toBeInTheDocument()
    expect(screen.queryByText("S4")).not.toBeInTheDocument()
  })

  it("edits and saves settings, warning on unload only while dirty", async () => {
    const user = userEvent.setup()
    await renderLoaded()
    const capacity = await screen.findByRole("spinbutton", { name: new RegExp(t.settingsDefaultCapacity) })
    const addSpy = vi.spyOn(window, "addEventListener")
    await user.clear(capacity)
    await user.type(capacity, "30")
    expect(addSpy).toHaveBeenCalledWith("beforeunload", expect.any(Function))
    addSpy.mockRestore()

    await user.clear(capacity)
    expect(capacity).toHaveValue(0)
    await user.type(capacity, "25")
    await user.selectOptions(screen.getByRole("combobox", { name: t.settingsSprintDuration }), "7")
    await user.selectOptions(screen.getByRole("combobox", { name: t.settingsPointUnit }), "人日")
    await user.type(screen.getByRole("textbox", { name: t.settingsPointDescription }), "half day")
    const workload = screen.getByRole("region", { name: t.settingsSprintWorkload })
    await user.click(within(workload).getByRole("button", { name: t.settingsSaveButton }))

    await waitFor(() => expect(calls("PATCH", "/api/projects/p1")).toHaveLength(1))
    expect(bodyOf(calls("PATCH", "/api/projects/p1")[0])).toEqual({
      defaultCapacity: 25,
      sprintDurationDays: 7,
      pointUnit: "人日",
      pointDescription: "half day",
    })
    expect(await screen.findByText(t.settingsSaved)).toBeInTheDocument()
  })

  it("toasts when saving settings fails", async () => {
    overrides["PATCH /api/projects/p1"] = () => jsonResponse({ error: "x" }, 500)
    const user = userEvent.setup()
    await renderLoaded()
    const workload = await screen.findByRole("region", { name: t.settingsSprintWorkload })
    const saveBtn = within(workload).getByRole("button", { name: t.settingsSaveButton })
    expect(saveBtn).toBeDisabled()
    await user.type(screen.getByRole("spinbutton", { name: new RegExp(t.settingsDefaultCapacity) }), "5")
    expect(saveBtn).toBeEnabled()
    await user.click(saveBtn)
    expect(await screen.findByText(t.settingsSaveFailed)).toBeInTheDocument()
  })

  it("uses defaults when project fields are missing and hides history when empty", async () => {
    overrides["GET /api/projects/p1"] = () => jsonResponse({})
    overrides["GET /api/projects/p1/sprints"] = () => jsonResponse({ nope: 1 })
    await renderLoaded()
    const select = await screen.findByRole("combobox", { name: t.settingsSprintDuration })
    expect(select).toHaveValue("7")
    expect(screen.getByRole("spinbutton", { name: new RegExp(t.settingsDefaultCapacity) })).toHaveValue(0)
    expect(screen.queryByRole("table")).not.toBeInTheDocument()
  })
})

describe("General sections", () => {
  it("no longer offers a language switch (it is a personal setting on /me and in the header)", async () => {
    await renderLoaded()
    expect(screen.queryByRole("group", { name: t.settingsLanguageLabel })).not.toBeInTheDocument()
    expect(screen.queryByRole("heading", { name: t.settingsLanguage })).not.toBeInTheDocument()
  })

  it("asks for confirmation before changing the project type", async () => {
    const user = userEvent.setup()
    await renderLoaded()
    const group = screen.getByRole("group", { name: t.projectType })
    const [software, process] = within(group).getAllByRole("button")

    await user.click(process)
    const dialog = await screen.findByRole("alertdialog")
    expect(within(dialog).getByText(t.settingsProjectTypeConfirmTitle)).toBeInTheDocument()
    await user.click(within(dialog).getByRole("button", { name: t.cancel }))
    expect(calls("PATCH", "/api/projects/p1")).toHaveLength(0)
    expect(software).toHaveAttribute("aria-pressed", "true")

    // Clicking the already-selected type does nothing.
    await user.click(software)
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument()
  })

  it("changes the project type after confirmation and toasts on failure", async () => {
    const user = userEvent.setup()
    await renderLoaded()
    const group = screen.getByRole("group", { name: t.projectType })
    const [software, process] = within(group).getAllByRole("button")
    expect(software).toHaveAttribute("aria-pressed", "true")
    await user.click(process)
    await user.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: t.settingsProjectTypeConfirmButton }))
    await waitFor(() => expect(process).toHaveAttribute("aria-pressed", "true"))
    expect(bodyOf(calls("PATCH", "/api/projects/p1")[0])).toEqual({ projectType: "process_improvement" })
    expect(await screen.findByText(t.settingsProjectTypeChanged)).toBeInTheDocument()

    overrides["PATCH /api/projects/p1"] = () => jsonResponse({ error: "x" }, 500)
    await user.click(software)
    await user.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: t.settingsProjectTypeConfirmButton }))
    expect(await screen.findByText(t.settingsProjectTypeChangeFailed)).toBeInTheDocument()
    expect(process).toHaveAttribute("aria-pressed", "true")
  })

  it("renders project type labels in Indonesian", async () => {
    renderWithProviders(<SettingsPage />, { language: "id" as never })
    await screen.findByText("Alice")
    expect(screen.getByRole("heading", { level: 1, name: getTranslations("id").settingsTitle })).toBeInTheDocument()
  })
})

describe("DangerZoneSection", () => {
  async function openDelete(user: ReturnType<typeof userEvent.setup>) {
    await user.click(screen.getByRole("button", { name: t.settingsDeleteProject }))
    return screen.findByRole("alertdialog").catch(() => screen.findByRole("dialog"))
  }

  it("does nothing when the confirmation is cancelled", async () => {
    const user = userEvent.setup()
    await renderLoaded()
    const dialog = await openDelete(user)
    expect(within(dialog).getByText(t.settingsDeleteProjectConfirm)).toBeInTheDocument()
    await user.click(within(dialog).getByRole("button", { name: t.cancel }))
    expect(calls("DELETE", "/api/projects/p1")).toHaveLength(0)
    expect(mocks.push).not.toHaveBeenCalled()
  })

  it("deletes the project and navigates home after confirmation", async () => {
    const user = userEvent.setup()
    await renderLoaded()
    const dialog = await openDelete(user)
    await user.click(within(dialog).getByRole("button", { name: t.trashMoveToTrash }))
    await waitFor(() => expect(mocks.push).toHaveBeenCalledWith("/"))
    expect(calls("DELETE", "/api/projects/p1")).toHaveLength(1)
  })

  it("shows the server error and stays on the page when delete fails", async () => {
    overrides["DELETE /api/projects/p1"] = () => jsonResponse({ error: "forbidden-delete" }, 403)
    const user = userEvent.setup()
    await renderLoaded()
    const dialog = await openDelete(user)
    await user.click(within(dialog).getByRole("button", { name: t.trashMoveToTrash }))
    expect(await screen.findByText("forbidden-delete")).toBeInTheDocument()
    expect(mocks.push).not.toHaveBeenCalled()
  })
})

describe("SurveillanceSection visibility", () => {
  it("is shown to the PO", async () => {
    await renderLoaded()
    expect(await screen.findByRole("heading", { name: t.survTitle })).toBeInTheDocument()
  })

  it("is hidden from non-PO members", async () => {
    mocks.session = { data: { user: { id: "u2", role: "user" } } }
    await renderLoaded()
    expect(screen.queryByRole("heading", { name: t.survTitle })).not.toBeInTheDocument()
    expect(calls("GET", "/api/projects/p1/surveillance-settings")).toHaveLength(0)
  })
})
