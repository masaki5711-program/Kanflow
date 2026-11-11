import { notFound, redirect } from "next/navigation"
import { auth } from "@/lib/auth"
import { can, loadProjectActor } from "@/lib/authz"
import { buildPageMetadata } from "@/app/page-metadata"
import { ForbiddenView } from "@/components/app-shell/route-states"
import { BoardsContent } from "./boards-content"

export async function generateMetadata({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params
  return buildPageMetadata(({ t }) => t.wbTitle, projectId)
}

/**
 * ボード: the project's drawing boards (docs/plan/10-board.md). Everyone who can see the project's
 * content has "board.read"; a viewer without it gets the 403 view, a non-viewer 404 (like the API).
 * What the user may change comes with the list (permissions).
 */
export default async function BoardsPage({ params }: { params: Promise<{ projectId: string }> }) {
  const session = await auth()
  if (!session?.user?.id) redirect("/login")

  const { projectId } = await params
  const actor = await loadProjectActor(session.user.id, session.user.role ?? "member", projectId)
  if (!can(actor, "project.view")) notFound()
  if (!can(actor, "board.read")) return <ForbiddenView projectId={projectId} className="py-16" />

  return <BoardsContent projectId={projectId} />
}
