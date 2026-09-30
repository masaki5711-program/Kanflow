import { cloneElement, isValidElement, type ReactNode } from "react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { act, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { jsonResponse, renderWithProviders, stubFetch, tr } from "@/app/__tests__/test-utils"
import type { MetricsResponse } from "../metrics/metrics-format"

// jsdom has no layout: give ResponsiveContainer a fixed size so charts render.
vi.mock("recharts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("recharts")>()
  return {
    ...actual,
    ResponsiveContainer: ({ children }: { children: ReactNode }) =>
      isValidElement(children) ? cloneElement(children as React.ReactElement<{ width: number; height: number }>, { width: 400, height: 220 }) : null,
  }
})

const { MetricsDashboard, METRICS_REFRESH_MS } = await import("../metrics/metrics-dashboard")

const t = tr("ja")
const URL = "/api/admin/metrics"

function payload(over: Partial<MetricsResponse> = {}): MetricsResponse {
  const window = { minutes: 5, count: 200, errors: 4, errorRate: 0.02, perMinute: 40, p50: 30, p95: 1500 }
  return {
    current: {
      takenAt: "2026-10-05T03:00:00.000Z",
      process: { pid: 4242, uptimeSec: 3 * 3600 + 5 * 60, rssMb: 300, heapUsedMb: 120 },
      http: {
        last5m: window,
        last60m: { ...window, minutes: 60 },
        totals: { count: 1000, errors: 10 },
        routes: [
          { route: "/api/projects/:id/chat", method: "POST", count: 12, errors: 1, clientErrors: 0, p50: 900, p95: 4200, maxMs: 9000, avgMs: 1200 },
          { route: "/api/projects/:id/backlog", method: "GET", count: 120, errors: 0, clientErrors: 2, p50: 20, p95: 80, maxMs: 300, avgMs: 25 },
        ],
      },
      ai: {
        gate: { highActive: 1, backgroundActive: 0 },
        ollama: { max: 1, active: 1, queuedUser: 2, queuedBackground: 1 },
        wait5m: { count: 3, p50: 100, p95: 2500, maxMs: 2500 },
        jobs: { queued: 2, running: 1, oldestQueuedAgeSec: 30 },
      },
      translation: { pending: 17, running: 1, failed: 0, oldestPendingAgeSec: 600 },
      worker: { status: "stale", heartbeatAgeSec: 400 },
      db: { ok: true, latencyMs: 1.4 },
    },
    history: [
      {
        takenAt: "2026-10-05T02:55:00.000Z", pid: 4242, rpm: 30, requests: 150, errors: 0, errorRate: 0, p50: 20, p95: 90,
        aiActive: 1, aiQueued: 0, aiWaitP95: null, aiJobsQueued: 0, aiJobsRunning: 0, translationPending: 10,
        translationOldestSec: 60, workerAgeSec: 30, dbLatencyMs: 1,
      },
    ],
    config: { snapshotIntervalMs: 300_000, retentionDays: 14 },
    ...over,
  }
}

afterEach(() => vi.useRealTimers())

describe("MetricsDashboard", () => {
  it("renders the KPI strip, queues, charts and slow routes", async () => {
    stubFetch([{ match: URL, method: "GET", respond: () => jsonResponse(payload()) }])
    renderWithProviders(<MetricsDashboard />)
    await screen.findByText(t.metricsSlowRoutes)
    const kpis = screen.getByLabelText(t.metricsTitle, { selector: "dl" })
    expect(kpis).toHaveTextContent("3h 5m")
    expect(kpis).toHaveTextContent("40")
    expect(kpis).toHaveTextContent("2.0%")
    expect(kpis).toHaveTextContent("1.5 s")
    expect(kpis).toHaveTextContent(t.metricsWorkerStale)
    expect(kpis).toHaveTextContent("1 ms")

    const ai = screen.getByRole("region", { name: t.metricsAiQueue })
    expect(ai).toHaveTextContent("1 / 1")
    expect(ai).toHaveTextContent("2.5 s")
    expect(screen.getByRole("region", { name: t.metricsTranslationBacklog })).toHaveTextContent("17")

    expect(screen.getByRole("img", { name: t.metricsTrafficChart })).toBeInTheDocument()
    const routes = within(screen.getByRole("region", { name: t.metricsSlowRoutes })).getAllByRole("row")
    expect(routes[1]).toHaveTextContent("/api/projects/:id/chat")
    expect(routes[1]).toHaveTextContent("4.2 s")
  })

  it("explains an empty history and missing sources", async () => {
    const p = payload({ history: [] })
    const current = { ...p.current, ai: { ...p.current.ai, ollama: null, jobs: null }, translation: null, db: { ok: false, latencyMs: null } }
    stubFetch([{ match: URL, method: "GET", respond: () => jsonResponse({ ...p, current }) }])
    renderWithProviders(<MetricsDashboard />)
    expect(await screen.findByText(t.metricsHistoryEmpty)).toBeInTheDocument()
    expect(screen.getByText(t.metricsDbDown)).toBeInTheDocument()
    expect(screen.getByRole("region", { name: t.metricsAiQueue })).toHaveTextContent(t.metricsNotAvailable)
  })

  it("refreshes on demand and every 30 s while visible", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const fetchMock = stubFetch([{ match: URL, method: "GET", respond: () => jsonResponse(payload()) }])
    renderWithProviders(<MetricsDashboard />)
    await screen.findByText(t.metricsSlowRoutes)
    const before = fetchMock.mock.calls.length
    await act(async () => {
      vi.advanceTimersByTime(METRICS_REFRESH_MS)
    })
    expect(fetchMock.mock.calls.length).toBe(before + 1)

    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    await user.click(screen.getByRole("button", { name: t.metricsRefresh }))
    expect(fetchMock.mock.calls.length).toBeGreaterThanOrEqual(before + 2)
  })

  it("does not poll while the tab is hidden", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const fetchMock = stubFetch([{ match: URL, method: "GET", respond: () => jsonResponse(payload()) }])
    renderWithProviders(<MetricsDashboard />)
    await screen.findByText(t.metricsSlowRoutes)
    const before = fetchMock.mock.calls.length
    const spy = vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden")
    await act(async () => {
      vi.advanceTimersByTime(METRICS_REFRESH_MS * 2)
    })
    expect(fetchMock.mock.calls.length).toBe(before)
    spy.mockReturnValue("visible")
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"))
    })
    expect(fetchMock.mock.calls.length).toBe(before + 1)
    spy.mockRestore()
  })
})
