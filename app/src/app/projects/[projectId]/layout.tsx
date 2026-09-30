import { auth } from "@/lib/auth"
import { redirect } from "next/navigation"
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

  const [project, i18nMap] = await Promise.all([
    prisma.project.findUnique({
      where: { id: projectId },
      select: { name: true, projectType: true },
    }),
    getI18nFor("project", [projectId]),
  ])

  const projectType = (project?.projectType as ProjectType) ?? "software"
  const projectI18n = i18nMap.get(projectId) ?? {}

  return (
    <ProjectLanguageSync projectType={projectType}>
      <ProjectTitleProvider projectName={project?.name} projectI18n={projectI18n}>
      <SidebarDrawerProvider>
        <div className="min-h-screen bg-surface-muted">
          <Header projectName={project?.name} projectI18n={projectI18n} projectId={projectId} />
          <div className="flex">
            <Sidebar projectId={projectId} projectName={project?.name} projectI18n={projectI18n} />
            <main id="main-content" tabIndex={-1} className="min-w-0 flex-1 overflow-x-auto px-4 py-6 sm:px-6 lg:px-8">{children}</main>
          </div>
        </div>
      </SidebarDrawerProvider>
      </ProjectTitleProvider>
    </ProjectLanguageSync>
  )
}
