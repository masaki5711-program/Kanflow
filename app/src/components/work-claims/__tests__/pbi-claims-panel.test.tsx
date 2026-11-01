import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { jsonResponse, renderWithProviders, stubLayout } from "@/components/__tests__/helpers"
import { ProjectTypeScope } from "@/lib/language-context"
import { getTranslations } from "@/lib/i18n"
import type { ProjectType } from "@/lib/project-type-labels"
import { PbiClaimsPanel } from "../pbi-claims-panel"
import type { ScreenClaim } from "../claim-view"

stubLayout()

const t = getTranslations("en")
const NOW = Date.now()
const at = (ms: number) => new Date(NOW + ms).toISOString()
const LIST_URL = "/api/projects/p1/dev/claims?pbi=b1"

function c(over: Partial<ScreenClaim>): ScreenClaim {
  return {
    id: "c1", pbi: { id: "b1", displayId: 1 }, task: { id: "k1", name: "API" }, user: { id: "u2", name: "Bea Ko" }, ai: true,
    branch: "feat/L4-PBI-1-login", startedAt: at(-7_200_000), heartbeatAt: at(-600_000), staleAt: at(3 * 3_600_000), stale: false, ...over,
  }
}

let claims: ScreenClaim[]
let canModerate: boolean
let outsideScope: unknown[]
const calls: Array<{ method: string; url: string }> = []

beforeEach(() => {
  calls.length = 0
  claims = [c({}), c({ id: "c2", task: null, ai: false, user: { id: "u3", name: "Cy Do" }, stale: true, staleAt: at(-60_000) })]
  canModerate = false
  outsideScope = []
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    const method = (init?.method ?? "GET").toUpperCase()
    calls.push({ method, url: String(url) })
    if (method === "POST") return jsonResponse({ claim: { id: "c1", releasedAt: at(0), releaseReason: "moderator" } })
    return jsonResponse({ data: claims, staleAfterHours: 4, canModerate, outsideScope })
  }))
})
afterEach(() => vi.unstubAllGlobals())

function renderPanel(projectType: ProjectType = "software") {
  return renderWithProviders(
    <ProjectTypeScope projectType={projectType}>
      <PbiClaimsPanel projectId="p1" pbiId="b1" />
    </ProjectTypeScope>,
  )
}

describe("PBI 担当中 panel", () => {
  it("lists person, AI marker, task / whole PBI, branch, since, last seen and the expired flag", async () => {
    renderPanel()
    const panel = await screen.findByRole("region", { name: t.workClaimPanelTitle })
    const rows = within(panel).getAllByRole("listitem")
    expect(rows).toHaveLength(2)
    expect(within(rows[0]).getByText("Bea Ko")).toBeInTheDocument()
    expect(within(rows[0]).getByText(t.workClaimAiLabel)).toBeInTheDocument()
    expect(within(rows[0]).getByText("API")).toBeInTheDocument()
    expect(within(rows[0]).getByText("feat/L4-PBI-1-login")).toBeInTheDocument()
    expect(within(rows[0]).getByText(t.workClaimStateActive)).toBeInTheDocument()
    expect(within(rows[0]).getByText(`${t.workClaimSince}:`)).toBeInTheDocument()
    expect(within(rows[0]).getByText(`${t.workClaimLastSeen}:`)).toBeInTheDocument()
    expect(within(rows[1]).getByText(t.workClaimWholePbi)).toBeInTheDocument()
    expect(within(rows[1]).getByText(t.workClaimStateStale)).toBeInTheDocument()
    expect(within(rows[1]).queryByText(t.workClaimAiLabel)).toBeNull()
    expect(calls).toEqual([{ method: "GET", url: LIST_URL }])
  })

  it("read-only for members who may not moderate: no release button", async () => {
    renderPanel()
    await screen.findByRole("region", { name: t.workClaimPanelTitle })
    expect(screen.queryByRole("button", { name: /Release/ })).toBeNull()
  })

  it("PO / SM / admin (canModerate) release after a confirm; cancelling sends nothing", async () => {
    canModerate = true
    const user = userEvent.setup()
    renderPanel()
    const button = await screen.findByRole("button", { name: t.workClaimReleaseLabel.replace("{name}", "Bea Ko") })

    await user.click(button)
    const dialog = await screen.findByRole("alertdialog")
    expect(within(dialog).getByText(t.workClaimReleaseConfirmMessage.replace("{name}", "Bea Ko"))).toBeInTheDocument()
    await user.click(within(dialog).getByRole("button", { name: /Cancel/i }))
    expect(calls.filter((x) => x.method === "POST")).toHaveLength(0)

    await user.click(button)
    await user.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: t.workClaimRelease }))
    await waitFor(() => expect(calls.filter((x) => x.method === "POST")).toEqual([{ method: "POST", url: "/api/projects/p1/dev/claims/c1/release" }]))
    await waitFor(() => expect(calls.filter((x) => x.method === "GET")).toHaveLength(2))
    expect(await screen.findByText(t.workClaimReleased)).toBeInTheDocument()
  })

  it("non-software projects: no branch; nothing at all when nobody works on the PBI", async () => {
    const { unmount } = renderPanel("general")
    await screen.findByRole("region", { name: t.workClaimPanelTitle })
    expect(screen.queryByText("feat/L4-PBI-1-login")).toBeNull()
    unmount()

    claims = []
    renderPanel("general")
    await waitFor(() => expect(calls.filter((x) => x.method === "GET")).toHaveLength(2))
    expect(document.querySelector("[data-pbi-claims-panel]")).toBeNull()
  })

  it("software projects say so when nobody works on the PBI", async () => {
    claims = []
    renderPanel()
    expect(await screen.findByText(t.workClaimEmpty)).toBeInTheDocument()
  })

  it("a failed read says so (no silent blank)", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({ error: "x" }, 500)))
    renderPanel()
    expect((await screen.findByText(t.workClaimLoadFailed)).closest("[role=alert]")).not.toBeNull()
  })

  it("W4: shows the declared scope (software) and one warning line per overlapping claim, in words", async () => {
    const overlap = { claimId: "o1", user: { id: "u9", name: "Cy Do" }, ai: false, pbi: { id: "b2", displayId: 2 }, paths: ["app/src/x.ts"], pathCount: 1 }
    claims = [c({ scope: [{ kind: "module", value: "forge-auth" }, { kind: "path", value: "app/src" }], scopeCount: 5, overlaps: [overlap] })]
    renderPanel()
    const panel = await screen.findByRole("region", { name: t.workClaimPanelTitle })
    const scope = panel.querySelector("[data-claim-scope]")
    expect(scope?.textContent).toBe(`${t.workClaimScope}: forge-auth, app/src ${t.workClaimMore.replace("{count}", "3")}`)
    expect(within(panel).getByText(t.workClaimOverlap.replace("{name}", "Cy Do").replace("{paths}", "app/src/x.ts"))).toBeInTheDocument()
  })

  it("W4: an open MR that changes files outside the declared scope is one line, linking to the MR", async () => {
    outsideScope = [{ linkId: "l1", ref: "7", title: "Login API", url: "https://gitlab.example/g/r/-/merge_requests/7", repository: "api", count: 4, paths: ["a.ts", "b.ts", "c.ts", "d.ts"], checkedAt: null }]
    renderPanel()
    const text = t.workClaimOutsideScope.replace("{mr}", "!7").replace("{count}", "4").replace("{paths}", `a.ts, b.ts, c.ts ${t.workClaimMore.replace("{count}", "1")}`)
    const line = await screen.findByText(text)
    expect(line.closest("a")?.getAttribute("href")).toBe("https://gitlab.example/g/r/-/merge_requests/7")
    expect(line.closest("a")?.getAttribute("rel")).toContain("noopener")
  })

  it("W4: a non-https MR URL is shown without a link", async () => {
    outsideScope = [{ linkId: "l1", ref: "7", title: "x", url: "javascript:alert(1)", repository: "api", count: 1, paths: ["a.ts"], checkedAt: null }]
    renderPanel()
    const line = await screen.findByText(t.workClaimOutsideScope.replace("{mr}", "!7").replace("{count}", "1").replace("{paths}", "a.ts"))
    expect(line.closest("a")).toBeNull()
  })

  it("W4: an expired claim shows no overlap warning; no scope line outside software projects", async () => {
    const overlap = { claimId: "o1", user: { id: "u9", name: "Cy Do" }, ai: false, pbi: { id: "b2", displayId: 2 }, paths: ["x"], pathCount: 1 }
    claims = [c({ stale: true, staleAt: at(-60_000), overlaps: [overlap], scope: [{ kind: "path", value: "x" }] })]
    renderPanel("general")
    await screen.findByRole("region", { name: t.workClaimPanelTitle })
    expect(document.querySelector("[data-claim-overlap]")).toBeNull()
    expect(document.querySelector("[data-claim-scope]")).toBeNull()
  })
})
