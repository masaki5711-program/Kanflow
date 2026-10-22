import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { getTranslations } from "@/lib/i18n"
import { jsonResponse, renderWithProviders, stubFetch } from "../../gantt/__tests__/providers"

vi.mock("next/navigation", () => ({ useParams: () => ({ projectId: "p1" }) }))

const { default: ReleasesPage } = await import("../page")
const t = getTranslations("ja")

const row = (id: string, planVersion: string, status: string) => ({
  id, planVersion, status, pbItemId: null, iceboxId: null, initiative: `Item ${id}`, epic: null, userStory: null, assignedPo: null,
  releaseVersion: null, releaseDate: null, releaseNote: null, manualLink: null, poNote: null, pbItem: null,
})

const gitStatus = {
  enabled: true,
  versions: [
    {
      version: "1.0.0",
      tag: { tag: "v1.0.0", url: "https://g/-/tags/v1.0.0", releasedAt: "2026-10-01T00:00:00.000Z", hasRelease: true },
      planned: 2,
      merged: 1,
      pending: [{ pbItemId: "b2", displayId: 2, title: "Second" }],
      unplanned: [{ displayId: 7, title: "Surprise", ref: "42", url: "https://g/42" }],
      canRelease: true,
    },
    { version: "2.0.0", tag: null, planned: 0, merged: 0, pending: [], unplanned: [], canRelease: false },
  ],
}

let posts: unknown[]
let gitOn: boolean

beforeEach(() => {
  posts = []
  gitOn = true
  stubFetch((url, init) => {
    const method = init?.method ?? "GET"
    if (url === "/api/projects/p1/releases") return jsonResponse([row("r1", "1.0.0", "ready"), row("r2", "2.0.0", "staged")])
    if (url === "/api/projects/p1/releases/git" && method === "GET") return jsonResponse(gitOn ? gitStatus : { enabled: false, versions: [] })
    if (url === "/api/projects/p1/releases/git" && method === "POST") {
      posts.push(JSON.parse(String(init?.body)))
      return jsonResponse({ updated: 1, pending: 1 })
    }
    return jsonResponse({ error: "unhandled" }, 404)
  })
})
afterEach(() => vi.unstubAllGlobals())

describe("ReleasesPage — Git status", () => {
  it("shows the tag, merge progress, pending PBIs and unplanned work of a version", async () => {
    renderWithProviders(<ReleasesPage />)
    const group = (await screen.findByRole("heading", { name: "1.0.0" })).closest("section") as HTMLElement
    const git = await within(group).findByRole("group", { name: t.releaseGitLabel })
    expect(within(git).getByRole("link", { name: /v1\.0\.0/ })).toHaveAttribute("href", "https://g/-/tags/v1.0.0")
    expect(within(git).getByText("マージ済み 1 / 2 件")).toBeInTheDocument()
    expect(within(git).getByText("未マージ: #2")).toBeInTheDocument()
    expect(within(git).getByText("計画外のマージ 1 件")).toBeInTheDocument()

    const other = (screen.getByRole("heading", { name: "2.0.0" })).closest("section") as HTMLElement
    expect(within(other).getByText(t.releaseGitUntagged)).toBeInTheDocument()
    expect(within(other).queryByRole("button", { name: t.releaseGitMarkReleased })).not.toBeInTheDocument()
  })

  it("marks a tagged version as released only after a confirm that warns about unmerged PBIs", async () => {
    const user = userEvent.setup()
    renderWithProviders(<ReleasesPage />)
    const group = (await screen.findByRole("heading", { name: "1.0.0" })).closest("section") as HTMLElement
    await user.click(await within(group).findByRole("button", { name: t.releaseGitMarkReleased }))
    const dialog = await screen.findByRole("alertdialog")
    expect(within(dialog).getByText(/未マージの PBI が 1 件あります/)).toBeInTheDocument()
    expect(posts).toEqual([])
    await user.click(within(dialog).getByRole("button", { name: new RegExp(`^${t.confirm}$`) }))
    await waitFor(() => expect(posts).toEqual([{ version: "1.0.0", action: "release" }]))
  })

  it("shows no Git row when Git is off", async () => {
    gitOn = false
    renderWithProviders(<ReleasesPage />)
    await screen.findByRole("heading", { name: "1.0.0" })
    expect(screen.queryByRole("group", { name: t.releaseGitLabel })).not.toBeInTheDocument()
  })
})
