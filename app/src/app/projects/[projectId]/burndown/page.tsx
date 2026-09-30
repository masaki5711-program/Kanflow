import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { notFound, redirect } from "next/navigation"
import { BurndownPageContent } from "./burndown-content"
import { BURNDOWN_SELECTABLE_STATUSES } from "@/services/sprints/sprints.repository"
import { LIST_LIMITS } from "@/services/_shared/limits"
import { buildPageMetadata } from "@/app/page-metadata"
import { attachI18n } from "@/lib/translation/hooks"

export async function generateMetadata({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params
  return buildPageMetadata(({ t }) => t.burndownPageTitle, projectId)
}

export default async function BurndownPage({
  params,
}: {
  params: Promise<{ projectId: string }>
}) {
  const session = await auth()
  if (!session?.user?.id) redirect("/login")

  const { projectId } = await params

  // Access gate: project member, admin, or section_manager whose sections overlap.
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

  const project = await prisma.project.findUnique({
    where: { id: projectId, deletedAt: null },
    select: { name: true },
  })
  if (!project) notFound()

  // Sprints selectable in the per-sprint burndown (planning has no burn yet; archived ones are grouped in the selector).
  const sprints = await prisma.sprint.findMany({
    where: { projectId, status: { in: [...BURNDOWN_SELECTABLE_STATUSES] } },
    select: { id: true, sprintName: true, status: true },
    orderBy: [{ startDate: "desc" }, { createdAt: "desc" }],
    take: LIST_LIMITS.burndownSprints,
  })

  // Sprint names follow the viewer's language in the selector (cycle 3).
  const withI18n = await attachI18n("sprint", sprints)
  return (
    <BurndownPageContent
      projectId={projectId}
      sprints={withI18n.map((s) => ({ id: s.id, name: s.sprintName, status: s.status, i18n: s.i18n }))}
    />
  )
}
