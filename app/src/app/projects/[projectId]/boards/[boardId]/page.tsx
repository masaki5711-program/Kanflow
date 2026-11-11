import { notFound, redirect } from "next/navigation"
import { auth } from "@/lib/auth"
import { can, loadProjectActor } from "@/lib/authz"
import { buildPageMetadata } from "@/app/page-metadata"
import { ForbiddenView } from "@/components/app-shell/route-states"
import { BoardEditor } from "./board-editor"

export async function generateMetadata({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params
  return buildPageMetadata(({ t }) => t.wbTitle, projectId)
}

/**
 * One board in the editor (docs/plan/10-board.md). Same gate as the list; whether the board exists in
 * this project and what the user may change is answered by the API when the editor loads it.
 */
export default async function BoardPage({ params }: { params: Promise<{ projectId: string; boardId: string }> }) {
  const session = await auth()
  if (!session?.user?.id) redirect("/login")

  const { projectId, boardId } = await params
  const actor = await loadProjectActor(session.user.id, session.user.role ?? "member", projectId)
  if (!can(actor, "project.view")) notFound()
  if (!can(actor, "board.read")) return <ForbiddenView projectId={projectId} className="py-16" />

  return <BoardEditor projectId={projectId} boardId={boardId} userId={session.user.id} canAddToIcebox={can(actor, "icebox.write")} canDraftPbi={can(actor, "ai.draftPbi") && can(actor, "board.read")} />
}
