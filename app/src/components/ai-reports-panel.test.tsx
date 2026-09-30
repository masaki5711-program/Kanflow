import { describe, expect, it, vi } from "vitest"
import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { getTranslations } from "@/lib/i18n"

const reports = vi.hoisted(() => [
  { id: "r3", trigger: "surveillance", status: "done", title: "Newest", summary: "s3", body: "b3", structured: null, createdAt: "2026-09-23T06:30:00Z" },
  { id: "r2", trigger: "surveillance", status: "done", title: "Older A", summary: "s2", body: "b2", structured: null, createdAt: "2026-09-22T06:30:00Z" },
  { id: "r1", trigger: "sprint_completed", status: "done", title: "Older B", summary: "s1", body: "b1", structured: null, createdAt: "2026-09-21T06:30:00Z" },
])

vi.mock("@/hooks", () => ({ useApiQuery: () => ({ data: reports }) }))
vi.mock("@/lib/language-context", async () => {
  const { getTranslations: get } = await import("@/lib/i18n")
  return { useLanguage: () => ({ t: get("ja"), language: "ja" }) }
})
vi.mock("@/components/structured-report-document", () => ({ ReportDocument: () => null, parseStructured: () => null }))

const { default: AiReportsPanel } = await import("./ai-reports-panel")
const t = getTranslations("ja")

describe("AiReportsPanel", () => {
  it("marks only the newest report as latest and collapses older ones by default", async () => {
    render(<AiReportsPanel projectId="p1" />)

    expect(screen.getAllByText(t.aiReportLatest)).toHaveLength(1)
    const newest = screen.getByText("Newest").closest("li") as HTMLElement
    expect(within(newest).getByText(t.aiReportLatest)).toBeInTheDocument()
    expect(screen.queryByText("Older A")).not.toBeInTheDocument()

    const toggle = screen.getByRole("button", { name: t.aiReportOlderShow.replace("{count}", "2") })
    expect(toggle).toHaveAttribute("aria-expanded", "false")
    await userEvent.click(toggle)

    expect(toggle).toHaveAttribute("aria-expanded", "true")
    expect(toggle).toHaveTextContent(t.aiReportOlderHide)
    const older = screen.getByText("Older A").closest("li") as HTMLElement
    expect(within(older).queryByText(t.aiReportLatest)).not.toBeInTheDocument()
    expect(screen.getByText("Older B")).toBeInTheDocument()
    expect(screen.getAllByText(t.aiReportLatest)).toHaveLength(1)
  })
})
