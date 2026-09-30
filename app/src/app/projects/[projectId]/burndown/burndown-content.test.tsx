import { describe, expect, it, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import { getTranslations } from "@/lib/i18n"

const chartProps = vi.fn()
vi.mock("@/components/burndown-chart", () => ({
  default: (props: { projectId: string; refreshable?: boolean }) => {
    chartProps(props)
    return <div data-testid="chart" />
  },
}))

const { BurndownPageContent } = await import("./burndown-content")
const t = getTranslations("ja")

describe("BurndownPageContent", () => {
  it("renders the page title and a refreshable chart for the project", () => {
    render(<BurndownPageContent projectId="p1" />)
    expect(screen.getByRole("heading", { level: 1, name: t.burndownPageTitle })).toBeInTheDocument()
    expect(screen.getByTestId("chart")).toBeInTheDocument()
    expect(chartProps).toHaveBeenCalledWith({ projectId: "p1", refreshable: true })
  })
})
