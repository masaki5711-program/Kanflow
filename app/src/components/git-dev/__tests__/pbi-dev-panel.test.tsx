import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { getTranslations } from "@/lib/i18n"
import { jsonResponse, renderWithProviders } from "@/components/__tests__/helpers"
import { PbiDevPanel } from "../pbi-dev-panel"
import { forgetGitState } from "../git-client-state"
import { link, panel, REPO_API, stubClipboard } from "./fixtures"

const en = getTranslations("en")
const ja = getTranslations("ja")

let linksBody: unknown = panel()
let syncStatus = 200
let syncBody: unknown = { results: [{ repositoryId: "r-web", ok: true, links: 3 }] }
const calls: string[] = []

beforeEach(() => {
  forgetGitState()
  calls.length = 0
  linksBody = panel()
  syncStatus = 200
  syncBody = { results: [{ repositoryId: "r-web", ok: true, links: 3 }] }
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      calls.push(`${init?.method ?? "GET"} ${url}`)
      if (String(url).endsWith("/git/sync")) return jsonResponse(syncStatus === 200 ? syncBody : { error: "x", code: "RATE_LIMITED" }, syncStatus)
      return jsonResponse(linksBody)
    }),
  )
})
afterEach(() => vi.unstubAllGlobals())

const linkGets = () => calls.filter((c) => c.startsWith("GET") && c.includes("/git/links?pbiId=pbi-1"))

function renderPanel(language: "en" | "ja" = "en") {
  return renderWithProviders(<div data-testid="host"><PbiDevPanel projectId="p1" pbiId="pbi-1" /></div>, language)
}

describe("PbiDevPanel", () => {
  it("renders nothing when the integration is off, and does not ask again for the same project", async () => {
    linksBody = { enabled: false }
    const first = renderPanel()
    await waitFor(() => expect(linkGets()).toHaveLength(1))
    expect(screen.getByTestId("host")).toBeEmptyDOMElement()
    first.unmount()

    const second = renderPanel()
    await new Promise((r) => setTimeout(r, 20))
    expect(linkGets()).toHaveLength(1)
    expect(screen.getByTestId("host")).toBeEmptyDOMElement()
    second.unmount()
  })

  it("groups links by repository: MRs first (open → merged → closed), then branches, then commits", async () => {
    linksBody = panel({
      links: [
        link({ kind: "commit", ref: "abcdef1234567890", title: "Fix typo", repository: REPO_API, occurredAt: "2026-10-01T12:00:00Z" }),
        link({ kind: "mr", ref: "7", title: "Old closed", state: "closed", occurredAt: "2026-09-20T00:00:00Z" }),
        link({ kind: "mr", ref: "8", title: "Login form", state: "opened", pipeline: "failed", author: "Hanako" }),
        link({ kind: "mr", ref: "9", title: "Login API", state: "merged", pipeline: "success" }),
        link({ kind: "branch", ref: "feature/PBI-12-login", title: "WIP" }),
      ],
    })
    renderPanel("ja")
    const section = await screen.findByRole("region", { name: ja.gitDevTitle })
    const repos = [...section.querySelectorAll("[data-git-repository]")].map((el) => el.getAttribute("data-git-repository"))
    expect(repos).toEqual(["api-server", "web-frontend"])

    const web = section.querySelector('[data-git-repository="web-frontend"]') as HTMLElement
    const kinds = [...web.querySelectorAll("[data-git-link]")].map((el) => el.getAttribute("data-git-link"))
    expect(kinds).toEqual(["mr", "mr", "mr", "branch"])
    const mrRows = [...web.querySelectorAll('[data-git-link="mr"]')] as HTMLElement[]
    expect(within(mrRows[0]).getByText(ja.gitDevMrOpened)).toBeInTheDocument()
    expect(within(mrRows[0]).getByText("パイプライン: 失敗")).toBeInTheDocument()
    expect(within(mrRows[0]).getByText("Hanako")).toBeInTheDocument()
    expect(within(mrRows[1]).getByText(ja.gitDevMrMerged)).toBeInTheDocument()
    expect(within(mrRows[1]).getByText("パイプライン: 成功")).toBeInTheDocument()
    expect(within(mrRows[2]).getByText(ja.gitDevMrClosed)).toBeInTheDocument()

    const mrLink = within(mrRows[0]).getByRole("link")
    expect(mrLink).toHaveAttribute("target", "_blank")
    expect(mrLink).toHaveAttribute("rel", "noopener noreferrer")
    expect(mrLink).toHaveAccessibleName("!8 Login form を GitLab で開く（新しいタブ）")
  })

  it("keeps a branch deleted in GitLab on the panel, marked 削除済み", async () => {
    linksBody = panel({
      links: [
        link({ kind: "branch", ref: "feature/PBI-12-old", title: "feature/PBI-12-old", goneAt: "2026-10-02T03:00:00.000Z" }),
        link({ kind: "branch", ref: "feature/PBI-12-new", title: "feature/PBI-12-new" }),
      ],
    })
    renderPanel("ja")
    const section = await screen.findByRole("region", { name: ja.gitDevTitle })
    const rows = [...section.querySelectorAll('[data-git-link="branch"]')] as HTMLElement[]
    const gone = rows.find((r) => r.textContent?.includes("feature/PBI-12-old"))!
    const live = rows.find((r) => r.textContent?.includes("feature/PBI-12-new"))!
    expect(within(gone).getByText(ja.gitDevBranchGone)).toBeInTheDocument()
    expect(within(live).queryByText(ja.gitDevBranchGone)).not.toBeInTheDocument()
  })

  it("marks a merge request linked by a developer (dev:write) as linked manually", async () => {
    linksBody = panel({
      links: [
        link({ kind: "mr", ref: "21", title: "!21", state: null, declared: true }),
        link({ kind: "mr", ref: "22", title: "Synced MR", state: "opened" }),
      ],
    })
    renderPanel("ja")
    const section = await screen.findByRole("region", { name: ja.gitDevTitle })
    const rows = [...section.querySelectorAll('[data-git-link="mr"]')] as HTMLElement[]
    const declared = rows.find((r) => r.textContent?.includes("!21"))!
    const synced = rows.find((r) => r.textContent?.includes("Synced MR"))!
    expect(within(declared).getByText(ja.gitDevDeclared)).toBeInTheDocument()
    expect(within(synced).queryByText(ja.gitDevDeclared)).not.toBeInTheDocument()
  })

  it("shows the latest 5 commits per repository with a show-more button", async () => {
    linksBody = panel({
      links: Array.from({ length: 7 }, (_, i) => link({ kind: "commit", title: `Commit ${i}`, occurredAt: `2026-10-0${i + 1}T00:00:00Z` })),
    })
    const user = userEvent.setup()
    renderPanel()
    await screen.findByText("Commit 6")
    expect(screen.queryByText("Commit 1")).not.toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: en.gitDevShowMore.replace("{count}", "2") }))
    expect(screen.getByText("Commit 0")).toBeInTheDocument()
  })

  it("copies the PBI key, the branch name and the git switch command", async () => {
    const user = userEvent.setup()
    const writeText = stubClipboard()
    renderPanel()
    await user.click(await screen.findByRole("button", { name: "Copy PBI-12" }))
    await user.click(screen.getByRole("button", { name: en.gitDevCopyBranch }))
    await user.click(screen.getByRole("button", { name: en.gitDevCopyCommand }))
    expect(writeText.mock.calls.map((c) => (c as unknown[])[0])).toEqual([
      "PBI-12",
      "feature/PBI-12-faster-login",
      "git switch -c feature/PBI-12-faster-login",
    ])
    expect(await screen.findAllByText(en.gitDevCopied)).not.toHaveLength(0)
  })

  it("hints how to link when nothing is linked yet", async () => {
    renderPanel()
    expect(await screen.findByText(en.gitDevEmpty)).toBeInTheDocument()
    expect(screen.getByText(en.gitDevEmptyHint.replace("{key}", "PBI-12"))).toBeInTheDocument()
  })

  it("asks a PO / SM to register repositories when there are none", async () => {
    linksBody = panel({ hasRepositories: false })
    renderPanel()
    expect(await screen.findByText(en.gitDevNoRepos)).toBeInTheDocument()
    expect(screen.queryByText(en.gitDevEmpty)).not.toBeInTheDocument()
  })

  it("syncs and refetches on 「今すぐ更新」", async () => {
    const user = userEvent.setup()
    renderPanel()
    await user.click(await screen.findByRole("button", { name: en.gitDevSync }))
    expect(await screen.findByText(en.gitDevSynced)).toBeInTheDocument()
    expect(calls).toContain("POST /api/projects/p1/git/sync")
    await waitFor(() => expect(linkGets()).toHaveLength(2))
  })

  it("explains a 429 (synced a moment ago) without an error", async () => {
    syncStatus = 429
    const user = userEvent.setup()
    renderPanel()
    await user.click(await screen.findByRole("button", { name: en.gitDevSync }))
    expect(await screen.findByText(en.gitDevSyncTooSoon)).toBeInTheDocument()
    expect(screen.queryByText(new RegExp(en.gitDevSyncFailed))).not.toBeInTheDocument()
    expect(linkGets()).toHaveLength(1)
  })

  it("reports repositories that could not be synced", async () => {
    syncBody = { results: [{ repositoryId: "r-web", ok: false, links: 0, error: "auth" }] }
    const user = userEvent.setup()
    renderPanel()
    await user.click(await screen.findByRole("button", { name: en.gitDevSync }))
    expect(await screen.findByText(en.gitDevSyncPartial)).toBeInTheDocument()
  })
})
