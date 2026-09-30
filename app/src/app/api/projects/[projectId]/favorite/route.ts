import { NextResponse } from "next/server"
import { requireProject } from "@/lib/authz"
import { toHttpResponse } from "@/services/_shared"
import { favoriteProject, unfavoriteProject } from "@/services/projects/projects.service"

type Params = { params: Promise<{ projectId: string }> }

/**
 * Toggle the current user's favorite flag for the project.
 * POST   → favorite (idempotent)
 * DELETE → unfavorite (idempotent)
 */
export async function POST(_request: Request, { params }: Params) {
  const { projectId } = await params
  const gate = await requireProject(projectId, "project.view")
  if ("error" in gate) return gate.error

  try {
    await favoriteProject(gate.session.user.id, projectId)
    return NextResponse.json({ ok: true })
  } catch (error) {
    return toHttpResponse(error, { fallback: "更新に失敗しました", context: "Favorite POST" })
  }
}

export async function DELETE(_request: Request, { params }: Params) {
  const { projectId } = await params
  const gate = await requireProject(projectId, "project.view")
  if ("error" in gate) return gate.error

  try {
    await unfavoriteProject(gate.session.user.id, projectId)
    return NextResponse.json({ ok: true })
  } catch (error) {
    return toHttpResponse(error, { fallback: "更新に失敗しました", context: "Favorite DELETE" })
  }
}
