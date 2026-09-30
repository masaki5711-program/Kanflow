import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { act, render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { AIResultModal, MODEL_LOAD_HINT_MS } from "./ai-result-modal"
import { ReportDocument, normalizeStructured, parseStructured } from "./structured-report-document"
import { AppProviders, stubLayout } from "./__tests__/helpers"
import { getTranslations } from "@/lib/i18n"
import type { StructuredReport } from "@/lib/report-tool"

stubLayout()
const t = getTranslations("en")

function streamResponse(chunks: string[], status = 200): Response {
  const enc = new TextEncoder()
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      chunks.forEach((c) => controller.enqueue(enc.encode(c)))
      controller.close()
    },
  })
  return new Response(body, { status })
}

const REPORT: StructuredReport = {
  headline: "Sprint at risk",
  overview: "Velocity dropped.",
  followUps: [{ status: "improved", item: "Old issue", note: "better" }],
  findings: [
    { severity: "critical", title: "Blocked PBI", detail: "3 days" },
    { severity: "warning", title: "Scope creep", detail: null },
  ],
  metrics: [{ label: "Velocity", value: "12" }],
  causes: ["Holidays"],
  actions: [{ priority: "high", action: "Split PBI" }],
  outlook: "Recoverable",
}

beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn()
})

let fetchMock: ReturnType<typeof vi.fn>
beforeEach(() => {
  fetchMock = vi.fn()
  vi.stubGlobal("fetch", fetchMock)
})
afterEach(() => {
  vi.unstubAllGlobals()
})

function renderModal(props: Partial<React.ComponentProps<typeof AIResultModal>> = {}) {
  const onClose = vi.fn()
  render(
    <AppProviders>
      <AIResultModal title="INVEST" fetchUrl="/api/ai" fetchBody={{ lang: "en" }} onClose={onClose} {...props} />
    </AppProviders>,
  )
  return { onClose }
}

describe("AIResultModal", () => {
  it("POSTs the body and streams plain text, then shows the disclaimer and footer", async () => {
    fetchMock.mockResolvedValue(streamResponse(["Hello ", "world"]))
    const footer = vi.fn((text: string, done: boolean) => (done ? <span>done:{text}</span> : null))
    renderModal({ footer })
    const dialog = screen.getByRole("dialog")
    expect(within(dialog).getByRole("status")).toHaveTextContent(t.aiThinking)
    expect(await screen.findByText("Hello world", { selector: "div" })).toBeInTheDocument()
    await waitFor(() => expect(screen.getByText(t.aiResultDisclaimer)).toBeInTheDocument())
    expect(screen.getByText("done:Hello world")).toBeInTheDocument()
    expect(within(dialog).getByRole("status")).toHaveTextContent(t.aiReportGenerationDone)
    expect(fetchMock).toHaveBeenCalledWith("/api/ai", expect.objectContaining({ method: "POST", body: '{"lang":"en"}' }))
  })

  it("shows a failure alert for non-OK responses", async () => {
    fetchMock.mockResolvedValue(new Response("nope", { status: 500 }))
    renderModal()
    const alert = await within(screen.getByRole("dialog")).findByRole("alert")
    expect(alert).toHaveTextContent(t.aiFailed)
  })

  it("403: one localized 'no permission' message, no retry (F-07)", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ error: "Forbidden", code: "FORBIDDEN" }), { status: 403 }))
    renderModal()
    const dialog = screen.getByRole("dialog")
    const alert = await within(dialog).findByRole("alert")
    expect(alert).toHaveTextContent(t.apiErrForbidden)
    expect(within(dialog).queryByText(t.aiFailed)).not.toBeInTheDocument()
    expect(within(dialog).getAllByText(t.apiErrForbidden)).toHaveLength(1)
    expect(within(dialog).queryByRole("button", { name: t.errorRetry })).not.toBeInTheDocument()
  })

  it("copies the text and toasts success; toasts failure when clipboard rejects", async () => {
    fetchMock.mockResolvedValue(streamResponse(["copy me"]))
    const writeText = vi.fn().mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error("x"))
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true })
    renderModal()
    await screen.findByText(t.aiResultDisclaimer)
    const copy = screen.getByRole("button", { name: t.aiCopy })
    await userEvent.click(copy)
    expect(writeText).toHaveBeenCalledWith("copy me")
    expect(await screen.findByText(t.aiReportCopied)).toBeInTheDocument()
    await userEvent.click(copy)
    expect(await screen.findByText(t.aiReportCopyFailed)).toBeInTheDocument()
  })

  it("renders a structured report as it streams and copies it as markdown", async () => {
    const json = JSON.stringify(REPORT)
    fetchMock.mockResolvedValue(streamResponse([json.slice(0, 40), json.slice(40)]))
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true })
    renderModal({ structured: true, triggerLabel: "Manual" })
    expect(await screen.findByText("Sprint at risk")).toBeInTheDocument()
    await screen.findByText(t.aiResultDisclaimer)
    expect(screen.getByText("Manual")).toBeInTheDocument()
    await userEvent.click(screen.getByRole("button", { name: t.aiCopy }))
    expect(writeText.mock.calls[0][0]).toContain("Sprint at risk")
    expect(writeText.mock.calls[0][0]).not.toContain('"headline"')
  })

  it("falls back to the raw text once a structured stream ends without a valid report", async () => {
    fetchMock.mockResolvedValue(streamResponse(["not json"]))
    renderModal({ structured: true })
    await screen.findByText(t.aiResultDisclaimer)
    expect(screen.getByText("not json")).toBeInTheDocument()
  })

  it("offers Retry after a failure and streams on the second attempt", async () => {
    fetchMock
      .mockResolvedValueOnce(new Response("nope", { status: 500 }))
      .mockResolvedValueOnce(streamResponse(["second try"]))
    renderModal()
    const dialog = screen.getByRole("dialog")
    await within(dialog).findByRole("alert")
    await userEvent.click(within(dialog).getByRole("button", { name: t.errorRetry }))
    expect(await screen.findByText("second try", { selector: "div" })).toBeInTheDocument()
    await waitFor(() => expect(screen.getByText(t.aiResultDisclaimer)).toBeInTheDocument())
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it("cancels a running request (aborts the fetch) and can retry", async () => {
    let signal: AbortSignal | undefined
    fetchMock.mockImplementationOnce((_url: string, init: RequestInit) => {
      signal = init.signal ?? undefined
      return new Promise((_resolve, reject) => {
        signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")))
      })
    })
    fetchMock.mockResolvedValueOnce(streamResponse(["again"]))
    renderModal()
    const dialog = screen.getByRole("dialog")
    await userEvent.click(within(dialog).getByRole("button", { name: t.aiCancel }))
    expect(signal?.aborted).toBe(true)
    expect(within(dialog).getByRole("status")).toHaveTextContent(t.aiCancelled)
    expect(within(dialog).queryByRole("button", { name: t.aiCancel })).not.toBeInTheDocument()
    expect(within(dialog).queryByRole("alert")).not.toBeInTheDocument()

    await userEvent.click(within(dialog).getByRole("button", { name: t.errorRetry }))
    expect(await screen.findByText("again", { selector: "div" })).toBeInTheDocument()
  })

  it("says the model is loading when no token arrives for a few seconds", () => {
    vi.useFakeTimers()
    try {
      fetchMock.mockReturnValue(new Promise(() => {}))
      renderModal()
      const status = within(screen.getByRole("dialog")).getByRole("status")
      expect(status).toHaveTextContent(t.aiThinking)
      act(() => {
        vi.advanceTimersByTime(MODEL_LOAD_HINT_MS - 1)
      })
      expect(status).toHaveTextContent(t.aiThinking)
      act(() => {
        vi.advanceTimersByTime(1)
      })
      expect(status).toHaveTextContent(t.aiLoadingModel)
      expect(screen.getAllByText(t.aiLoadingModel).length).toBeGreaterThan(1)
    } finally {
      vi.useRealTimers()
    }
  })

  it("closes via the footer Close button", async () => {
    fetchMock.mockReturnValue(new Promise(() => {}))
    const { onClose } = renderModal()
    const closes = screen.getAllByRole("button", { name: t.close })
    await userEvent.click(closes[closes.length - 1])
    expect(onClose).toHaveBeenCalledWith("request")
  })
})

describe("structured report helpers", () => {
  it("parseStructured returns null for empty/invalid input and normalizes loose data", () => {
    expect(parseStructured(null)).toBeNull()
    expect(parseStructured("{bad")).toBeNull()
    expect(parseStructured(JSON.stringify({ headline: 1 }))).toBeNull()
    const r = normalizeStructured({
      headline: "h",
      overview: "o",
      followUps: [{ status: "weird", item: "i" }, { item: 3 }],
      findings: [{ severity: "boom", title: "t" }, null],
      metrics: [{ label: "l", value: "v" }, { label: "x" }],
      causes: ["c", 5],
      actions: [{ priority: "zzz", action: "a" }],
    })
    expect(r).toEqual({
      headline: "h",
      overview: "o",
      followUps: [{ status: "unresolved", item: "i", note: null }],
      findings: [{ severity: "info", title: "t", detail: null }],
      metrics: [{ label: "l", value: "v" }],
      causes: ["c"],
      actions: [{ priority: "medium", action: "a" }],
      outlook: null,
    })
  })

  it("ReportDocument renders numbered sections and the overall severity", () => {
    render(<ReportDocument report={REPORT} trigger="Daily" createdAt="today" t={t} />)
    expect(screen.getByText(t.aiReportDocTitle)).toBeInTheDocument()
    expect(screen.getAllByText(t.aiReportSeverityCritical).length).toBeGreaterThanOrEqual(2)
    expect(screen.getByText(t.aiReportFollowUpImproved)).toBeInTheDocument()
    expect(screen.getByText(t.aiReportPriorityHigh)).toBeInTheDocument()
    expect(screen.getByRole("table")).toHaveTextContent("Velocity12")
    expect(screen.getByText("Holidays")).toBeInTheDocument()
    expect(screen.getByText("Recoverable")).toBeInTheDocument()
    const headings = screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent)
    expect(headings[0]).toBe(`1.${t.aiReportSectionOverview}`)
    expect(headings).toHaveLength(7)
  })

  it("ReportDocument omits empty sections and shows info severity by default", () => {
    const minimal = normalizeStructured({ headline: "h", overview: "o" })!
    render(
      <ReportDocument
        report={{
          ...minimal,
          followUps: [
            { status: "resolved", item: "r", note: null },
            { status: "unresolved", item: "u", note: null },
          ],
          findings: [{ severity: "info", title: "fine", detail: null }],
          actions: [
            { priority: "medium", action: "m" },
            { priority: "low", action: "l" },
          ],
        }}
        trigger="x"
        createdAt="y"
        t={t}
        docTitle="Custom"
      />,
    )
    expect(screen.getByText("Custom")).toBeInTheDocument()
    expect(screen.getAllByText(t.aiReportSeverityInfo).length).toBeGreaterThanOrEqual(2)
    expect(screen.getByText(t.aiReportFollowUpResolved)).toBeInTheDocument()
    expect(screen.getByText(t.aiReportFollowUpUnresolved)).toBeInTheDocument()
    expect(screen.getByText(t.aiReportPriorityLow)).toBeInTheDocument()
    expect(screen.queryByRole("table")).not.toBeInTheDocument()
  })

  it("ReportDocument shows warning when the worst finding is a warning", () => {
    render(
      <ReportDocument
        report={{ ...normalizeStructured({ headline: "h", overview: "o" })!, findings: [{ severity: "warning", title: "w", detail: "d" }] }}
        trigger="x"
        createdAt="y"
        t={t}
      />,
    )
    expect(screen.getAllByText(t.aiReportSeverityWarning)).toHaveLength(2)
  })
})
