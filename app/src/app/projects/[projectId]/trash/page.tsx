import { notFound, redirect } from "next/navigation"
import { auth } from "@/lib/auth"
import { can, loadProjectActor } from "@/lib/authz"
import { buildPageMetadata } from "@/app/page-metadata"
import { TrashContent } from "./trash-content"

export async function generateMetadata({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params
  return buildPageMetadata(({ t }) => t.trashTitle, projectId)
}

/**
 * Project trash (PO / SM / admin: "trash.manage"). Everyone else gets 404, like
 * the API. The layout already 404s a trashed project.
 */
export default async function TrashPage({ params }: { params: Promise<{ projectId: string }> }) {
  const session = await auth()
  if (!session?.user?.id) redirect("/login")

  const { projectId } = await params
  const actor = await loadProjectActor(session.user.id, session.user.role ?? "member", projectId)
  if (!can(actor, "trash.manage")) notFound()

  return <TrashContent projectId={projectId} canPurge={can(actor, "trash.purge")} />
}
