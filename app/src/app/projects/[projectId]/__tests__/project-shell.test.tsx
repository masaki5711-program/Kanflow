import { beforeEach, describe, expect, it, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import type { ReactElement } from "react"
import { LanguageProvider, useLanguage } from "@/lib/language-context"
import { renderWithProviders, tr } from "@/app/__tests__/test-utils"

const m = vi.hoisted(() => ({
  auth: vi.fn(),
  getI18nFor: vi.fn(),
  findUnique: vi.fn(),
  push: vi.fn(),
  params: { projectId: "p1", attachmentId: "a1" } as Record<string, string>,
}))

vi.mock("@/lib/auth", () => ({ auth: m.auth }))
vi.mock("@/lib/prisma", () => ({ prisma: { project: { findUnique: m.findUnique } } }))
vi.mock("@/lib/translation/hooks", () => ({ getI18nFor: m.getI18nFor }))
vi.mock("next/navigation", () => ({
  redirect: (url: string) => { throw new Error(`REDIRECT:${url}`) },
  useRouter: () => ({ push: m.push }),
  useParams: () => m.params,
}))
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a>,
}))
vi.mock("@/components/header", () => ({
  Header: ({ projectName, projectI18n }: { projectName?: string; projectI18n: unknown }) => <header>{`H:${projectName}:${JSON.stringify(projectI18n)}`}</header>,
}))
vi.mock("@/components/sidebar", () => ({ Sidebar: ({ projectId }: { projectId: string }) => <nav>{`S:${projectId}`}</nav> }))
vi.mock("@/components/app-shell/sidebar-drawer", () => ({ SidebarDrawerProvider: ({ children }: { children: React.ReactNode }) => <>{children}</> }))
vi.mock("@/components/collabora-editor", () => ({
  CollaboraEditor: ({ projectId, attachmentId, onClose }: { projectId: string; attachmentId: string; onClose: () => void }) => (
    <button onClick={onClose}>{`editor ${projectId}/${attachmentId}`}</button>
  ),
}))
// Heavy children of DashboardContent are covered by their own tests.
vi.mock("@/components/ai-reports-panel", () => ({ default: () => <div>ai-reports</div> }))
vi.mock("../dashboard/attachments-section", () => ({ AttachmentsSection: () => <div>attachments</div> }))
vi.mock("../dashboard/dashboard-header", () => ({ DashboardHeader: () => <div>dash-header</div> }))

const { default: ProjectLayout } = await import("../layout")
const { default: ProjectError } = await import("../error")
const { ProjectLanguageSync } = await import("../project-language-sync")
const { DashboardContent } = await import("../dashboard-content")
const { default: EditorPage } = await import("../editor/[attachmentId]/page")

function ProjectTypeProbe() {
  const { projectType } = useLanguage()
  return <span data-testid="ptype">{projectType}</span>
}

describe("ProjectLayout (server)", () => {
  beforeEach(() => vi.clearAllMocks())

  it("redirects to /login without a session", async () => {
    m.auth.mockResolvedValue({ user: {} })
    await expect(ProjectLayout({ children: null, params: Promise.resolve({ projectId: "p1" }) })).rejects.toThrow("REDIRECT:/login")
  })

  it("renders header, sidebar and children and syncs the project type", async () => {
    m.auth.mockResolvedValue({ user: { id: "u1" } })
    m.findUnique.mockResolvedValue({ name: "Proj", projectType: "general" })
    m.getI18nFor.mockResolvedValue(new Map([["p1", { name: { en: "Proj EN" } }]]))
    const el = (await ProjectLayout({ children: <ProjectTypeProbe />, params: Promise.resolve({ projectId: "p1" }) })) as ReactElement
    render(<LanguageProvider>{el}</LanguageProvider>)
    expect(screen.getByRole("banner")).toHaveTextContent('H:Proj:{"name":{"en":"Proj EN"}}')
    expect(screen.getByRole("navigation")).toHaveTextContent("S:p1")
    expect(screen.getByRole("main")).toContainElement(screen.getByTestId("ptype"))
    expect(screen.getByTestId("ptype")).toHaveTextContent("general")
  })

  it("defaults to software when the project is missing", async () => {
    m.auth.mockResolvedValue({ user: { id: "u1" } })
    m.findUnique.mockResolvedValue(null)
    m.getI18nFor.mockResolvedValue(new Map())
    const el = (await ProjectLayout({ children: <ProjectTypeProbe />, params: Promise.resolve({ projectId: "p1" }) })) as ReactElement
    render(<LanguageProvider initialProjectType="general">{el}</LanguageProvider>)
    expect(screen.getByTestId("ptype")).toHaveTextContent("software")
    expect(screen.getByRole("banner")).toHaveTextContent("H:undefined:{}")
  })
})

describe("ProjectLanguageSync", () => {
  it("updates the project type when the prop changes", () => {
    const { rerender } = render(
      <LanguageProvider><ProjectLanguageSync projectType="general"><ProjectTypeProbe /></ProjectLanguageSync></LanguageProvider>,
    )
    expect(screen.getByTestId("ptype")).toHaveTextContent("general")
    rerender(<LanguageProvider><ProjectLanguageSync projectType="software"><ProjectTypeProbe /></ProjectLanguageSync></LanguageProvider>)
    expect(screen.getByTestId("ptype")).toHaveTextContent("software")
  })
})

describe("ProjectError", () => {
  it.each(["ja", "en", "id"] as const)("shows the message, retry and home link (%s)", async (lang) => {
    const t = tr(lang)
    const reset = vi.fn()
    renderWithProviders(<ProjectError error={new Error("Kaboom")} reset={reset} />, { language: lang })
    expect(screen.getByText("Kaboom")).toHaveAttribute("role", "alert")
    expect(screen.getByRole("link", { name: t.errorGoHome })).toHaveAttribute("href", "/")
    await userEvent.click(screen.getByRole("button", { name: t.errorRetry }))
    expect(reset).toHaveBeenCalled()
  })
})

describe("EditorPage", () => {
  it("passes route params and returns to the project on close", async () => {
    render(<EditorPage />)
    await userEvent.click(screen.getByRole("button", { name: "editor p1/a1" }))
    expect(m.push).toHaveBeenCalledWith("/projects/p1")
  })
})

describe("DashboardContent", () => {
  const baseProps = {
    projectId: "p1",
    projectName: "Kanflow",
    projectDescription: "Purpose text",
    productGoals: [],
    folders: [],
    attachments: [],
    iceboxCount: 1,
    backlogCount: 2,
    sprintCount: 3,
    projectProgressPct: 25,
    activeSprint: null,
  }

  it("lets the PO edit progress and shows the sections", () => {
    renderWithProviders(<DashboardContent {...baseProps} currentUserRole="po" />)
    const ja = tr("ja")
    expect(screen.getByRole("heading", { level: 2, name: "Kanflow" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: new RegExp(`${ja.projectProgress}: 25%`) })).toBeInTheDocument()
    expect(screen.getByText("Purpose text")).toBeInTheDocument()
    expect(screen.getByText("dash-header")).toBeInTheDocument()
    expect(screen.getByText("attachments")).toBeInTheDocument()
    expect(screen.getByText(ja.dashboardNoActiveSprint)).toBeInTheDocument()
  })

  it("shows translated project name in English and read-only progress for developers", () => {
    const en = tr("en")
    renderWithProviders(
      <DashboardContent {...baseProps} projectI18n={{ name: { ja: "Kanflow", en: "Kanflow EN" } } as never} currentUserRole="developer" />,
      { language: "en" },
    )
    expect(screen.getByText(en.dashboardProgressSetByPo)).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: new RegExp(en.projectProgress) })).not.toBeInTheDocument()
  })
})
