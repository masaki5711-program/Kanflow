import { requireProject } from "@/lib/authz"
import { actorFromSession, jsonResponse, toHttpResponse } from "@/services/_shared"
import { removeRepository, updateRepository, updateRepositorySchema } from "@/services/git/git.service"

type Params = { params: Promise<{ projectId: string; repoId: string }> }

/** Rename, or replace / remove the token of this repository `{ name?, token? }`. */
export async function PATCH(request: Request, { params }: Params) {
  const { projectId, repoId } = await params
  const gate = await requireProject(projectId, "git.configure")
  if ("error" in gate) return gate.error
  try {
    const input = updateRepositorySchema.parse(await request.json())
    return jsonResponse(await updateRepository(projectId, repoId, input))
  } catch (error) {
    return toHttpResponse(error, { fallback: "更新に失敗しました", context: "Git repository PATCH" })
  }
}

/** Remove the repository and its links. */
export async function DELETE(_request: Request, { params }: Params) {
  const { projectId, repoId } = await params
  const gate = await requireProject(projectId, "git.configure")
  if ("error" in gate) return gate.error
  try {
    await removeRepository(projectId, repoId, actorFromSession(gate.session))
    return jsonResponse({ ok: true })
  } catch (error) {
    return toHttpResponse(error, { fallback: "削除に失敗しました", context: "Git repository DELETE" })
  }
}
