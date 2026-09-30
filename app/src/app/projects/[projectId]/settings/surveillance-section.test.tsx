import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { getTranslations } from "@/lib/i18n"
import { DEFAULT_SURVEILLANCE_SETTINGS } from "@/lib/surveillance-settings"
import { jsonResponse, renderWithProviders } from "./__tests__/providers"
import { SurveillanceSection, fromDraft, parseBounded, toDraft } from "./surveillance-section"

const t = getTranslations("ja")
const URL_ = "/api/projects/p1/surveillance-settings"

const fetchMock = vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
  if ((init.method ?? "GET") === "PUT") return jsonResponse({ settings: JSON.parse(init.body as string) })
  return jsonResponse({ settings: { ...DEFAULT_SURVEILLANCE_SETTINGS, stalledDays: 4 } })
})

beforeEach(() => {
  fetchMock.mockClear()
  vi.stubGlobal("fetch", fetchMock)
})
afterEach(() => vi.unstubAllGlobals())

describe("draft helpers", () => {
  it("parseBounded accepts integers in range only", () => {
    expect(parseBounded("stalledDays", "5")).toBe(5)
    expect(parseBounded("stalledDays", "0")).toBeNull()
    expect(parseBounded("stalledDays", "31")).toBeNull()
    expect(parseBounded("stalledDays", "2.5")).toBeNull()
    expect(parseBounded("overCapacityTolerancePct", "0")).toBe(0)
    expect(parseBounded("stalledDays", "")).toBeNull()
  })

  it("round-trips settings and refuses invalid drafts", () => {
    expect(fromDraft(toDraft(DEFAULT_SURVEILLANCE_SETTINGS))).toEqual(DEFAULT_SURVEILLANCE_SETTINGS)
    expect(fromDraft({ ...toDraft(DEFAULT_SURVEILLANCE_SETTINGS), stalledDays: "x" })).toBeNull()
  })
})

describe("SurveillanceSection", () => {
  it("loads the stored thresholds and saves the full object", async () => {
    const user = userEvent.setup()
    renderWithProviders(<SurveillanceSection projectId="p1" />)
    const stalled = await screen.findByLabelText(t.survStalledDays)
    expect(stalled).toHaveValue(4)

    await user.clear(stalled)
    await user.type(stalled, "6")
    await user.click(screen.getByRole("switch", { name: t.survNotifyCritical }))
    await user.click(screen.getByRole("button", { name: t.settingsSaveButton }))

    await waitFor(() => expect(fetchMock.mock.calls.some(([, i]) => (i as RequestInit)?.method === "PUT")).toBe(true))
    const put = fetchMock.mock.calls.find(([, i]) => (i as RequestInit)?.method === "PUT")!
    expect(String(put[0])).toBe(URL_)
    expect(JSON.parse((put[1] as RequestInit).body as string)).toEqual({
      ...DEFAULT_SURVEILLANCE_SETTINGS,
      stalledDays: 6,
      notifyCritical: false,
    })
  })

  it("shows a range error and blocks saving for an out-of-range value", async () => {
    const user = userEvent.setup()
    renderWithProviders(<SurveillanceSection projectId="p1" />)
    const stalled = await screen.findByLabelText(t.survStalledDays)
    await user.clear(stalled)
    await user.type(stalled, "99")
    expect(await screen.findByText("1〜30 の整数を入力してください")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: t.settingsSaveButton })).toBeDisabled()
  })

  it("reset restores the defaults in the form", async () => {
    const user = userEvent.setup()
    renderWithProviders(<SurveillanceSection projectId="p1" />)
    const stalled = await screen.findByLabelText(t.survStalledDays)
    await user.click(screen.getByRole("button", { name: t.survResetDefaults }))
    expect(stalled).toHaveValue(3)
  })
})
