import { requireProject } from "@/lib/authz"
import { actorFromSession, jsonResponse, toHttpResponse } from "@/services/_shared"
import { removeRepository, updateRepository, updateRepositorySchema } from "@/services/git/git.service"
import { startIndexInBackground } from "@/services/git/repo-index-runner"

type Params = { params: Promise<{ projectId: string; repoId: string }> }

/**
 * Rename, replace / remove the token, or switch "AI の参照資料として使う" and
 * its folder filter `{ name?, token?, aiKnowledge?, aiPathFilter? }` (PO / SM).
 * Switching on (or changing the filter) starts an index pass in the background.
 */
export async function PATCH(request: Request, { params }: Params) {
  const { projectId, repoId } = await params
  const gate = await requireProject(projectId, "git.configure")
  if ("error" in gate) return gate.error
  try {
    const input = updateRepositorySchema.parse(await request.json())
    const { reindex, ...repo } = await updateRepository(projectId, repoId, input, actorFromSession(gate.session))
    // Busy with another repository: the poller picks this one up on its next tick.
    const started = reindex && startIndexInBackground(repoId)
    return jsonResponse(started ? { ...repo, indexing: true } : repo)
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
