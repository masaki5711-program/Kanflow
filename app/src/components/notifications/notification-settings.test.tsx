import { afterEach, describe, expect, it, vi } from "vitest"
import { screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { jsonResponse, renderWithProviders, stubFetch, tr } from "@/app/__tests__/test-utils"
import { NotificationSettings, PREFERENCES_URL } from "./notification-settings"

const t = tr("en")
const TYPES = ["assigned", "mentioned", "comment", "due_soon", "overdue", "sprint_start", "sprint_end", "surveillance_critical"]
const prefs = (disabled: string[] = []) => ({ preferences: TYPES.map((type) => ({ type, enabled: !disabled.includes(type) })) })

afterEach(() => vi.unstubAllGlobals())

describe("NotificationSettings", () => {
  it("lists a labelled switch per type", async () => {
    stubFetch([{ match: PREFERENCES_URL, method: "GET", respond: () => jsonResponse(prefs(["comment"])) }])
    renderWithProviders(<NotificationSettings />, { language: "en" })
    expect(await screen.findByRole("switch", { name: t.notifTypeAssigned })).toBeChecked()
    expect(screen.getByRole("switch", { name: t.notifTypeComment })).not.toBeChecked()
    expect(screen.getAllByRole("switch")).toHaveLength(TYPES.length)
    expect(screen.getByRole("heading", { name: t.notifSettingsTitle })).toBeInTheDocument()
  })

  it("saves a toggle immediately with only that type", async () => {
    const fetchMock = stubFetch([
      { match: PREFERENCES_URL, method: "GET", respond: () => jsonResponse(prefs()) },
      { match: PREFERENCES_URL, method: "PUT", respond: () => jsonResponse(prefs(["overdue"])) },
    ])
    const user = userEvent.setup()
    renderWithProviders(<NotificationSettings />, { language: "en" })
    const sw = await screen.findByRole("switch", { name: t.notifTypeOverdue })
    await user.click(sw)
    expect(sw).not.toBeChecked()
    const put = fetchMock.mock.calls.find(([, init]) => init?.method === "PUT")!
    expect(JSON.parse(String(put[1]!.body))).toEqual({ preferences: [{ type: "overdue", enabled: false }] })
  })

  it("rolls back and shows an error when saving fails", async () => {
    stubFetch([
      { match: PREFERENCES_URL, method: "GET", respond: () => jsonResponse(prefs()) },
      { match: PREFERENCES_URL, method: "PUT", respond: () => jsonResponse({ error: "down" }, 500) },
    ])
    const user = userEvent.setup()
    renderWithProviders(<NotificationSettings />, { language: "en" })
    const sw = await screen.findByRole("switch", { name: t.notifTypeSprintEnd })
    await user.click(sw)
    await waitFor(() => expect(sw).toBeChecked())
    expect(await screen.findByText(t.notifSettingsFailed)).toBeInTheDocument()
  })
})
