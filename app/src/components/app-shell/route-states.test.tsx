import { describe, expect, it, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import { LanguageProvider } from "@/lib/language-context"
import { getTranslations, type Language } from "@/lib/i18n"
import {
  AppPageSkeleton,
  ChartPageSkeleton,
  ForbiddenView,
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

const RootLoading = (await import("@/app/(home)/loading")).default
const MeLoading = (await import("@/app/me/loading")).default
const AdminLoading = (await import("@/app/admin/loading")).default
const PortfolioLoading = (await import("@/app/portfolio/loading")).default
const SettingsLoading = (await import("@/app/settings/loading")).default
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
    ["home", RootLoading],
    ["me", MeLoading],
    ["admin", AdminLoading],
    ["portfolio", PortfolioLoading],
    ["settings", SettingsLoading],
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

describe("ForbiddenView", () => {
  it.each(["ja", "en", "id"] as const)("renders a localized 403 (%s) with a link back to the project", (lang) => {
    const t = getTranslations(lang)
    renderIn(<ForbiddenView projectId="p1" />, lang)
    expect(screen.getByText("403")).toBeInTheDocument()
    expect(screen.getByRole("heading", { level: 1, name: t.forbiddenTitle })).toBeInTheDocument()
    expect(screen.getByText(t.forbiddenMessage)).toBeInTheDocument()
    expect(screen.getByRole("link", { name: t.forbiddenBackToProject })).toHaveAttribute("href", "/projects/p1")
    // Not the misleading "project not found" text.
    expect(screen.queryByText(t.notFoundProjectTitle)).not.toBeInTheDocument()
  })

  it("links to the project list outside a project", () => {
    const t = getTranslations("ja")
    renderIn(<ForbiddenView />)
    expect(screen.getByRole("heading", { name: "権限がありません" })).toBeInTheDocument()
    expect(screen.getByRole("link", { name: t.notFoundBackToProjects })).toHaveAttribute("href", "/")
  })
})
