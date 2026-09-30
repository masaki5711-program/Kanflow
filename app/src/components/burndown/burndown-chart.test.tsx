import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import BurndownChart from "../burndown-chart"
import BurndownSvg from "./burndown-svg"
import type { BurndownData } from "./burndown-geometry"
import { jsonResponse, renderWithProviders } from "../__tests__/helpers"
import { getTranslations } from "@/lib/i18n"

const t = getTranslations("en")

function localDay(offset: number): string {
  const d = new Date()
  d.setDate(d.getDate() + offset)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}

const DATA: BurndownData = {
  days: [localDay(-3), localDay(-2), localDay(-1), localDay(0), localDay(1)],
  totalTasks: 10,
  idealLine: [10, 7.5, 5, 2.5, 0],
  planLine: [10, 8, 6, 4, 2],
  actualLine: [null, 9, 7, 6, null],
  actualBaseline: 10,
  sprintMarkers: [
    { id: "s1", name: "Sprint 1", status: "active", startIndex: 0, endIndex: 3, taskCount: 6, doneCount: 2 },
    { id: "s2", name: "Sprint 2", status: "mystery", startIndex: 3, endIndex: -1, taskCount: 4, doneCount: 0 },
    { id: "s3", name: "Off chart", status: "done", startIndex: -1, endIndex: -1, taskCount: 1, doneCount: 1 },
  ],
}

let response: () => Response
let requests = 0

beforeEach(() => {
  requests = 0
  response = () => jsonResponse(DATA)
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => {
      requests += 1
      return response()
    }),
  )
})
afterEach(() => {
  vi.unstubAllGlobals()
})

describe("BurndownChart", () => {
  it("renders an accessible chart with legend, sprint markers and today line", async () => {
    renderWithProviders(<BurndownChart projectId="p1" />)
    const img = await screen.findByRole("img", {
      name: t.burndownChartLabel.replace("{total}", "10").replace("{remaining}", "6"),
    })
    expect(img).toBeInTheDocument()
    expect(screen.getByRole("region", { name: t.burndownTitle })).toBeInTheDocument()
    expect(screen.getByRole("region", { name: t.burndownScrollRegion })).toHaveAttribute("tabindex", "0")
    expect(screen.getByText(t.burndownTotal.replace("{count}", "10"))).toBeInTheDocument()
    expect(screen.getByText(`2/6${t.burndownCompleted}`)).toBeInTheDocument()
    expect(screen.getByText(t.burndownToday)).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: t.burndownRefresh })).not.toBeInTheDocument()
  })

  it("requests the per-sprint burndown when a sprint is given", async () => {
    renderWithProviders(<BurndownChart projectId="p1" sprintId="s 2" />)
    await screen.findByRole("img")
    const fetchMock = vi.mocked(fetch)
    expect(String(fetchMock.mock.calls[0][0])).toBe("/api/projects/p1/burndown?sprintId=s%202")
  })

  it("offers a refresh button on the dedicated page", async () => {
    renderWithProviders(<BurndownChart projectId="p1" refreshable />)
    await userEvent.click(await screen.findByRole("button", { name: t.burndownRefresh }))
    await waitFor(() => expect(requests).toBe(2))
  })

  it("shows an empty state when there is not enough data", async () => {
    response = () => jsonResponse({ ...DATA, days: [localDay(0)] })
    renderWithProviders(<BurndownChart projectId="p1" />)
    expect(await screen.findByText(t.burndownEmpty)).toBeInTheDocument()
    expect(screen.queryByRole("button")).not.toBeInTheDocument()
  })

  it("shows the error with a retry action when loading fails", async () => {
    response = () => jsonResponse({ error: "boom" }, 500)
    renderWithProviders(<BurndownChart projectId="p1" />)
    expect(await screen.findByText(t.error)).toBeInTheDocument()
    expect(screen.getAllByText("boom").length).toBeGreaterThan(0)
    response = () => jsonResponse(DATA)
    await userEvent.click(screen.getByRole("button", { name: t.burndownRefresh }))
    expect(await screen.findByRole("img")).toBeInTheDocument()
  })
})

describe("BurndownSvg", () => {
  it("omits the today marker when today is outside the range and handles no actuals", () => {
    renderWithProviders(
      <BurndownSvg data={{ ...DATA, actualLine: [null, null, null, null, null], sprintMarkers: [] }} todayIndex={-1} label="chart" />,
    )
    expect(screen.getByRole("img", { name: "chart" })).toBeInTheDocument()
    expect(screen.queryByText(t.burndownToday)).not.toBeInTheDocument()
  })
})

describe("BurndownSvg localization (S-05 / S-15d)", () => {
  const FIXED: BurndownData = {
    ...DATA,
    days: ["2026-09-30", "2026-10-01", "2026-10-02", "2026-10-03", "2026-10-04"],
    sprintMarkers: [{ id: "s1", name: "E2E-Sprint-A", status: "active", startIndex: 0, endIndex: 4, taskCount: 6, doneCount: 2 }],
  }

  it.each([
    ["id", "30 Sep", "1 Okt", "E2E-Sprint-A (6 tugas)"],
    ["en", "Sep 30", "Oct 1", "E2E-Sprint-A (6 tasks)"],
    ["ja", "9/30", "10/1", "E2E-Sprint-A (6件)"],
  ] as const)("labels the x axis and the sprint band in %s", (language, first, second, band) => {
    const { container } = renderWithProviders(<BurndownSvg data={FIXED} todayIndex={-1} label="chart" />, language)
    const texts = Array.from(container.querySelectorAll("text")).map((n) => n.textContent)
    expect(texts).toContain(first)
    expect(texts).toContain(second)
    expect(texts).toContain(band)
    expect(texts.some((s) => /item/.test(s ?? ""))).toBe(false)
  })
})
