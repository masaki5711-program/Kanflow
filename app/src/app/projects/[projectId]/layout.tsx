import { auth } from "@/lib/auth"
import { notFound, redirect } from "next/navigation"
import { accessVia, can, loadProjectActor } from "@/lib/authz"
import { prisma } from "@/lib/prisma"
import { type ProjectType } from "@/lib/project-type-labels"
import { getI18nFor } from "@/lib/translation/hooks"
import { Header } from "@/components/header"
import { Sidebar } from "@/components/sidebar"
import { SidebarDrawerProvider } from "@/components/app-shell/sidebar-drawer"
import { ProjectTitleProvider } from "@/components/app-shell/project-title-context"
import { ProjectLanguageSync } from "./project-language-sync"

export default async function ProjectLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ projectId: string }>
}) {
  const session = await auth()
  if (!session?.user?.id) {
    redirect("/login")
  }

  const { projectId } = await params

  // Existence and access are checked BEFORE anything project-specific is
  // loaded or rendered: a non-viewer gets exactly the same generic 404 as an
  // unknown id (no name / type in the header, sidebar or <title>).
  const [project, actor] = await Promise.all([
    prisma.project.findUnique({
      where: { id: projectId },
      select: { name: true, projectType: true, deletedAt: true, gitIntegration: { select: { enabled: true } } },
    }),
    loadProjectActor(session.user.id, session.user.role ?? "member", projectId),
  ])
  // A trashed project is "not found" for everyone (admins restore it from /admin/trash).
  if (!project || project.deletedAt || !can(actor, "project.view")) notFound()

  const i18nMap = await getI18nFor("project", [projectId])
  // The trash entry is shown only to users who may manage the project trash.
  const showTrash = can(actor, "trash.manage")
  // A section manager who is not a member reads the project only: no team settings, no AI chat (A3-13).
  const showSettings = accessVia(actor) !== "section_manager"
  const showChat = can(actor, "ai.use")
  // Git UI exists only while the project has the integration switched on (default off, so teams without Git never see it).
  // The Git entry follows the project's own integration switch for every type (an equipment project simply has it off).
  const showGit = project.gitIntegration?.enabled ?? false

  const projectType = (project.projectType as ProjectType) ?? "software"
  const projectI18n = i18nMap.get(projectId) ?? {}

  return (
    <ProjectLanguageSync projectType={projectType}>
      <ProjectTitleProvider projectName={project.name} projectI18n={projectI18n}>
      <SidebarDrawerProvider>
        <div className="min-h-screen bg-surface-muted">
          <Header projectName={project.name} projectI18n={projectI18n} projectId={projectId} />
          <div className="flex">
            <Sidebar projectId={projectId} projectName={project.name} projectI18n={projectI18n} showTrash={showTrash} showSettings={showSettings} showChat={showChat} showGit={showGit} />
            <main id="main-content" tabIndex={-1} className="min-w-0 flex-1 overflow-x-auto px-4 py-6 sm:px-6 lg:px-8">{children}</main>
          </div>
        </div>
      </SidebarDrawerProvider>
      </ProjectTitleProvider>
    </ProjectLanguageSync>
  )
}
