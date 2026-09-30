import { beforeEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import type { ReactElement } from "react"
import { LanguageProvider, useLanguage } from "@/lib/language-context"
import { renderWithProviders, tr } from "@/app/__tests__/test-utils"

const m = vi.hoisted(() => ({
  auth: vi.fn(),
  getI18nFor: vi.fn(),
  findUnique: vi.fn(),
  loadProjectActor: vi.fn(),
  push: vi.fn(),
  params: { projectId: "p1", attachmentId: "a1" } as Record<string, string>,
}))

vi.mock("@/lib/auth", () => ({ auth: m.auth }))
vi.mock("@/lib/prisma", () => ({ prisma: { project: { findUnique: m.findUnique } } }))
vi.mock("@/lib/translation/hooks", () => ({ getI18nFor: m.getI18nFor }))
vi.mock("@/lib/authz", async () => ({
  ...(await vi.importActual<typeof import("@/lib/authz/policy")>("@/lib/authz/policy")),
  loadProjectActor: m.loadProjectActor,
}))
vi.mock("next/navigation", () => ({
  redirect: (url: string) => { throw new Error(`REDIRECT:${url}`) },
  notFound: () => { throw new Error("NOT_FOUND") },
  useRouter: () => ({ push: m.push }),
  useParams: () => m.params,
}))
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a>,
}))
vi.mock("@/components/header", () => ({
  Header: ({ projectName, projectI18n }: { projectName?: string; projectI18n: unknown }) => <header>{`H:${projectName}:${JSON.stringify(projectI18n)}`}</header>,
}))
vi.mock("@/components/sidebar", () => ({
  Sidebar: ({ projectId, showTrash }: { projectId: string; showTrash?: boolean }) => <nav>{`S:${projectId}:trash=${String(showTrash)}`}</nav>,
}))
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

const actorOf = (projectRole: string | null) => ({ userId: "u1", systemRole: "member", projectRole, isSectionManagerOfProject: false })

describe("ProjectLayout (server)", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    m.loadProjectActor.mockResolvedValue(actorOf("dev"))
  })

  it("redirects to /login without a session", async () => {
    m.auth.mockResolvedValue({ user: {} })
    await expect(ProjectLayout({ children: null, params: Promise.resolve({ projectId: "p1" }) })).rejects.toThrow("REDIRECT:/login")
  })

  it("renders header, sidebar and children and syncs the project type", async () => {
    m.auth.mockResolvedValue({ user: { id: "u1" } })
    m.findUnique.mockResolvedValue({ name: "Proj", projectType: "general", deletedAt: null })
    m.getI18nFor.mockResolvedValue(new Map([["p1", { name: { en: "Proj EN" } }]]))
    const el = (await ProjectLayout({ children: <ProjectTypeProbe />, params: Promise.resolve({ projectId: "p1" }) })) as ReactElement
    render(<LanguageProvider>{el}</LanguageProvider>)
    expect(screen.getByRole("banner")).toHaveTextContent('H:Proj:{"name":{"en":"Proj EN"}}')
    expect(screen.getByRole("navigation")).toHaveTextContent("S:p1:trash=false")
    expect(screen.getByRole("main")).toContainElement(screen.getByTestId("ptype"))
    expect(screen.getByTestId("ptype")).toHaveTextContent("general")
  })

  it("shows the trash entry to users who may manage the trash", async () => {
    m.auth.mockResolvedValue({ user: { id: "u1", role: "member" } })
    m.findUnique.mockResolvedValue({ name: "Proj", projectType: "software", deletedAt: null })
    m.getI18nFor.mockResolvedValue(new Map())
    m.loadProjectActor.mockResolvedValue(actorOf("sm"))
    const el = (await ProjectLayout({ children: null, params: Promise.resolve({ projectId: "p1" }) })) as ReactElement
    render(<LanguageProvider>{el}</LanguageProvider>)
    expect(screen.getByRole("navigation")).toHaveTextContent("S:p1:trash=true")
    expect(m.loadProjectActor).toHaveBeenCalledWith("u1", "member", "p1")
  })

  it("404s a missing project and a project in the trash", async () => {
    m.auth.mockResolvedValue({ user: { id: "u1" } })
    m.getI18nFor.mockResolvedValue(new Map())
    m.findUnique.mockResolvedValue(null)
    await expect(ProjectLayout({ children: null, params: Promise.resolve({ projectId: "p1" }) })).rejects.toThrow("NOT_FOUND")
    m.findUnique.mockResolvedValue({ name: "Old", projectType: "software", deletedAt: new Date() })
    await expect(ProjectLayout({ children: null, params: Promise.resolve({ projectId: "p1" }) })).rejects.toThrow("NOT_FOUND")
  })
})

describe("ProjectLayout access (P-01)", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    m.auth.mockResolvedValue({ user: { id: "u9", role: "member" } })
    m.findUnique.mockResolvedValue({ name: "ZEVA-Link secret", projectType: "software", deletedAt: null })
    m.getI18nFor.mockResolvedValue(new Map([["p1", { name: { en: "ZEVA-Link secret EN" } }]]))
  })

  it("404s a non-member exactly like an unknown id, before loading or rendering the name", async () => {
    m.loadProjectActor.mockResolvedValue(actorOf(null))
    await expect(ProjectLayout({ children: null, params: Promise.resolve({ projectId: "p1" }) })).rejects.toThrow("NOT_FOUND")
    // The project's translated name is never even fetched.
    expect(m.getI18nFor).not.toHaveBeenCalled()
  })

  it("lets a section manager of the project and a system admin in", async () => {
    m.auth.mockResolvedValue({ user: { id: "u9", role: "section_manager" } })
    m.loadProjectActor.mockResolvedValue({ userId: "u9", systemRole: "section_manager", projectRole: null, isSectionManagerOfProject: true })
    const el = (await ProjectLayout({ children: null, params: Promise.resolve({ projectId: "p1" }) })) as ReactElement
    render(<LanguageProvider>{el}</LanguageProvider>)
    expect(screen.getByRole("banner")).toHaveTextContent("ZEVA-Link secret")
    cleanup()

    m.auth.mockResolvedValue({ user: { id: "a1", role: "admin" } })
    m.loadProjectActor.mockResolvedValue({ userId: "a1", systemRole: "admin", projectRole: null, isSectionManagerOfProject: false })
    await expect(ProjectLayout({ children: null, params: Promise.resolve({ projectId: "p1" }) })).resolves.toBeTruthy()
  })

  it("keeps the layout's notFound() outside any root Suspense boundary (real HTTP 404)", async () => {
    const { existsSync } = await import("node:fs")
    const { resolve } = await import("node:path")
    // A root app/loading.tsx would wrap this layout, so notFound() would stream with status 200.
    expect(existsSync(resolve(__dirname, "../../../loading.tsx"))).toBe(false)
    expect(existsSync(resolve(__dirname, "../../loading.tsx"))).toBe(false)
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
    // Top row: sprint pulse, my tasks, coming up; then the feed and counts.
    expect(screen.getByRole("heading", { name: ja.dashboardMyTasksTitle })).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: ja.dashboardDueTitle })).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: ja.dashboardFeedTitle })).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: ja.dashboardOverview })).toBeInTheDocument()
    // The description is reference material: collapsed by default.
    const details = screen.getByText("Purpose text").closest("details")!
    expect(details).not.toHaveAttribute("open")
    expect(within(details).getByText(ja.dashboardProjectDetails)).toBeInTheDocument()
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
