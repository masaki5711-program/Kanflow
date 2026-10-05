import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { getTranslations } from "@/lib/i18n"
import { jsonResponse, renderWithProviders, stubLayout } from "@/components/__tests__/helpers"
import { forgetGitState } from "../git-client-state"
import { link, panel } from "./fixtures"

vi.mock("@/components/ai-result-modal", () => ({ AIResultModal: () => null }))

const { default: PbiDetailModal } = await import("@/components/pbi-detail-modal")

stubLayout()

const t = getTranslations("en")
const PBI = {
  id: "pbi-1", displayId: 12, initiative: "Faster login", epic: null, userStory: "As a user I want SSO", acceptanceCriteria: null,
  referenceDoc: null, workloadScore: 5, status: "ready", notReadyReason: null, poNote: null, assignedPo: null, completedAt: null,
  createdAt: "2026-01-01", updatedAt: "2026-01-01", version: 1,
}

let gitBody: unknown
const gitGets: string[] = []

beforeEach(() => {
  forgetGitState()
  gitGets.length = 0
  gitBody = panel({ links: [link({ kind: "mr", ref: "5", title: "SSO button", state: "opened" })] })
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    const u = String(url)
    if (u.includes("/git/")) return (gitGets.push(u), jsonResponse(gitBody))
    if (u.endsWith("/icebox")) return jsonResponse({ unreviewed: [], reviewed: [] })
    if (u.endsWith("/goals")) return jsonResponse([])
    if (u.endsWith("/projects/p1")) return jsonResponse({ pointUnit: "SP" })
    if (u.includes("/comments") || u.includes("/activity")) return jsonResponse([])
    return jsonResponse(PBI)
  }))
})
afterEach(() => vi.unstubAllGlobals())

describe("PBI detail modal — 開発 panel", () => {
  it("shows the development panel in the read view, not while editing", async () => {
    renderWithProviders(<PbiDetailModal projectId="p1" pbiId="pbi-1" onClose={vi.fn()} editable />)
    const dialog = await screen.findByRole("dialog", { name: "Faster login" })
    const dev = await within(dialog).findByRole("region", { name: t.gitDevTitle })
    expect(within(dev).getByText("SSO button")).toBeInTheDocument()
    expect(gitGets).toEqual(["/api/projects/p1/git/links?pbiId=pbi-1"])

    await userEvent.click(screen.getByRole("button", { name: t.edit }))
    await screen.findByRole("button", { name: t.update })
    expect(within(dialog).queryByRole("region", { name: t.gitDevTitle })).not.toBeInTheDocument()
  })

  it("renders nothing Git-related when the project has Git off", async () => {
    gitBody = { enabled: false }
    renderWithProviders(<PbiDetailModal projectId="p1" pbiId="pbi-1" onClose={vi.fn()} />)
    const dialog = await screen.findByRole("dialog", { name: "Faster login" })
    await vi.waitFor(() => expect(gitGets).toHaveLength(1))
    expect(within(dialog).queryByRole("region", { name: t.gitDevTitle })).not.toBeInTheDocument()
    expect(dialog.querySelector("[data-pbi-dev-panel]")).toBeNull()
  })
})
