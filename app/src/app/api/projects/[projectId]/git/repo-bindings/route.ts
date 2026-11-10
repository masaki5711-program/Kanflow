import { requireProject } from "@/lib/authz"
import { jsonResponse, toHttpResponse } from "@/services/_shared"
import { getRepositoryBindings } from "@/services/git/repo-bindings.service"

type Params = { params: Promise<{ projectId: string }> }

/**
 * X3: the GitStation repositories bound to this project (read by the integration's service account), each with
 * whether Kanflow's repository list reads it; `{ supported: false, reason }` when the project does not read GitStation.
 */
export async function GET(_request: Request, { params }: Params) {
  const { projectId } = await params
  const gate = await requireProject(projectId, "git.bindRepository")
  if ("error" in gate) return gate.error
  try {
    return jsonResponse(await getRepositoryBindings(projectId, gate.actor.userId))
  } catch (error) {
    return toHttpResponse(error, { fallback: "リポジトリの結びつけを読み込めませんでした", context: "Git repository bindings GET" })
  }
}
