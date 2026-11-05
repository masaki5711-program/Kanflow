import { afterEach, describe, expect, it, vi } from "vitest"
import { screen, waitFor, within } from "@testing-library/react"
import { jsonResponse, renderWithProviders, stubFetch, tr } from "@/app/__tests__/test-utils"
import { EstimateExplanation } from "../estimate-explanation"

/** The AI part of the estimate card (plan 12 E6). Synthetic texts; the API is stubbed. */
const t = tr("ja")
const TEXT = { ja: "設計レビューは長めに見ています。", en: "The design review is planned longer.", id: "Tinjauan desain lebih lama." }
const URL = "/api/projects/p1/plan/estimate-runs/r1/explanation"
const aiStatus = () => within(screen.getByRole("group", { name: t.pesAiTitle })).getByRole("status")

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("EstimateExplanation", () => {
  it("shows the stored text in the reader's language, with the note that the table is what counts", () => {
    renderWithProviders(<EstimateExplanation projectId="p1" runId="r1" explanation={{ state: "ready", text: TEXT }} assist={{ candidates: "applied", rejected: 2 }} />)
    expect(screen.getByText(TEXT.ja)).toBeInTheDocument()
    expect(screen.getByText(t.pesAiNote)).toBeInTheDocument()
    expect(screen.getByText(t.pesAiCandidates.replace("{n}", "2"))).toBeInTheDocument()
    expect(screen.queryByText(t.pesAiNone)).not.toBeInTheDocument()
  })

  it("asks once for a pending text, announces the wait, then shows it", async () => {
    const fetchMock = stubFetch([{ match: URL, method: "POST", respond: () => jsonResponse({ explanation: { state: "ready", text: TEXT } }) }])
    renderWithProviders(<EstimateExplanation projectId="p1" runId="r1" explanation={{ state: "pending" }} assist={{ candidates: "no_candidates", rejected: 0 }} />)
    expect(aiStatus()).toHaveTextContent(t.pesAiWriting)
    expect(await screen.findByText(TEXT.ja)).toBeInTheDocument()
    expect(fetchMock.mock.calls.filter(([u]) => String(u).includes(URL))).toHaveLength(1)
  })

  it("a reader who may not see every source gets one line instead of the text", () => {
    renderWithProviders(<EstimateExplanation projectId="p1" runId="r1" explanation={{ state: "hidden" }} assist={undefined} />)
    expect(aiStatus()).toHaveTextContent(t.pesAiHidden)
  })

  it("says there was no AI assistance when the LLM failed (explanation request or candidate review)", async () => {
    stubFetch([{ match: URL, method: "POST", respond: () => jsonResponse({ error: "x" }, 500) }])
    renderWithProviders(<EstimateExplanation projectId="p1" runId="r1" explanation={{ state: "pending" }} assist={undefined} />)
    await waitFor(() => expect(screen.getByText(t.pesAiNone)).toBeInTheDocument())
  })

  it("renders nothing when the assistance is off and nothing was done", () => {
    const first = renderWithProviders(<EstimateExplanation projectId="p1" runId="r1" explanation={{ state: "off" }} assist={{ candidates: "off", rejected: 0 }} />)
    expect(screen.queryByRole("group", { name: t.pesAiTitle })).not.toBeInTheDocument()
    first.unmount()
    renderWithProviders(<EstimateExplanation projectId="p1" runId="r1" explanation={{ state: "off" }} assist={{ candidates: "timeout", rejected: 0 }} />)
    expect(screen.getByText(t.pesAiNone)).toBeInTheDocument()
  })
})
