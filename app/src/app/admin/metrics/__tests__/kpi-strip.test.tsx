import { describe, expect, it, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import { getTranslations } from "@/lib/i18n"
import type { MetricsCurrent } from "../metrics-format"

vi.mock("@/lib/language-context", async () => {
  const { getTranslations: get } = await import("@/lib/i18n")
  return { useLanguage: () => ({ t: get("ja"), language: "ja" }) }
})
vi.mock("../metrics-charts", () => ({ DANGER_COLOR: "red", WARNING_COLOR: "orange", MetricsLineChart: () => null }))

const { KpiStrip, WORKER_BADGE_CLASS } = await import("../metrics-dashboard")
const t = getTranslations("ja")

const window5m = { minutes: 5, count: 10, errors: 0, errorRate: 0, perMinute: 2, p50: 10, p95: 20 }
const current: MetricsCurrent = {
  takenAt: "2026-09-30T00:00:00Z",
  process: { pid: 1, uptimeSec: 60, rssMb: 100, heapUsedMb: 50 },
  http: { last5m: window5m, last60m: { ...window5m, minutes: 60 }, totals: { count: 10, errors: 0 }, routes: [] },
  ai: { gate: { highActive: 0, backgroundActive: 0 }, ollama: null, wait5m: { count: 0, p50: null, p95: null, maxMs: 0 }, jobs: null },
  translation: null,
  worker: { status: "absent", heartbeatAgeSec: null, expected: false },
  db: { ok: true, latencyMs: 3 },
}

describe("KpiStrip at narrow widths (A4-03)", () => {
  it("lets the long in-process worker label wrap instead of overflowing its tile", () => {
    render(<KpiStrip current={current} />)

    const badge = screen.getByText(t.metricsWorkerInProcess)
    expect(badge.className).toContain("whitespace-normal")
    expect(badge.className).not.toContain("whitespace-nowrap")
    expect(badge.className).toContain("max-w-full")
    expect(WORKER_BADGE_CLASS).toContain("break-words")
  })

  it("lets every KPI tile shrink below its content width (grid min-w-0)", () => {
    const { container } = render(<KpiStrip current={current} />)

    const tiles = container.querySelectorAll("dl > div")
    expect(tiles.length).toBe(6)
    tiles.forEach((tile) => expect(tile.className).toContain("min-w-0"))
  })
})
