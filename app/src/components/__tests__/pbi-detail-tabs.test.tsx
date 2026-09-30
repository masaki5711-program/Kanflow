import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { getTranslations } from "@/lib/i18n"
import { getProjectTypeLabels } from "@/lib/project-type-labels"
import { jsonResponse, renderWithProviders } from "./helpers"
import { PbiDetailTabs, formatPbiValue, pbiFieldLabels } from "../pbi-detail-tabs"

const t = getTranslations("en")
const pt = getProjectTypeLabels("software", "en")

let routes: Record<string, () => Response>
beforeEach(() => {
  routes = {
    "/api/projects/p1/comments/counts?entityType=pbi&ids=b1": () => jsonResponse({ counts: { b1: 2 } }),
    "/api/projects/p1/comments?entityType=pbi&entityId=b1": () => jsonResponse({ items: [], nextCursor: null }),
    "/api/projects/p1/members": () => jsonResponse([]),
    "/api/projects/p1/activity/pbi/b1": () => jsonResponse({ items: [], nextCursor: null }),
  }
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => routes[String(input)]?.() ?? jsonResponse({ error: "no route" }, 404)))
})
afterEach(() => vi.unstubAllGlobals())

const selected = () => screen.getByRole("tab", { selected: true })

describe("PbiDetailTabs", () => {
  it("shows details first with a comment-count badge; loads other tabs on demand", async () => {
    renderWithProviders(<PbiDetailTabs projectId="p1" pbiId="b1" details={<p>DETAILS</p>} />)
    expect(selected()).toHaveTextContent(t.commentsTabDetails)
    expect(screen.getByText("DETAILS")).toBeVisible()
    expect(await screen.findByText(t.commentsCountLabel.replace("{count}", "2"))).toBeInTheDocument()
    const fetched = () => vi.mocked(fetch).mock.calls.map((c) => String(c[0]))
    expect(fetched().some((u) => u.includes("/activity/"))).toBe(false)

    await userEvent.click(screen.getByRole("tab", { name: new RegExp(t.commentsTitle) }))
    expect(await screen.findByText(t.commentsEmptyTitle)).toBeInTheDocument()
    expect(screen.getByText("DETAILS")).not.toBeVisible()

    await userEvent.click(screen.getByRole("tab", { name: t.historyTitle }))
    expect(await screen.findByText(t.historyEmpty)).toBeInTheDocument()
  })

  it("supports arrow / Home / End keys", async () => {
    renderWithProviders(<PbiDetailTabs projectId="p1" pbiId="b1" details={<p>DETAILS</p>} />)
    screen.getByRole("tab", { name: t.commentsTabDetails }).focus()
    await userEvent.keyboard("{ArrowRight}")
    expect(selected()).toHaveFocus()
    expect(selected()).toHaveTextContent(t.commentsTitle)
    await userEvent.keyboard("{End}")
    expect(selected()).toHaveTextContent(t.historyTitle)
    await userEvent.keyboard("{ArrowRight}")
    expect(selected()).toHaveTextContent(t.commentsTabDetails)
    await userEvent.keyboard("{ArrowLeft}")
    expect(selected()).toHaveTextContent(t.historyTitle)
    await userEvent.keyboard("{Home}")
    expect(selected()).toHaveTextContent(t.commentsTabDetails)
    await userEvent.keyboard("x")
    expect(selected()).toHaveTextContent(t.commentsTabDetails)
  })

  it("field labels and value formatting", () => {
    expect(pbiFieldLabels(t, pt).status).toBe(t.sprintStatus)
    expect(formatPbiValue(t, "status", "ready")).toBe(t.backlogStatusReady)
    expect(formatPbiValue(t, "status", "not_ready")).toBe(t.backlogStatusNotReady)
    expect(formatPbiValue(t, "status", "completed")).toBe(t.backlogStatusCompleted)
    expect(formatPbiValue(t, "status", "other")).toBe("other")
    expect(formatPbiValue(t, "productGoalId", "g1")).toBe(t.historyChanged)
    expect(formatPbiValue(t, "workloadScore", 5)).toBe("5")
  })
})
