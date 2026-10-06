import { requireProject } from "@/lib/authz"
import { jsonResponse, toHttpResponse } from "@/services/_shared"
import { listKnowledgeRepos } from "@/services/git/repo-search"

type Params = { params: Promise<{ projectId: string }> }

/**
 * Repositories the project AI chat can read (names and index status only —
 * the chat page shows "仕様書リポジトリを参照できます"). Any member who may use
 * the AI ("ai.use") may see them: the AI answers from their content anyway.
 */
export async function GET(_request: Request, { params }: Params) {
  const { projectId } = await params
  const gate = await requireProject(projectId, "ai.use")
  if ("error" in gate) return gate.error
  try {
    const repos = await listKnowledgeRepos(projectId)
    return jsonResponse({
      repositories: repos
        .filter((r) => r.indexedFiles > 0)
        .map((r) => ({ name: r.name, indexedFiles: r.indexedFiles, indexedAt: r.indexedAt?.toISOString() ?? null })),
    })
  } catch (error) {
    return toHttpResponse(error, { fallback: "参照資料の状況を取得できませんでした", context: "Git knowledge GET" })
  }
}
