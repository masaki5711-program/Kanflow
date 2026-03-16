import { auth } from "@/lib/auth"
import { redirect } from "next/navigation"
import { prisma } from "@/lib/prisma"
import { type Language } from "@/lib/i18n"
import { type ProjectType } from "@/lib/project-type-labels"
import { Header } from "@/components/header"
import { Sidebar } from "@/components/sidebar"
import { LanguageProvider } from "@/lib/language-context"

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
    select: { name: true, language: true, projectType: true },
  })

  const language = (project?.language as Language) ?? "ja"
  const projectType = (project?.projectType as ProjectType) ?? "software"

  return (
    <LanguageProvider initialLanguage={language} initialProjectType={projectType}>
      <div className="min-h-screen bg-gray-50/50">
        <Header projectName={project?.name} projectId={projectId} />
        <div className="flex">
          <Sidebar projectId={projectId} />
          <main className="flex-1 min-w-0 overflow-x-auto p-6 max-w-[1200px]">{children}</main>
        </div>
      </div>
    </LanguageProvider>
  )
}
