import { notFound, redirect } from "next/navigation"
import { auth } from "@/lib/auth"
import { can, loadProjectActor } from "@/lib/authz"
import { buildPageMetadata } from "@/app/page-metadata"
import { ForbiddenView } from "@/components/app-shell/route-states"
import { TrashContent } from "./trash-content"

export async function generateMetadata({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params
  return buildPageMetadata(({ t }) => t.trashTitle, projectId)
}

/**
 * Project trash (PO / SM / admin: "trash.manage"). A viewer of the project
 * without that right (Dev, section manager) gets the 403 view, like the API's
 * 403; a non-viewer gets 404 (the layout already 404s them and trashed projects).
 */
export default async function TrashPage({ params }: { params: Promise<{ projectId: string }> }) {
  const session = await auth()
  if (!session?.user?.id) redirect("/login")

  const { projectId } = await params
  const actor = await loadProjectActor(session.user.id, session.user.role ?? "member", projectId)
  if (!can(actor, "project.view")) notFound()
  if (!can(actor, "trash.manage")) return <ForbiddenView projectId={projectId} className="py-16" />

  return <TrashContent projectId={projectId} canPurge={can(actor, "trash.purge")} />
}
