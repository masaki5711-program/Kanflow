import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { notFound, redirect } from "next/navigation"
import { PlanContent } from "./plan-content"
import { buildPageMetadata } from "@/app/page-metadata"

export async function generateMetadata({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params
  return buildPageMetadata(({ t }) => t.planTitle, projectId)
}

export default async function PlanPage({
  params,
}: {
  params: Promise<{ projectId: string }>
}) {
  const session = await auth()
  if (!session?.user?.id) redirect("/login")

  const { projectId } = await params

  const membership = await prisma.projectMember.findFirst({
    where: { projectId, userId: session.user.id },
  })
  if (!membership) {
    if (session.user.role === "admin") {
      // proceed
    } else if (session.user.role === "section_manager") {
      const project = await prisma.project.findUnique({
        where: { id: projectId },
        select: { sections: { select: { sectionId: true } } },
      })
      const projectSectionIds = project?.sections.map((s) => s.sectionId) ?? []
      if (projectSectionIds.length === 0) notFound()
      const overlap = await prisma.userSection.findFirst({
        where: { userId: session.user.id, sectionId: { in: projectSectionIds } },
        select: { sectionId: true },
      })
      if (!overlap) notFound()
    } else {
      notFound()
    }
  }

  const canEdit =
    session.user.role === "admin" ||
    membership?.role === "po" ||
    membership?.role === "sm"

  return <PlanContent projectId={projectId} canEdit={canEdit} />
}
