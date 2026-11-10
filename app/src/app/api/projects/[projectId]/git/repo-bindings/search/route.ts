import { requireProject } from "@/lib/authz"
import { jsonResponse, toHttpResponse } from "@/services/_shared"
import { searchBindableRepositories } from "@/services/git/repo-bindings.service"

type Params = { params: Promise<{ projectId: string }> }

/** X3: `?q=` → GitStation repositories the signed-in person may bind (read as the person, no assertion). */
export async function GET(request: Request, { params }: Params) {
  const { projectId } = await params
  const gate = await requireProject(projectId, "git.bindRepository")
  if ("error" in gate) return gate.error
  try {
    const q = new URL(request.url).searchParams.get("q") ?? ""
    return jsonResponse(await searchBindableRepositories(projectId, gate.actor.userId, q))
  } catch (error) {
    return toHttpResponse(error, { fallback: "リポジトリを検索できませんでした", context: "Git repository bindings search" })
  }
}
