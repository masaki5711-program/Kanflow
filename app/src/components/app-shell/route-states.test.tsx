import { describe, expect, it, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import { LanguageProvider } from "@/lib/language-context"
import { getTranslations, type Language } from "@/lib/i18n"
import {
  AppPageSkeleton,
  ChartPageSkeleton,
  NotFoundView,
  ProjectPageSkeleton,
  ReportPageSkeleton,
} from "./route-states"

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}))

const RootLoading = (await import("@/app/loading")).default
const RootNotFound = (await import("@/app/not-found")).default
const ProjectLoading = (await import("@/app/projects/[projectId]/loading")).default
const ProjectNotFound = (await import("@/app/projects/[projectId]/not-found")).default
const BurndownLoading = (await import("@/app/projects/[projectId]/burndown/loading")).default
const ReportLoading = (await import("@/app/projects/[projectId]/report/loading")).default

function renderIn(ui: React.ReactNode, language: Language = "ja") {
  return render(<LanguageProvider initialLanguage={language}>{ui}</LanguageProvider>)
}

describe("page skeletons", () => {
  it.each([
    ["AppPageSkeleton", AppPageSkeleton],
    ["ProjectPageSkeleton", ProjectPageSkeleton],
    ["ChartPageSkeleton", ChartPageSkeleton],
    ["ReportPageSkeleton", ReportPageSkeleton],
  ])("%s is a busy status region with a localized label", (_name, Component) => {
    renderIn(<Component />, "en")
    const regions = screen.getAllByRole("status")
    expect(regions[0]).toHaveAttribute("aria-busy", "true")
    expect(regions[0]).toHaveTextContent(getTranslations("en").loading)
  })

  it.each([
    ["root", RootLoading],
    ["project", ProjectLoading],
    ["burndown", BurndownLoading],
    ["report", ReportLoading],
  ])("%s loading.tsx renders a skeleton", (_name, Loading) => {
    renderIn(<Loading />, "id")
    expect(screen.getAllByRole("status")[0]).toHaveTextContent(getTranslations("id").loading)
  })

  it("the app skeleton uses the wide page width", () => {
    renderIn(<AppPageSkeleton />)
    expect(screen.getAllByRole("status")[0]).toHaveClass("page-wide")
  })
})

describe("NotFoundView", () => {
  it("renders the generic 404 in the user's language with a link to the project list", () => {
    const t = getTranslations("en")
    renderIn(<NotFoundView />, "en")
    expect(screen.getByRole("heading", { level: 1, name: t.notFoundTitle })).toBeInTheDocument()
    expect(screen.getByText(t.notFoundMessage)).toBeInTheDocument()
    expect(screen.getByRole("link", { name: t.notFoundBackToProjects })).toHaveAttribute("href", "/")
  })

  it("root not-found.tsx is a main landmark with the generic message", () => {
    const t = getTranslations("ja")
    renderIn(<RootNotFound />)
    expect(screen.getByRole("main")).toHaveAttribute("id", "main-content")
    expect(screen.getByRole("heading", { name: t.notFoundTitle })).toBeInTheDocument()
  })

  it("project not-found.tsx explains the project is missing or not accessible", () => {
    const t = getTranslations("id")
    renderIn(<ProjectNotFound />, "id")
    expect(screen.getByRole("heading", { name: t.notFoundProjectTitle })).toBeInTheDocument()
    expect(screen.getByText(t.notFoundProjectMessage)).toBeInTheDocument()
    expect(screen.getByRole("link", { name: t.notFoundBackToProjects })).toHaveAttribute("href", "/")
  })
})
