import { afterEach, describe, expect, it, vi } from "vitest"
import { screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { jsonResponse, renderWithProviders, stubFetch, tr } from "@/app/__tests__/test-utils"
import type { TranslationStats } from "@/lib/translation/types"
import { TranslationQueuePanel } from "../translations/translation-queue-panel"

const t = tr("ja")

function stats(over: Partial<TranslationStats> = {}): TranslationStats {
  return {
    pending: 3,
    running: 1,
    done: 10,
    failed: 2,
    lastError: null,
    workerIdle: true,
    workerEnabled: true,
    workerMode: "inprocess",
    workerLocation: "this-process",
    workerNote: "",
    highActive: 0,
    backgroundActive: 0,
    ollamaReachable: true,
    model: "qwen:7b",
    ...over,
  } as TranslationStats
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe("TranslationQueuePanel", () => {
  it("shows placeholders before stats arrive, then counters and worker state", async () => {
    stubFetch([{ match: "/api/admin/translations/stats", respond: () => jsonResponse(stats()) }])
    renderWithProviders(<TranslationQueuePanel />)
    expect(screen.getAllByText("—").length).toBeGreaterThan(0)
    expect(screen.getByRole("button", { name: t.translationsRetryFailed })).toBeDisabled()
    expect(await screen.findByText("qwen:7b")).toBeInTheDocument()
    expect(screen.getByText("10")).toBeInTheDocument()
    expect(screen.getByText(t.translationsWorkerIdle)).toBeInTheDocument()
    expect(screen.getByText(t.translationsOllamaOk)).toBeInTheDocument()
    expect(screen.getByText(t.translationsNoError)).toBeInTheDocument()
  })

  it.each([
    [{ workerLocation: "off" }, "translationsWorkerDisabled"],
    [{ workerLocation: "separate-process" }, "translationsWorkerExternal"],
    [{ workerLocation: "not-started" }, "translationsWorkerNotStarted"],
    [{ backgroundActive: 2 }, "translationsBackgroundActive"],
    [{ workerIdle: false }, "translationsWorkerBusy"],
  ] as const)("labels worker state %o", async (over, key) => {
    stubFetch([{ match: "/api/admin/translations/stats", respond: () => jsonResponse(stats(over as Partial<TranslationStats>)) }])
    renderWithProviders(<TranslationQueuePanel />)
    expect(await screen.findByText(t[key])).toBeInTheDocument()
  })

  it("shows the external-worker note, unreachable Ollama and the last error (en)", async () => {
    const te = tr("en")
    stubFetch([
      {
        match: "/api/admin/translations/stats",
        respond: () =>
          jsonResponse(
            stats({
              workerLocation: "separate-process",
              ollamaReachable: false,
              failed: 0,
              lastError: { entityType: "project", entityId: "p1", field: "name", error: "timeout", at: "2026-09-01T00:00:00Z" },
            }),
          ),
      },
    ])
    renderWithProviders(<TranslationQueuePanel />, { language: "en" })
    expect(await screen.findByText(te.translationsWorkerExternalNote)).toBeInTheDocument()
    expect(screen.getByText(te.translationsOllamaNg)).toBeInTheDocument()
    expect(screen.getByText("timeout")).toBeInTheDocument()
    expect(screen.getByText(/project\/name/)).toBeInTheDocument()
    expect(screen.getByRole("button", { name: te.translationsRetryFailed })).toBeDisabled()
  })

  it("retries failed items, toasts the count and refetches", async () => {
    const fetchMock = stubFetch([
      { match: "/api/admin/translations/stats", respond: () => jsonResponse(stats()) },
      { match: "/api/admin/translations/retry-failed", method: "POST", respond: () => jsonResponse({ requeued: 2 }) },
    ])
    const user = userEvent.setup()
    renderWithProviders(<TranslationQueuePanel />)
    await screen.findByText("qwen:7b")
    await user.click(screen.getByRole("button", { name: t.translationsRetryFailed }))
    expect(await screen.findByText(t.translationsRetried.replace("{count}", "2"))).toBeInTheDocument()
    await waitFor(() =>
      expect(fetchMock.mock.calls.filter((c) => String(c[0]).includes("stats")).length).toBeGreaterThanOrEqual(2),
    )
  })

  it("toasts when retry fails and shows polling errors inline", async () => {
    let statsOk = true
    stubFetch([
      { match: "/api/admin/translations/stats", respond: () => (statsOk ? jsonResponse(stats()) : jsonResponse({ error: "stats down" }, 503)) },
      { match: "/api/admin/translations/retry-failed", method: "POST", respond: () => jsonResponse({ error: "retry broke" }, 500) },
    ])
    const user = userEvent.setup()
    renderWithProviders(<TranslationQueuePanel />)
    await screen.findByText("qwen:7b")
    await user.click(screen.getByRole("button", { name: t.translationsRetryFailed }))
    expect(await screen.findByText("retry broke")).toBeInTheDocument()

    statsOk = false
    await user.click(screen.getByRole("button", { name: t.translationsRefresh }))
    expect(await screen.findByText("stats down")).toBeInTheDocument()
  })

  it("auto-refreshes every 5 seconds", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const fetchMock = stubFetch([{ match: "/api/admin/translations/stats", respond: () => jsonResponse(stats()) }])
    renderWithProviders(<TranslationQueuePanel />)
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    await vi.advanceTimersByTimeAsync(5_000)
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))
  })
})
