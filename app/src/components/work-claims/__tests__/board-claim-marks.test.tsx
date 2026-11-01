import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { screen, waitFor, within } from "@testing-library/react"
import { jsonResponse, renderWithProviders } from "@/components/__tests__/helpers"
import { ProjectTypeScope } from "@/lib/language-context"
import { getTranslations } from "@/lib/i18n"
import type { ProjectType } from "@/lib/project-type-labels"
import { TaskClaimMarks, WorkClaimsProvider } from "../work-claims-context"
import type { ScreenClaim } from "../claim-view"

const t = getTranslations("en")
const NOW = Date.now()
const at = (ms: number) => new Date(NOW + ms).toISOString()
const URL_ = "/api/projects/p1/dev/claims?sprintId=s1"

function c(over: Partial<ScreenClaim>): ScreenClaim {
  return {
    id: "c", pbi: { id: "b1", displayId: 1 }, task: { id: "k1", name: "API" }, user: { id: "u1", name: "Dev One" }, ai: false,
    branch: "feat/L4-PBI-1-login", startedAt: at(-7_200_000), heartbeatAt: at(-600_000), staleAt: at(3 * 3_600_000), stale: false, ...over,
  }
}

let claims: ScreenClaim[]
const urls: string[] = []

beforeEach(() => {
  urls.length = 0
  claims = []
  vi.stubGlobal("fetch", vi.fn(async (url: string) => (urls.push(String(url)), jsonResponse({ data: claims, staleAfterHours: 4, canModerate: false }))))
})
afterEach(() => vi.unstubAllGlobals())

function renderBoard(projectType: ProjectType = "software") {
  return renderWithProviders(
    <ProjectTypeScope projectType={projectType}>
      <WorkClaimsProvider projectId="p1" sprintId="s1">
        <ul>
          <li data-testid="card-k1"><TaskClaimMarks taskId="k1" pbiId="b1" /></li>
          <li data-testid="card-k2"><TaskClaimMarks taskId="k2" pbiId="b1" /></li>
          <li data-testid="card-k3"><TaskClaimMarks taskId="k3" pbiId="b2" /></li>
        </ul>
      </WorkClaimsProvider>
    </ProjectTypeScope>,
  )
}

const marks = (card: string) => within(screen.getByTestId(card)).queryAllByRole("listitem")

describe("board 担当中 marks", () => {
  it("one request for the whole sprint; task claims on their card, whole-PBI claims on every card of the PBI", async () => {
    claims = [c({ id: "a" }), c({ id: "w", task: null, user: { id: "u2", name: "Bea Ko" } })]
    renderBoard()
    await waitFor(() => expect(marks("card-k1")).toHaveLength(2))
    expect(marks("card-k2")).toHaveLength(1)
    expect(within(screen.getByTestId("card-k2")).getByText(t.workClaimWholePbi)).toBeInTheDocument()
    expect(marks("card-k3")).toHaveLength(0)
    expect(urls).toEqual([URL_])
  })

  it.each([
    ["active", at(3 * 3_600_000), false, null],
    ["staleSoon", at(20 * 60_000), false, t.workClaimStateStaleSoon],
    ["stale", at(-60_000), true, t.workClaimStateStale],
  ] as const)("state %s is written in words, not only color", async (state, staleAt, stale, word) => {
    claims = [c({ id: "a", staleAt, stale })]
    renderBoard()
    const card = screen.getByTestId("card-k1")
    await waitFor(() => expect(card.querySelector(`[data-claim-state="${state}"]`)).not.toBeNull())
    const label = t.workClaimMarkLabel.replace("{name}", "Dev One").replace("{state}", state === "active" ? t.workClaimStateActive : word!)
    expect(within(card).getByText(new RegExp(label.slice(0, label.indexOf("{time}")).replace(/[()]/g, "\\$&")))).toBeInTheDocument()
    if (word) expect(within(card).getByText(word)).toBeInTheDocument()
  })

  it("an AI claim carries the AI marker (and says so to screen readers); a person's claim does not", async () => {
    claims = [c({ id: "ai", ai: true }), c({ id: "me", ai: false, task: { id: "k2", name: "UI" } })]
    renderBoard()
    const card = screen.getByTestId("card-k1")
    await waitFor(() => expect(card.querySelector("[data-claim-ai]")).not.toBeNull())
    expect(within(card).getByText(/Dev One's AI is working on this/)).toBeInTheDocument()
    expect(screen.getByTestId("card-k2").querySelector("[data-claim-ai]")).toBeNull()
  })

  it("the branch is shown in software projects only", async () => {
    claims = [c({ id: "a" })]
    const { unmount } = renderBoard("software")
    await waitFor(() => expect(screen.getByTestId("card-k1").querySelector("[data-claim-branch]")).not.toBeNull())
    expect(screen.getAllByText("feat/L4-PBI-1-login").length).toBeGreaterThan(0)
    unmount()

    renderBoard("general")
    await waitFor(() => expect(marks("card-k1")).toHaveLength(1))
    expect(screen.getByTestId("card-k1").querySelector("[data-claim-branch]")).toBeNull()
    expect(screen.queryByText(/feat\/L4-PBI-1-login/)).toBeNull()
  })

  it("more than two claims on a card → two marks and '+n more'", async () => {
    claims = [c({ id: "a" }), c({ id: "b" }), c({ id: "d", task: null })]
    renderBoard()
    expect(await within(screen.getByTestId("card-k1")).findByText(t.workClaimMore.replace("{count}", "1"))).toBeInTheDocument()
  })

  it("renders nothing on error", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({ error: "x" }, 500)))
    renderBoard()
    await new Promise((r) => setTimeout(r, 20))
    expect(document.querySelector("[data-claim-marks]")).toBeNull()
  })

  it("W4: a card whose claim overlaps another active claim shows one warning line in words (who, which files)", async () => {
    const overlap = { claimId: "o1", user: { id: "u2", name: "Bea Ko" }, ai: true, pbi: { id: "b2", displayId: 2 }, paths: ["app/src/a.ts", "app/src/b.ts"], pathCount: 2 }
    claims = [c({ id: "a", overlaps: [overlap] }), c({ id: "x", task: { id: "k2", name: "UI" } })]
    renderBoard()
    const card = screen.getByTestId("card-k1")
    const line = await within(card).findByText(t.workClaimOverlap.replace("{name}", "Bea Ko").replace("{paths}", "app/src/a.ts, app/src/b.ts"))
    expect(line.closest("[data-claim-overlap]")).not.toBeNull()
    // Said to screen readers as a warning (the icon is decorative), and it is not one of the marks.
    expect(within(card).getByText(`${t.workClaimWarning}:`, { exact: false })).toHaveClass("sr-only")
    expect(card.querySelector("[data-claim-overlap] svg")?.getAttribute("aria-hidden")).toBe("true")
    expect(marks("card-k1")).toHaveLength(1)
    expect(screen.getByTestId("card-k2").querySelector("[data-claim-overlap]")).toBeNull()
  })

  it("W4: several overlaps → the first one and '+n more'; a stale claim shows none; many paths are cut with '+n more'", async () => {
    const o = (id: string, n: number) => ({ claimId: id, user: { id: id, name: `U ${id}` }, ai: false, pbi: { id: "b9", displayId: 9 }, paths: Array.from({ length: n }, (_, i) => `p${i}`), pathCount: n + 4 })
    claims = [c({ id: "a", overlaps: [o("o1", 5), o("o2", 1)] }), c({ id: "s", task: { id: "k2", name: "UI" }, stale: true, staleAt: at(-60_000), overlaps: [o("o3", 1)] })]
    renderBoard()
    const card = screen.getByTestId("card-k1")
    await within(card).findByText(t.workClaimOverlap.replace("{name}", "U o1").replace("{paths}", `p0, p1, p2 ${t.workClaimMore.replace("{count}", "6")}`))
    expect(within(card).getByText(t.workClaimMore.replace("{count}", "1"))).toBeInTheDocument()
    expect(card.querySelectorAll("[data-claim-overlap]")).toHaveLength(1)
    await waitFor(() => expect(marks("card-k2")).toHaveLength(1))
    expect(screen.getByTestId("card-k2").querySelector("[data-claim-overlap]")).toBeNull()
  })

  it("W4: Japanese wording follows the plan (〇〇さんの作業と範囲が重なっています: <paths>)", () => {
    const ja = getTranslations("ja")
    expect(ja.workClaimOverlap.replace("{name}", "山田").replace("{paths}", "app/x")).toBe("山田さんの作業と範囲が重なっています: app/x")
    expect(getTranslations("id").workClaimOverlap).toContain("{name}")
  })
})
