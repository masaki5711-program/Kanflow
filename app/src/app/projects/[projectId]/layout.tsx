import { auth } from "@/lib/auth"
import { redirect } from "next/navigation"
import { prisma } from "@/lib/prisma"
import { type ProjectType } from "@/lib/project-type-labels"
import { Header } from "@/components/header"
import { Sidebar } from "@/components/sidebar"
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

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { name: true, projectType: true },
  })

  const projectType = (project?.projectType as ProjectType) ?? "software"

  return (
    <ProjectLanguageSync projectType={projectType}>
      <div className="min-h-screen bg-gray-50/50">
        <Header projectName={project?.name} projectId={projectId} />
        <div className="flex">
          <Sidebar projectId={projectId} />
          <main className="flex-1 min-w-0 overflow-x-auto p-6 lg:p-8">
            <div className="rounded-xl bg-white/40 shadow-sm shadow-gray-200/30 ring-1 ring-gray-100/50 p-6">
              {children}
            </div>
          </main>
        </div>
      </div>
    </ProjectLanguageSync>
  )
}
